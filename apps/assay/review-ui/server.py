"""Serve the LotI2 prose-review UI. Stdlib only — no workspace entanglement.

    python3 apps/assay/review-ui/server.py [port]

State on disk (the review artifact, consumed after the review):
  state/comments.jsonl — append-only; {"op":"delete","id":…} lines tombstone
  state/reviewed.json  — {slug: bool}
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(ROOT, "state")
COMMENTS = os.path.join(STATE, "comments.jsonl")
REVIEWED = os.path.join(STATE, "reviewed.json")
os.makedirs(STATE, exist_ok=True)


def load_state():
    comments, dead = [], set()
    if os.path.exists(COMMENTS):
        for line in Path(COMMENTS).read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if row.get("op") == "delete":
                dead.add(row["id"])
            else:
                comments.append(row)
    comments = [c for c in comments if c["id"] not in dead]
    reviewed = json.loads(Path(REVIEWED).read_text()) if os.path.exists(REVIEWED) else {}
    return {"comments": comments, "reviewed": reviewed}


class Handler(BaseHTTPRequestHandler):
    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, name, ctype):
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            self.send_error(404)
            return
        body = Path(path).read_bytes()
        self.send_response(200)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._file("index.html", "text/html; charset=utf-8")
        elif self.path == "/data.json":
            self._file("data.json", "application/json")
        elif self.path == "/api/state":
            self._json(load_state())
        else:
            self.send_error(404)

    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        row = json.loads(self.rfile.read(n) or b"{}")
        if self.path == "/api/comment":
            with open(COMMENTS, "a") as f:
                f.write(json.dumps(row) + "\n")
            self._json({"ok": True})
        elif self.path == "/api/comment/delete":
            with open(COMMENTS, "a") as f:
                f.write(json.dumps({"op": "delete", "id": row["id"]}) + "\n")
            self._json({"ok": True})
        elif self.path == "/api/reviewed":
            reviewed = json.loads(Path(REVIEWED).read_text()) if os.path.exists(REVIEWED) else {}
            reviewed[row["slug"]] = bool(row["reviewed"])
            Path(REVIEWED).write_text(json.dumps(reviewed, indent=1))
            self._json({"ok": True})
        else:
            self.send_error(404)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 10390
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"scriptorium serving on http://0.0.0.0:{port}")
    srv.serve_forever()
