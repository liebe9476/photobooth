// printer-usb.js
// WebUSB 전송 모듈 (노트북 테스트용, 나중에 안드로이드에서는 UsbManager로 교체)

const EPSON_VENDOR_ID = 0x04b8;

let device = null;
let endpointOut = null;

export function isConnected() {
  return !!(device && device.opened);
}

export async function connectPrinter() {
  if (!navigator.usb) throw new Error('WebUSB를 지원하지 않는 브라우저입니다.');

  // 반드시 사용자 클릭 이벤트 안에서 호출
  device = await navigator.usb.requestDevice({
    filters: [{ vendorId: EPSON_VENDOR_ID }],
  });

  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);

  for (const iface of device.configuration.interfaces) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find((e) => e.direction === 'out');
      if (out) {
        await device.claimInterface(iface.interfaceNumber);
        if (alt.alternateSetting !== 0) {
          await device.selectAlternateInterface(iface.interfaceNumber, alt.alternateSetting);
        }
        endpointOut = out.endpointNumber;
        return device.productName || 'Epson 프린터';
      }
    }
  }
  await device.close();
  device = null;
  throw new Error('OUT 엔드포인트를 찾지 못했습니다.');
}

export async function sendBytes(bytes, chunkSize = 4096) {
  if (!isConnected()) throw new Error('프린터가 연결되지 않았습니다.');
  for (let off = 0; off < bytes.length; off += chunkSize) {
    const slice = bytes.subarray(off, off + chunkSize);
    const res = await device.transferOut(endpointOut, slice);
    if (res.status !== 'ok') throw new Error('전송 실패: ' + res.status);
  }
}

export async function disconnectPrinter() {
  if (device) {
    try { await device.close(); } catch (_) {}
  }
  device = null;
  endpointOut = null;
}