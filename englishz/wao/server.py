#!/usr/bin/env python3
"""WAO – server nhẹ (chỉ dùng thư viện chuẩn Python 3.8+).

Phục vụ trang web và lưu tiến độ vào file JSON:
    userdata/progress.json          ← dữ liệu chính
    userdata/backups/YYYY-MM-DD.json ← bản sao lưu tự động mỗi ngày (giữ 30 bản)

Chạy:
    python3 server.py                 # http://127.0.0.1:8000
    python3 server.py --port 9000
    python3 server.py --host 0.0.0.0  # cho máy khác / điện thoại trong cùng mạng LAN truy cập
"""
import argparse
import datetime
import http.server
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, 'userdata')
BACKUP_DIR = os.path.join(DATA_DIR, 'backups')
DATA_FILE = os.path.join(DATA_DIR, 'progress.json')
API = '/api/progress'
MAX_BODY = 20 * 1024 * 1024
KEEP_BACKUPS = 30


def read_progress():
    try:
        with open(DATA_FILE, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def write_progress(payload):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    # mỗi ngày giữ một bản sao của dữ liệu cũ trước lần ghi đầu tiên trong ngày
    if os.path.exists(DATA_FILE):
        daily = os.path.join(BACKUP_DIR, datetime.date.today().isoformat() + '.json')
        if not os.path.exists(daily):
            shutil.copy2(DATA_FILE, daily)
            backups = sorted(f for f in os.listdir(BACKUP_DIR) if f.endswith('.json'))
            for old in backups[:-KEEP_BACKUPS]:
                os.remove(os.path.join(BACKUP_DIR, old))
    tmp = DATA_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    os.replace(tmp, DATA_FILE)  # ghi nguyên tử: không bao giờ để lại file hỏng


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def path_only(self):
        return self.path.split('?', 1)[0]

    def do_GET(self):
        p = self.path_only()
        if p == API:
            data = read_progress()
            return self.send_json(200, data if data is not None else {'data': None})
        if p.startswith('/userdata') or p.endswith('.py'):
            return self.send_error(403)
        return super().do_GET()

    def do_HEAD(self):
        if self.path_only().startswith('/userdata'):
            return self.send_error(403)
        return super().do_HEAD()

    def do_PUT(self):
        if self.path_only() != API:
            return self.send_error(404)
        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0 or length > MAX_BODY:
            return self.send_json(413, {'error': 'body size'})
        try:
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
            if not isinstance(payload, dict) or not isinstance(payload.get('data'), dict):
                raise ValueError('missing data')
        except (ValueError, UnicodeDecodeError) as e:
            return self.send_json(400, {'error': str(e)})
        write_progress(payload)
        return self.send_json(200, {'ok': True, 'savedAt': payload['data'].get('savedAt')})

    do_POST = do_PUT  # navigator.sendBeacon dùng POST

    def log_message(self, fmt, *args):
        if API not in str(args[0] if args else ''):
            sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))


def main():
    ap = argparse.ArgumentParser(description='WAO server')
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=8000)
    a = ap.parse_args()
    srv = http.server.ThreadingHTTPServer((a.host, a.port), Handler)
    print(f'WAO đang chạy: http://{"localhost" if a.host in ("127.0.0.1", "0.0.0.0") else a.host}:{a.port}')
    print(f'Tiến độ lưu tại: {DATA_FILE}')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nĐã dừng.')


if __name__ == '__main__':
    main()
