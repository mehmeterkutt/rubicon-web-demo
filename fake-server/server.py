#!/usr/bin/env python3
"""
Fake Rubicon backend for the web demo. Standard library only (Python 3.9 or later); the iOS demo's
file with the browser's additions: the CORS answer of Web HTTP 4 on every response, the preflight,
and the browser's own User-Agent.

  python3 fake-server/server.py [port]      # listens on 0.0.0.0:8080
  The SDK in the demo pages uses http://127.0.0.1:8080; the pages are on another origin, so every SDK
  request is cross-origin and preflighted, as in the field. A device on the same Wi-Fi uses the
  Mac's address.

What the SDK calls
  OPTIONS /v1/...         the preflight: 204 with the CORS answer of Web HTTP 4 (never scripted)
  POST /v1/batch          stores the events and answers as /control says (200 by default)
  GET  /v1/config         remote configuration of the key in `Authorization: Bearer <key>`, from
                          fake-server/config/<key>.json; ETag and 304; 404 when there is no file

What the demo app (or you) calls
  GET  /control                         current behaviour of /v1/batch and the CORS answer
  GET  /control?status=503&retry_after=30&delay_ms=0&mode=normal&cors=on&allow_headers=X-A,X-B
         status         HTTP status of the next batch responses (200, 400, 401, 413, 429, 503, ...)
         retry_after    Retry-After header, in seconds; empty to remove
         delay_ms       wait before answering (slow server, timeouts)
         mode           normal | redirect (302 to /elsewhere) | drop (close without answering)
         cors           on | off: off leaves the CORS headers off every /v1/ answer but the
                        preflight, as a gateway error page without them (the SDK sees a network
                        failure, UPLOAD_FAILED_OPAQUE)
         allow_headers  names added to the preflight's Access-Control-Allow-Headers, for the
                        demo's network.headers; empty to remove
  GET  /control/reset                   back to 200, no delay, normal, CORS on, no extra names
  GET  /control/config?key=K            the remote configuration of key K (404 if none)
  POST /control/config?key=K            body: a JSON object; saved as config/K.json
  DELETE /control/config?key=K          delete it, so /v1/config answers 404
  GET  /events[?since=N]                events received, oldest first, each with its index
  GET  /events/clear                    forget them
  GET  /requests                        the last 200 requests, newest first: method, path, status,
                                        origin, sizes and the headers the SDK sets (never the key
                                        itself, never Referer); preflights included
  ANY  /api/...                         for the app's own calls through createTrackedFetch:
         /api/status/<code>             answers <code>
         /api/slow?ms=N                 answers after N ms
         anything else                  200 with a small JSON body

Every response carries `Access-Control-Allow-Origin: *` and `Access-Control-Expose-Headers`, errors,
404s and the redirect included (Web HTTP 4). A preflight for /v1/ allows exactly the request headers
the contract names plus `allow_headers`, so a header the SDK sends that the backend does not allow
fails as it would in the field; a preflight for the demo's own paths allows what it asks for.
"""
import gzip
import hashlib
import json
import os
import re
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

CONFIG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config")
# What the two mobile SDKs send: rubicon-ios/<version> (iOS <os>) and rubicon-android/<version> (...).
# The web SDK sends no User-Agent of its own (Web HTTP 1): a browser's request has an Origin and the
# browser's own Mozilla/5.0 string.
SDK_USER_AGENT = re.compile(r"^rubicon-(ios|android)/\d+\.\d+\.\d+ \(.+\)$")
BROWSER_USER_AGENT = re.compile(r"^Mozilla/5\.0 ")
MAX_REQUESTS = 200

# The CORS answer of Web HTTP 4.
CORS_ALLOW_METHODS = "POST, GET"
CORS_ALLOW_HEADERS = ["Authorization", "Content-Type", "Content-Encoding", "If-None-Match"]
CORS_EXPOSE_HEADERS = "ETag, Retry-After, X-Request-Id"
CORS_MAX_AGE_SECONDS = 7200
# The demo's own paths (/control, /events, /api) are called with GET, POST and DELETE.
DEMO_ALLOW_METHODS = "GET, POST, PUT, DELETE"
HEADER_NAME = re.compile(r"^[A-Za-z0-9!#$%&'*+.^_`|~-]+$")
MODES = ("normal", "redirect", "drop")


def default_control():
    return {"status": 200, "retry_after": None, "delay_ms": 0, "mode": "normal", "cors": "on", "allow_headers": []}


def config_path(config_dir, key):
    safe = "".join(c for c in key if c.isalnum() or c in "-_.")
    return os.path.join(config_dir, f"{safe or 'default'}.json")


def bearer(headers):
    value = headers.get("Authorization", "")
    return value[7:] if value.startswith("Bearer ") else ""


def header_names(text):
    """Comma-separated header names; None when one is not a valid token (never echoed into a header)."""
    names = [n.strip() for n in (text or "").split(",") if n.strip()]
    return names if all(HEADER_NAME.match(n) for n in names) else None


class FakeBackend(ThreadingHTTPServer):
    """The server and its state, one per instance, so tests run their own on port 0."""

    daemon_threads = True

    def __init__(self, address, config_dir=CONFIG_DIR, verbose=True):
        super().__init__(address, Handler)
        self.config_dir = config_dir
        self.verbose = verbose
        self.lock = threading.Lock()
        self.control = default_control()
        self.received = []  # every event, in arrival order
        self.requests_log = []  # recent requests, newest last
        self.request_count = 0


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # --- helpers ---------------------------------------------------------------------------------

    def _query(self):
        url = urlparse(self.path)
        return url.path, {k: v[0] for k, v in parse_qs(url.query, keep_blank_values=True).items()}

    def _body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b""
        gzipped = self.headers.get("Content-Encoding", "").lower() == "gzip"
        return raw, len(raw), gzipped

    def _cors_headers(self):
        # A /v1/ answer leaves them out only when /control says cors=off; everything else always has them.
        if urlparse(self.path).path.startswith("/v1/") and self._control("cors") == "off":
            return {}
        return {"Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": CORS_EXPOSE_HEADERS}

    def _control(self, name):
        with self.server.lock:
            return self.server.control[name]

    def _send(self, code, body=None, headers=None, raw=None):
        data = raw if raw is not None else (b"" if body is None else json.dumps(body, indent=2).encode())
        self.send_response(code)
        if data:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        for k, v in {**self._cors_headers(), **(headers or {})}.items():
            self.send_header(k, v)
        self.end_headers()
        if data and self.command != "HEAD":
            self.wfile.write(data)
        return code

    def _record(self, status, sent_bytes, gzipped=False, note=""):
        entry = {
            "time": time.strftime("%H:%M:%S"),
            "method": self.command,
            "path": self.path,
            "status": status,
            "origin": self.headers.get("Origin"),
            "bytes": sent_bytes,
            "gzip": gzipped,
            "user_agent": self.headers.get("User-Agent"),
            "authorization": "Bearer ***" if self.headers.get("Authorization") else None,
            "if_none_match": self.headers.get("If-None-Match"),
            "note": note,
        }
        if self.path.startswith("/v1/") and not self._expected_user_agent():
            entry["note"] = (note + "; " if note else "") + "unexpected User-Agent"
        with self.server.lock:
            self.server.requests_log.append(entry)
            del self.server.requests_log[:-MAX_REQUESTS]
        if self.server.verbose:
            print(f"{entry['time']} {self.command} {self.path} -> {status} {entry['note']}", flush=True)

    def _expected_user_agent(self):
        agent = self.headers.get("User-Agent") or ""
        if SDK_USER_AGENT.match(agent):
            return True
        # The web SDK: the browser's own User-Agent on a request that carries an Origin.
        return bool(self.headers.get("Origin")) and bool(BROWSER_USER_AGENT.match(agent))

    def _request_id(self):
        with self.server.lock:
            self.server.request_count += 1
            return f"fake-{self.server.request_count}"

    # --- routes ----------------------------------------------------------------------------------

    def do_OPTIONS(self):
        path, _ = self._query()
        asked_method = self.headers.get("Access-Control-Request-Method", "")
        asked_headers = self.headers.get("Access-Control-Request-Headers", "")
        if path.startswith("/v1/"):
            # Web HTTP 4: a fixed list, never a reflection, so an unlisted header fails here.
            allowed = CORS_ALLOW_HEADERS + self._control("allow_headers")
            headers = {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
                "Access-Control-Allow-Headers": ", ".join(allowed),
                "Access-Control-Max-Age": str(CORS_MAX_AGE_SECONDS),
            }
        else:
            headers = {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": DEMO_ALLOW_METHODS,
                "Access-Control-Max-Age": str(CORS_MAX_AGE_SECONDS),
            }
            names = header_names(asked_headers)
            if names:
                headers["Access-Control-Allow-Headers"] = ", ".join(names)
        note = f"preflight for {asked_method or '?'}"
        if asked_headers:
            note += f" with {asked_headers}"
        self._record(204, 0, note=note)
        self.send_response(204)
        self.send_header("Content-Length", "0")
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()

    def do_GET(self):
        path, q = self._query()
        if path == "/v1/config":
            return self._remote_config()
        if path == "/control":
            return self._set_control(q)
        if path == "/control/reset":
            with self.server.lock:
                self.server.control = default_control()
                snapshot = dict(self.server.control)
            return self._send(200, snapshot)
        if path == "/control/config":
            file = config_path(self.server.config_dir, q.get("key", ""))
            if not os.path.exists(file):
                return self._send(404, {"error": "no remote configuration for this key"})
            with open(file, "rb") as f:
                return self._send(200, raw=f.read())
        if path == "/events":
            try:
                since = int(q.get("since", 0) or 0)
            except ValueError:
                return self._send(400, {"error": "since must be a number"})
            with self.server.lock:
                items = [{"index": i, "event": e} for i, e in enumerate(self.server.received) if i >= since]
            return self._send(200, items)
        if path == "/events/clear":
            with self.server.lock:
                self.server.received.clear()
            return self._send(200, {"cleared": True})
        if path == "/requests":
            with self.server.lock:
                items = list(reversed(self.server.requests_log))
            return self._send(200, items)
        if path.startswith("/api/"):
            return self._api(path, q)
        if path.startswith("/v1/"):
            self._record(404, 0, note="unknown SDK path")
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        path, q = self._query()
        if path == "/v1/batch":
            return self._batch()
        if path == "/control/config":
            raw, _, _ = self._body()
            try:
                value = json.loads(raw.decode("utf-8"))
                assert isinstance(value, dict)
            except Exception:
                return self._send(400, {"error": "the body must be a JSON object"})
            os.makedirs(self.server.config_dir, exist_ok=True)
            with open(config_path(self.server.config_dir, q.get("key", "")), "w") as f:
                json.dump(value, f, indent=2)
            return self._send(200, value)
        if path.startswith("/api/"):
            self._body()
            return self._api(path, q)
        self._body()
        if path.startswith("/v1/"):
            self._record(404, 0, note="unknown SDK path")
        return self._send(404, {"error": "not found"})

    def do_DELETE(self):
        path, q = self._query()
        if path == "/control/config":
            file = config_path(self.server.config_dir, q.get("key", ""))
            if os.path.exists(file):
                os.remove(file)
            return self._send(200, {"deleted": True})
        if path.startswith("/api/"):
            return self._api(path, q)
        return self._send(404, {"error": "not found"})

    do_PUT = do_POST

    # --- endpoints -------------------------------------------------------------------------------

    def _set_control(self, q):
        changes = {}
        try:
            if q.get("status"):
                changes["status"] = int(q["status"])
            if "retry_after" in q:
                changes["retry_after"] = q["retry_after"] or None
            if q.get("delay_ms"):
                changes["delay_ms"] = int(q["delay_ms"])
        except ValueError:
            return self._send(400, {"error": "status and delay_ms must be numbers"})
        if q.get("mode"):
            if q["mode"] not in MODES:
                return self._send(400, {"error": "mode must be normal, redirect or drop"})
            changes["mode"] = q["mode"]
        if q.get("cors"):
            if q["cors"] not in ("on", "off"):
                return self._send(400, {"error": "cors must be on or off"})
            changes["cors"] = q["cors"]
        if "allow_headers" in q:
            names = header_names(q["allow_headers"])
            if names is None:
                return self._send(400, {"error": "allow_headers must be header names separated by commas"})
            changes["allow_headers"] = names
        with self.server.lock:
            self.server.control.update(changes)
            snapshot = dict(self.server.control)
        return self._send(200, snapshot)

    def _batch(self):
        raw, size, gzipped = self._body()
        with self.server.lock:
            c = dict(self.server.control)
        if c["delay_ms"]:
            time.sleep(c["delay_ms"] / 1000)
        if c["mode"] == "drop":
            self._record("dropped", size, gzipped, "connection closed without an answer")
            self.close_connection = True
            try:
                self.connection.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            return
        request_id = {"X-Request-Id": self._request_id()}
        if c["mode"] == "redirect":
            self._record(302, size, gzipped, "redirect")
            return self._send(302, {"error": "moved"}, {"Location": "/elsewhere", **request_id})
        try:
            body = gzip.decompress(raw) if gzipped and raw else raw
            events = json.loads(body.decode("utf-8"))["batch"]
            assert isinstance(events, list)
        except Exception as e:
            self._record(400, size, gzipped, f"unreadable body: {type(e).__name__}")
            return self._send(400, {"error": "unreadable body"}, request_id)
        headers = {"Retry-After": c["retry_after"], **request_id} if c["retry_after"] else request_id
        cors = "" if c["cors"] == "on" else "; CORS headers left out"
        if c["status"] == 200:
            with self.server.lock:
                self.server.received.extend(events)
            names = ", ".join(str(e.get("event") or e.get("name") or e.get("type") or "?") for e in events[:6])
            more = " ..." if len(events) > 6 else ""
            self._record(200, size, gzipped, f"{len(events)} event(s): {names}{more}{cors}")
            return self._send(200, {"ok": True}, request_id)
        self._record(c["status"], size, gzipped, f"forced {c['status']}, {len(events)} event(s) not kept{cors}")
        return self._send(c["status"], {"error": f"forced {c['status']}"}, headers)

    def _remote_config(self):
        file = config_path(self.server.config_dir, bearer(self.headers))
        if not os.path.exists(file):
            self._record(404, 0, note="no remote configuration")
            return self._send(404, {"error": "no remote configuration for this key"})
        with open(file, "rb") as f:
            data = f.read()
        etag = '"' + hashlib.sha1(data).hexdigest()[:16] + '"'
        if self.headers.get("If-None-Match") == etag:
            self._record(304, 0, note=f"unchanged {etag}")
            return self._send(304, headers={"ETag": etag})
        self._record(200, 0, note=f"configuration {etag}")
        return self._send(200, raw=data, headers={"ETag": etag})

    def _api(self, path, q):
        if path.startswith("/api/status/"):
            try:
                code = int(path.rsplit("/", 1)[1] or 200)
            except ValueError:
                code = 400
            self._record(code, 0, note="app call")
            return self._send(code, {"status": code})
        if path == "/api/slow":
            try:
                ms = int(q.get("ms", 3000) or 3000)
            except ValueError:
                ms = 3000
            time.sleep(ms / 1000)
        self._record(200, 0, note="app call")
        return self._send(200, {"ok": True, "path": path, "items": list(range(20))})

    def send_error(self, code, message=None, explain=None):
        # The standard library's own answers (an unknown method, a malformed request) also carry the
        # CORS headers, as every response must (Web HTTP 4).
        self.close_connection = True
        data = json.dumps({"error": message or f"HTTP {code}"}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Expose-Headers", CORS_EXPOSE_HEADERS)
        self.send_header("Connection", "close")
        self.end_headers()
        if getattr(self, "command", None) != "HEAD":
            self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass  # our own lines only


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"Rubicon fake backend on http://0.0.0.0:{port}  (the SDK: http://127.0.0.1:{port})", flush=True)
    print(f"remote configuration files: {CONFIG_DIR}", flush=True)
    FakeBackend(("0.0.0.0", port)).serve_forever()
