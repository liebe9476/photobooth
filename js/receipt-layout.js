// receipt-layout.js
// 576dot(80mm) 영수증 레이아웃을 canvas에 합성
// 미리보기와 인쇄에 동일한 결과물을 사용하므로 화면과 출력물이 일치함

const W = 576;      // 프린터 인쇄 폭(dot)
const PAD = 36;     // 좌우 여백
const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

function dashedLine(g, y) {
  g.save();
  g.strokeStyle = '#000';
  g.lineWidth = 2;
  g.setLineDash([4, 4]);
  g.beginPath();
  g.moveTo(PAD, y);
  g.lineTo(W - PAD, y);
  g.stroke();
  g.restore();
  return y;
}

// 가짜 바코드 (장식용). 매번 다른 패턴을 그림
function drawBarcode(g, x, y, w, h) {
  g.fillStyle = '#000';
  let cx = x;
  while (cx < x + w - 4) {
    const bw = 2 + Math.floor(Math.random() * 4);
    const gap = 2 + Math.floor(Math.random() * 3);
    g.fillRect(cx, y, Math.min(bw, x + w - cx), h);
    cx += bw + gap;
  }
}

function formatDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `DATE: ${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * @param {CanvasImageSource} photo  촬영 canvas 또는 img
 * @param {object} opts              문구 및 날짜 커스터마이즈
 * @returns {HTMLCanvasElement}      합성된 영수증 canvas (높이는 내용에 맞춤)
 */
export function composeReceipt(photo, opts = {}) {
  const {
    date = new Date(),
    title1 = '2026 AI·SW체험',
    title2 = '수피아여고 포토부스',
    thanks = '방문해주셔서 감사합니다!',
    footer = '수피아여자고등학교 AI·SW체험관',
  } = opts;

  const MAX_H = 1400;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = MAX_H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, MAX_H);
  g.fillStyle = '#000';
  g.textAlign = 'center';

  // 헤더
  g.font = `bold 46px ${FONT}`;
  g.fillText(title1, W / 2, PAD + 50);
  g.fillText(title2, W / 2, PAD + 110);
  let y = dashedLine(g, PAD + 135);

  // 사진 (정사각형 중앙 크롭)
  const side = W - PAD * 2 - 40;
  const px = (W - side) / 2;
  const py = y + 22;
  const srcW = photo.naturalWidth || photo.videoWidth || photo.width;
  const srcH = photo.naturalHeight || photo.videoHeight || photo.height;
  const s = Math.min(srcW, srcH);
  g.drawImage(photo, (srcW - s) / 2, (srcH - s) / 2, s, s, px, py, side, side);
  g.strokeStyle = '#000';
  g.lineWidth = 2;
  g.strokeRect(px, py, side, side);

  y = py + side + 30;
  y = dashedLine(g, y) + 36;

  // 날짜
  g.font = `24px ${FONT}`;
  g.fillText(formatDate(date), W / 2, y);
  y += 44;

  // 감사 문구
  g.font = `bold 34px ${FONT}`;
  g.fillText(thanks, W / 2, y);
  y += 56;

  // 바코드
  const bcW = 420;
  drawBarcode(g, (W - bcW) / 2, y, bcW, 70);
  y += 70 + 32;

  // 푸터
  g.font = `18px ${FONT}`;
  g.fillText(footer, W / 2, y);
  y += 30;

  // 실제 내용 높이만큼 잘라내기
  const h = y + PAD;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = h;
  out.getContext('2d').drawImage(c, 0, 0, W, h, 0, 0, W, h);
  return out;
}