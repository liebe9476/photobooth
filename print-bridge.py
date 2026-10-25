# print_bridge.py
# 설치: pip install pywin32
# 실행: python print_bridge.py
# 프린터 이름 지정(선택): set PRINTER_NAME=EPSON TM-m30III
import http.server
import json
import os
import win32print

PORT = 9100
PRINTER = os.environ.get("PRINTER_NAME") or win32print.GetDefaultPrinter()


def raw_print(data: bytes, printer: str):
    """Windows 프린터 드라이버를 거쳐 ESC/POS 원시 데이터 전송 (RAW 모드)"""
    h = win32print.OpenPrinter(printer)
    try:
        win32print.StartDocPrinter(h, 1, ("photobooth", None, "RAW"))
        win32print.StartPagePrinter(h)
        win32print.WritePrinter(h, data)
        win32print.EndPagePrinter(h)
        win32print.EndDocPrinter(h)
    finally:
        win32print.ClosePrinter(h)


class Handler(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # Chrome의 Private Network Access 대응 (https 페이지 → 로컬 요청)
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/ping":
            self._json(200, {"ok": True, "printer": PRINTER})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/print":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(length)
        try:
            raw_print(data, PRINTER)
            self._json(200, {"ok": True})
        except Exception as e:
            self._json(500, {"error": str(e)})


if __name__ == "__main__":
    print(f"프린터: {PRINTER}")
    print(f"브리지 주소: http://127.0.0.1:{PORT}  (종료: Ctrl+C)")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()