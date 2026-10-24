#!/usr/bin/env python3
"""Static server for public/ with a same-origin Prelinger B-roll proxy.

The browser draws archive.org frames into a canvas for the filter stack, so the
video has to be same-origin or the canvas is tainted and posterize/dither/invert
silently do nothing. /broll/<id>/<file> streams from archive.org with Range
pass-through; everything else is the plain static tree.
"""
import os
import re
import sys
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")
UPSTREAM = "https://archive.org/download/"
ID_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,80}$")
FILE_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,140}\.(mp4|ogv)$", re.I)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        pass

    def do_HEAD(self):
        if self.path.startswith("/broll/"):
            return self._proxy(head_only=True)
        return super().do_HEAD()

    def do_GET(self):
        if self.path.startswith("/broll/"):
            return self._proxy()
        return super().do_GET()

    def _proxy(self, head_only=False):
        parts = self.path.split("?")[0].strip("/").split("/")
        if len(parts) != 3:
            self.send_error(400, "bad broll path")
            return
        _, ident, fname = parts
        if not ID_RE.match(ident) or not FILE_RE.match(fname):
            self.send_error(400, "bad broll path")
            return

        url = UPSTREAM + ident + "/" + fname
        req = urllib.request.Request(url, method="HEAD" if head_only else "GET")
        rng = self.headers.get("Range")
        if rng:
            req.add_header("Range", rng)
        req.add_header("User-Agent", "dead-internet-radio/1.0")

        try:
            upstream = urllib.request.urlopen(req, timeout=45)
        except urllib.error.HTTPError as e:
            self.send_error(e.code, "upstream error")
            return
        except Exception:
            self.send_error(502, "upstream unreachable")
            return

        with upstream:
            self.send_response(upstream.status)
            self.send_header("Content-Type", upstream.headers.get("Content-Type", "video/mp4"))
            for header in ("Content-Length", "Content-Range", "Accept-Ranges"):
                value = upstream.headers.get(header)
                if value:
                    self.send_header(header, value)
            self.send_header("Cache-Control", "public, max-age=86400")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            if head_only:
                return
            try:
                while True:
                    chunk = upstream.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3100
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"serving {ROOT} on http://localhost:{port} (with /broll proxy)", flush=True)
    server.serve_forever()
