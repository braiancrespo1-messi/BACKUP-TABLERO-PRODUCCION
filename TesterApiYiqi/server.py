"""
TesterApiYiqi - Proxy Server Local
Resuelve CORS sirviendo archivos estaticos + proxeando requests a YiQi.
Uso: python server.py  ->  http://localhost:8089
"""
import http.server
import json
import os
import urllib.request
import urllib.parse
import urllib.error
import ssl
import mimetypes

PORT = 8089
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

class ProxyHandler(http.server.BaseHTTPRequestHandler):

    def _add_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def do_OPTIONS(self):
        self.send_response(200)
        self._add_cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/proxy/'):
            self._proxy('GET')
        else:
            self._serve_static()

    def do_POST(self):
        if self.path.startswith('/proxy/'):
            self._proxy('POST')
        else:
            self.send_response(405)
            self.end_headers()

    def do_PUT(self):
        if self.path.startswith('/proxy/'):
            self._proxy('PUT')
        else:
            self.send_response(405)
            self.end_headers()

    def do_DELETE(self):
        if self.path.startswith('/proxy/'):
            self._proxy('DELETE')
        else:
            self.send_response(405)
            self.end_headers()

    def _serve_static(self):
        path = self.path.split('?')[0]
        if path == '/': path = '/index.html'
        filepath = os.path.join(STATIC_DIR, path.lstrip('/'))
        filepath = os.path.normpath(filepath)
        if not filepath.startswith(os.path.normpath(STATIC_DIR)):
            self.send_response(403)
            self.end_headers()
            return
        if not os.path.isfile(filepath):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not Found')
            return
        mime, _ = mimetypes.guess_type(filepath)
        if mime is None: mime = 'application/octet-stream'
        with open(filepath, 'rb') as f:
            content = f.read()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', len(content))
        self._add_cors()
        self.end_headers()
        self.wfile.write(content)

    def _proxy(self, method):
        raw = self.path[7:]  # Remove '/proxy/'
        # Fix collapsed double slashes
        if raw.startswith('https:/') and not raw.startswith('https://'):
            raw = 'https://' + raw[7:]
        elif raw.startswith('http:/') and not raw.startswith('http://'):
            raw = 'http://' + raw[6:]
        target_url = raw

        print(f"  PROXY {method} -> {target_url}")

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        fwd_headers = {}
        skip = {'host', 'connection', 'accept-encoding', 'content-length', 'origin', 'referer'}
        for key, val in self.headers.items():
            if key.lower() not in skip:
                fwd_headers[key] = val

        try:
            req = urllib.request.Request(target_url, data=body, headers=fwd_headers, method=method)
            resp = urllib.request.urlopen(req, context=ssl_ctx, timeout=30)
            resp_body = resp.read()
            
            self.send_response(resp.status)
            self._add_cors()
            for key, val in resp.getheaders():
                if key.lower() not in ('transfer-encoding', 'connection', 'content-encoding', 'content-length'):
                    self.send_header(key, val)
            self.send_header('Content-Length', len(resp_body))
            self.end_headers()
            self.wfile.write(resp_body)
            print(f"  -> {resp.status} ({len(resp_body)} bytes)")
        except urllib.error.HTTPError as e:
            resp_body = e.read()
            self.send_response(e.code)
            self._add_cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(resp_body))
            self.end_headers()
            self.wfile.write(resp_body)
            print(f"  -> HTTP {e.code}")
        except Exception as e:
            error_msg = json.dumps({"error": str(e)}).encode()
            self.send_response(502)
            self._add_cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(error_msg))
            self.end_headers()
            self.wfile.write(error_msg)
            print(f"  -> ERROR: {e}")

    def log_message(self, format, *args):
        print(f"  [{self.client_address[0]}] {format % args}")

if __name__ == '__main__':
    print(f">>> TesterApiYiqi Server en http://localhost:{PORT}")
    print(f"    Archivos: {STATIC_DIR}")
    print(f"    Proxy: /proxy/...")
    print()
    server = http.server.HTTPServer(('', PORT), ProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer detenido.")
        server.server_close()
