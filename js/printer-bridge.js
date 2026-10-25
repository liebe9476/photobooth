// print-bridge.js
// 로컬 PC에서 실행 중인 인쇄 브리지(print_bridge.py)와 통신
const BRIDGE = 'http://127.0.0.1:9100';

export async function isBridgeAlive() {
  try {
    const r = await fetch(`${BRIDGE}/ping`, { signal: AbortSignal.timeout(1000) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function sendViaBridge(bytes) {
  const r = await fetch(`${BRIDGE}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: bytes,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `브리지 오류 (${r.status})`);
}