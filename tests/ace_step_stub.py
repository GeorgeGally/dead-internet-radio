#!/usr/bin/env python3
"""Local stub for the ACE-Step API (plus the OpenRouter chat endpoint).

Answers exactly the surface generate.py calls, so render-show.sh's
restart-per-track loop and generate.py's --only-track skip behaviour can be
verified end to end with no model loaded. Serves a short silent MP3 for every
generated track and a plausible voiceover batch for the announcer LLM call.

Usage: python3 tests/ace_step_stub.py [--port N]
Port defaults to ACE_STEP_URL's port, else 8001.
"""
import argparse
import base64
import json
import os
import re
import resource
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

SILENT_MP3 = base64.b64decode("SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAVAAAJWAAhISEhLCwsLCw3Nzc3N0JCQkJCTU1NTVlZWVlZZGRkZGRvb29vb3p6enqFhYWFhZCQkJCQm5ubm5umpqamsrKysrK9vb29vcjIyMjI09PT097e3t7e6enp6en09PT09P////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAYeAAAAAAAACVgKleNOAAAAAAAAAAAAAAAAAAAAAP/7EGQAD/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZCIP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xBkRA/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EGRmD/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZIgP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xBkqg/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EGTMD/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZN2P8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xBk3Y/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EGTdj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZN2P8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xBk3Y/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EGTdj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZN2P8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xBk3Y/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EGTdj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZN2P8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xBk3Y/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EGTdj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZN2P8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xBk3Y/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==")


def rss_mb() -> int:
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # macOS reports bytes, Linux reports kilobytes
    divisor = 1024 * 1024 if sys.platform == "darwin" else 1024
    return rss // divisor


class StubHandler(BaseHTTPRequestHandler):
    task_seq = 0
    lock = threading.Lock()

    def log_message(self, fmt, *args):
        pass

    def _send(self, code, body: bytes, content_type="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> str:
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length).decode() if length else ""

    def do_GET(self):
        print(f"[stub] rss={rss_mb()} MB GET {self.path}", flush=True)
        path = urlparse(self.path).path
        if path == "/health":
            self._send(200, b'{"data": {"status": "ok"}}')
        elif path.startswith("/audio/"):
            self._send(200, SILENT_MP3, content_type="audio/mpeg")
        else:
            self._send(404, b'{"error": "not found"}')

    def do_POST(self):
        print(f"[stub] rss={rss_mb()} MB POST {self.path}", flush=True)
        path = urlparse(self.path).path
        body = self._read_body()
        if path == "/release_task":
            with StubHandler.lock:
                StubHandler.task_seq += 1
                task_id = f"stub-{StubHandler.task_seq}"
            self._send(200, json.dumps({"data": {"task_id": task_id}}).encode())
        elif path == "/query_result":
            task_id = json.loads(body)["task_id_list"][0]
            result = json.dumps([{"file": f"/audio/{task_id}.mp3"}])
            payload = {
                "data": [{"task_id": task_id, "status": 1, "result": result}]
            }
            self._send(200, json.dumps(payload).encode())
        elif path == "/api/v1/chat/completions":
            nums = [int(n) for n in re.findall(r"after track (\d+)", body)]
            voiceovers = [
                {"track_number": n, "type": "TRACK_INTRO",
                 "text": "This is Dead Internet Radio."}
                for n in nums
            ]
            content = json.dumps(voiceovers)
            payload = {"choices": [{"message": {"content": content}}]}
            self._send(200, json.dumps(payload).encode())
        else:
            self._send(404, b'{"error": "not found"}')


def main():
    parser = argparse.ArgumentParser(description="Stub ACE-Step + OpenRouter API")
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    port = args.port
    if not port:
        ace_url = os.getenv("ACE_STEP_URL", "http://localhost:8001")
        port = int(ace_url.rsplit(":", 1)[1].rstrip("/") or 8001)
    server = ThreadingHTTPServer(("127.0.0.1", port), StubHandler)
    print(f"[stub] rss={rss_mb()} MB listening on {port} (no model loaded)", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
