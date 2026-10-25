// printer-raster.js
// TM-m30III(80mm, 203dpi) 기준 고품질 래스터 인쇄 모듈

export const PAPER_DOTS = 576;

export const DEFAULT_OPTIONS = {
  width: PAPER_DOTS,
  dithering: 'atkinson',  // 'atkinson' | 'floyd' | 'bayer'
  contrast: 1.25,
  gamma: 0.9,
  density: 0x0a,          // DC2 # n : 농도 (매뉴얼 범위 확인 필요)
  heat: [120, 120, 2],    // ESC 7 n1 n2 n3 : 발열 파라미터 (예시값)
  chunkRows: 128,
  feedLines: 4,
};

// 1) 원본 → 576px 그레이스케일
export function toGrayscale(source, opts = {}) {
  const { width, contrast, gamma } = { ...DEFAULT_OPTIONS, ...opts };

  const srcW = source.naturalWidth || source.videoWidth || source.width;
  const srcH = source.naturalHeight || source.videoHeight || source.height;
  const height = Math.round((srcH * width) / srcW);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  const { data } = ctx.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);

  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  // 자동 레벨 보정 (하위/상위 1% 기준)
  const sorted = Float32Array.from(gray).sort();
  const lo = sorted[Math.floor(sorted.length * 0.01)];
  const hi = sorted[Math.floor(sorted.length * 0.99)] || 255;
  const range = Math.max(1, hi - lo);

  for (let i = 0; i < gray.length; i++) {
    let v = (gray[i] - lo) / range;
    v = Math.min(1, Math.max(0, v));
    v = Math.pow(v, gamma);
    v = (v - 0.5) * contrast + 0.5;
    gray[i] = Math.min(1, Math.max(0, v)) * 255;
  }

  return { gray, width, height };
}

// 2) 디더링 → 1비트 (1 = 검정)
export function dither(gray, width, height, method = 'atkinson') {
  const out = new Uint8Array(width * height);

  if (method === 'bayer') {
    const M = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const t = ((M[(y & 3) * 4 + (x & 3)] + 0.5) / 16) * 255;
        out[i] = gray[i] < t ? 1 : 0;
      }
    }
    return out;
  }

  const img = Float32Array.from(gray);
  const taps = method === 'floyd'
    ? [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]]
    : [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = img[i];
      const nw = old < 128 ? 0 : 255;
      out[i] = nw === 0 ? 1 : 0;
      const err = old - nw;
      for (const [dx, dy, w] of taps) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < width && ny < height) {
          img[ny * width + nx] += err * w;
        }
      }
    }
  }
  return out;
}

// 3) 1비트 → GS v 0 용 행 데이터
function packRows(bits, width, y0, rows) {
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * rows);
  for (let r = 0; r < rows; r++) {
    const y = y0 + r;
    for (let x = 0; x < width; x++) {
      if (bits[y * width + x]) {
        data[r * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return { data, bytesPerRow };
}

// 4) 전체 ESC/POS 바이트 생성
export function buildEscPos(bits, width, height, opts = {}) {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  const parts = [];
  const push = (arr) => parts.push(Uint8Array.from(arr));

  push([0x1b, 0x40]);                                   // ESC @ 초기화
  push([0x12, 0x23, o.density & 0xff]);                 // DC2 # n 농도
  push([0x1b, 0x37, o.heat[0], o.heat[1], o.heat[2]]);  // ESC 7 발열
  push([0x1b, 0x61, 0x01]);                             // ESC a 1 가운데 정렬

  for (let y0 = 0; y0 < height; y0 += o.chunkRows) {
    const rows = Math.min(o.chunkRows, height - y0);
    const { data, bytesPerRow } = packRows(bits, width, y0, rows);
    parts.push(Uint8Array.from([
      0x1d, 0x76, 0x30, 0x00,
      bytesPerRow & 0xff, bytesPerRow >> 8,
      rows & 0xff, rows >> 8,
    ]));
    parts.push(data);
  }

  push([0x1b, 0x64, o.feedLines]);   // ESC d n 용지 이송
  push([0x1d, 0x56, 0x42, 0x00]);    // GS V B 0 커팅 (커터 모델만)

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// 5) 전체 파이프라인
export function renderReceipt(source, opts = {}) {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  const { gray, width, height } = toGrayscale(source, o);
  const bits = dither(gray, width, height, o.dithering);
  return {
    preview: { bits, width, height },
    bytes: buildEscPos(bits, width, height, o),
  };
}

// 6) 미리보기 (실제 출력과 같은 1비트 결과)
export function drawPreview(canvas, bits, width, height) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < bits.length; i++) {
    const v = bits[i] ? 0 : 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}