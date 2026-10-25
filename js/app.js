import { renderReceipt, drawPreview, DEFAULT_OPTIONS } from './printer-raster.js';
import { connectPrinter, sendBytes, isConnected } from './printer-usb.js';
import { composeReceipt } from './receipt-layout.js';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);

const video = $('video');
const shot = $('shot');
const captureBtn = $('captureBtn');
const fullscreenBtn = $('fullscreenBtn');
const statusEl = $('status');

const modal = $('resultModal');
const preview = $('preview');
const printBtn = $('printBtn');
const retryBtn = $('retryBtn');
const printStatus = $('printStatus');

const adminBox = $('admin');
const fileInput = $('fileInput');
const ui = {
  dithering: $('dithering'),
  density: $('density'),
  contrast: $('contrast'),
  gamma: $('gamma'),
};

// ---------- 상태 ----------
let stream = null;
let receiptCanvas = null; // 현재 결과 영수증 (미리보기와 인쇄 모두 사용)

// ---------- 유틸 ----------
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#b91c1c' : '#374151';
}

function setPrintStatus(msg, isError = false) {
  printStatus.textContent = msg;
  printStatus.style.color = isError ? '#fca5a5' : '#94a3b8';
}

function currentOptions() {
  return {
    ...DEFAULT_OPTIONS,
    dithering: ui.dithering.value,
    density: Number(ui.density.value),
    contrast: Number(ui.contrast.value),
    gamma: Number(ui.gamma.value),
  };
}

function syncLabels() {
  $('densityVal').textContent = ui.density.value;
  $('contrastVal').textContent = ui.contrast.value;
  $('gammaVal').textContent = ui.gamma.value;
}

function initSettings() {
  ui.dithering.value = DEFAULT_OPTIONS.dithering;
  ui.density.value = DEFAULT_OPTIONS.density;
  ui.contrast.value = DEFAULT_OPTIONS.contrast;
  ui.gamma.value = DEFAULT_OPTIONS.gamma;
  syncLabels();
}

// ---------- 카메라 ----------
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('이 브라우저는 카메라를 지원하지 않습니다. 관리자 모드에서 파일로 테스트하세요.', true);
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    captureBtn.disabled = false;
    setStatus('');
  } catch (e) {
    console.error(e);
    setStatus('카메라를 열 수 없습니다. 카메라 권한을 확인해 주세요.', true);
  }
}

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
}

// 촬영: 현재 프레임을 좌우 반전하여 저장 후 결과 화면으로 이동
function capturePhoto() {
  if (!video.videoWidth) {
    setStatus('카메라 준비 중입니다. 잠시 후 다시 눌러주세요.', true);
    return;
  }
  shot.width = video.videoWidth;
  shot.height = video.videoHeight;
  const ctx = shot.getContext('2d');
  ctx.save();
  ctx.translate(shot.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, shot.width, shot.height);
  ctx.restore();

  stopCamera();
  openResult(shot);
}

// ---------- 결과 모달 ----------
function openResult(photo) {
  try {
    receiptCanvas = composeReceipt(photo);
  } catch (e) {
    console.error(e);
    setStatus('영수증 생성 중 오류가 발생했습니다.', true);
    return;
  }
  setPrintStatus('');
  printBtn.disabled = false;
  modal.hidden = false;
  updatePreview();
}

// 미리보기: 컬러 영수증을 그대로 표시 (디더링은 인쇄 데이터에만 적용)
function updatePreview() {
  if (!receiptCanvas) return;
  preview.width = receiptCanvas.width;
  preview.height = receiptCanvas.height;
  preview.getContext('2d').drawImage(receiptCanvas, 0, 0);
}

function closeResult() {
  modal.hidden = true;
  receiptCanvas = null;
  setPrintStatus('');
  startCamera();
}

// ---------- 인쇄 ----------
async function handlePrint() {
  if (!receiptCanvas) return;

  printBtn.disabled = true;
  try {
    // 1) 인쇄용 ESC/POS 데이터 생성
    setPrintStatus('인쇄 데이터 생성 중...');
    const { bytes } = renderReceipt(receiptCanvas, currentOptions());

    // 2) 로컬 인쇄 브리지가 켜져 있으면 Windows 프린터 드라이버로 인쇄
    if (await isBridgeAlive()) {
      setPrintStatus('인쇄 중 (로컬 프린터)...');
      await sendViaBridge(bytes);
      setPrintStatus('인쇄를 완료했습니다. 🎉');
      return;
    }

    // 3) 브리지가 없으면 WebUSB로 직접 전송
    if (!isConnected()) {
      setPrintStatus('프린터를 선택해 주세요...');
      const name = await connectPrinter(); // 사용자 클릭 직후 호출되어야 팝업이 뜸
      setPrintStatus(`연결됨: ${name}`);
    }
    setPrintStatus('인쇄 중...');
    await sendBytes(bytes);
    setPrintStatus('인쇄를 완료했습니다. 🎉');
  } catch (e) {
    console.error(e);
    setPrintStatus('인쇄 실패: ' + e.message, true);
  } finally {
    printBtn.disabled = false;
  }
}

// ---------- 전체화면 ----------
fullscreenBtn.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (e) {
    setStatus('전체화면을 사용할 수 없습니다.', true);
  }
});

// ---------- 이벤트 ----------
captureBtn.addEventListener('click', capturePhoto);
retryBtn.addEventListener('click', closeResult);
printBtn.addEventListener('click', handlePrint);

fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    stopCamera();
    openResult(img);
  };
  img.onerror = () => setStatus('이미지를 불러올 수 없습니다.', true);
  img.src = url;
});

// 설정 변경 시 미리보기 즉시 갱신
for (const el of Object.values(ui)) {
  el.addEventListener('input', () => {
    syncLabels();
    updatePreview();
  });
}

// ---------- 시작 ----------
const isAdmin = new URLSearchParams(location.search).has('admin');
adminBox.hidden = !isAdmin;

if (!navigator.usb) {
  setStatus('이 브라우저는 WebUSB를 지원하지 않습니다. Chrome 또는 Edge를 사용하세요.', true);
}
initSettings();
startCamera();
