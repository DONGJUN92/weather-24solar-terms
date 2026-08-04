"""로컬 캡처 수신기 — 브라우저가 래스터화한 PNG를 파일로 받는다.
발표자료용 시각자료를 앱 실물에서 가져오기 위한 일회용 도구다."""
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')
os.makedirs(OUT, exist_ok=True)


class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = (q.get('name') or ['shot'])[0]
        name = ''.join(ch for ch in name if ch.isalnum() or ch in '-_') or 'shot'
        n = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(n)
        path = os.path.join(OUT, name + '.png')
        with open(path, 'wb') as f:
            f.write(data)
        self.send_response(200); self._cors()
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'ok ' + str(len(data)).encode())
        print('saved %s (%d bytes)' % (path, len(data)), flush=True)

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    print('receiver on http://127.0.0.1:%d  -> %s' % (port, OUT), flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
