"""
Tests of the fake backend (step 9.1): a server on a free port per test, its own remote configuration
directory, plain HTTP requests through http.client. Run with
`python3 -m unittest discover -s fake-server` from the repository root (scripts/check.sh).
"""
import gzip
import http.client
import json
import os
import shutil
import tempfile
import threading
import time
import unittest

from server import CORS_EXPOSE_HEADERS, FakeBackend

KEY = "pk_demo"
BROWSER = {
    "Origin": "http://a.rubicon.test:5173",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15",
}
SDK = {**BROWSER, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json; charset=utf-8"}


def batch_body(*names):
    return json.dumps({"sent_at": 1, "batch": [{"type": "track", "event": n} for n in names]}).encode()


class FakeBackendTest(unittest.TestCase):
    def setUp(self):
        self.config_dir = tempfile.mkdtemp(prefix="rubicon-fake-config-")
        self.server = FakeBackend(("127.0.0.1", 0), config_dir=self.config_dir, verbose=False)
        self.thread = threading.Thread(target=self.server.serve_forever, args=(0.02,), daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        shutil.rmtree(self.config_dir, ignore_errors=True)

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=5)
        try:
            conn.request(method, path, body=body, headers=headers or {})
            response = conn.getresponse()
            data = response.read()
            return response, data
        finally:
            conn.close()

    def json(self, method, path, body=None, headers=None):
        response, data = self.request(method, path, body, headers)
        return response, json.loads(data) if data else None

    def assert_cors(self, response):
        self.assertEqual(response.getheader("Access-Control-Allow-Origin"), "*")
        self.assertEqual(response.getheader("Access-Control-Expose-Headers"), CORS_EXPOSE_HEADERS)

    def preflight(self, path, method="POST", headers="authorization,content-type"):
        return self.request(
            "OPTIONS",
            path,
            headers={**BROWSER, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": headers},
        )

    def last_request(self):
        _, items = self.json("GET", "/requests")
        return items[0]


class PreflightTest(FakeBackendTest):
    def test_a_preflight_for_the_sdk_gets_the_answer_of_web_http_4(self):
        for path in ("/v1/batch", "/v1/config"):
            response, data = self.preflight(path)
            self.assertEqual(response.status, 204)
            self.assertEqual(data, b"")
            self.assertEqual(response.getheader("Access-Control-Allow-Origin"), "*")
            self.assertEqual(response.getheader("Access-Control-Allow-Methods"), "POST, GET")
            self.assertEqual(
                response.getheader("Access-Control-Allow-Headers"),
                "Authorization, Content-Type, Content-Encoding, If-None-Match",
            )
            self.assertEqual(response.getheader("Access-Control-Max-Age"), "7200")
            self.assertIsNone(response.getheader("Access-Control-Allow-Credentials"))

    def test_the_sdk_preflight_lists_names_and_never_reflects_what_was_asked(self):
        response, _ = self.preflight("/v1/batch", headers="authorization,x-gateway-token")
        self.assertNotIn("x-gateway-token", response.getheader("Access-Control-Allow-Headers").lower())

    def test_allow_headers_adds_names_for_network_headers_and_reset_removes_them(self):
        response, control = self.json("GET", "/control?allow_headers=X-Gateway-Token,X-Tenant")
        self.assertEqual(control["allow_headers"], ["X-Gateway-Token", "X-Tenant"])
        response, _ = self.preflight("/v1/batch")
        self.assertEqual(
            response.getheader("Access-Control-Allow-Headers"),
            "Authorization, Content-Type, Content-Encoding, If-None-Match, X-Gateway-Token, X-Tenant",
        )
        self.json("GET", "/control/reset")
        response, _ = self.preflight("/v1/batch")
        self.assertNotIn("X-Gateway-Token", response.getheader("Access-Control-Allow-Headers"))

    def test_allow_headers_refuses_a_value_that_is_not_header_names(self):
        response, body = self.json("GET", "/control?allow_headers=X-A%0d%0aSet-Cookie:%20x")
        self.assertEqual(response.status, 400)
        self.assert_cors(response)
        _, control = self.json("GET", "/control")
        self.assertEqual(control["allow_headers"], [])

    def test_a_preflight_for_the_demo_paths_allows_what_it_asks_for(self):
        response, _ = self.preflight("/control/config", method="DELETE", headers="content-type,x-demo")
        self.assertEqual(response.status, 204)
        self.assertEqual(response.getheader("Access-Control-Allow-Origin"), "*")
        self.assertIn("DELETE", response.getheader("Access-Control-Allow-Methods"))
        self.assertEqual(response.getheader("Access-Control-Allow-Headers"), "content-type, x-demo")

    def test_a_preflight_is_recorded_with_what_it_asked_and_never_takes_the_scripted_answer(self):
        self.json("GET", "/control?status=503&mode=drop&cors=off")
        response, _ = self.preflight("/v1/batch")
        self.assertEqual(response.status, 204)
        self.assertEqual(response.getheader("Access-Control-Allow-Origin"), "*")
        entry = self.last_request()
        self.assertEqual(entry["method"], "OPTIONS")
        self.assertEqual(entry["origin"], BROWSER["Origin"])
        self.assertEqual(entry["note"], "preflight for POST with authorization,content-type")


class BatchTest(FakeBackendTest):
    def test_a_plain_batch_is_stored_and_answered_with_cors(self):
        response, body = self.json("POST", "/v1/batch", batch_body("a", "b"), SDK)
        self.assertEqual(response.status, 200)
        self.assertEqual(body, {"ok": True})
        self.assert_cors(response)
        self.assertTrue(response.getheader("X-Request-Id"))
        _, events = self.json("GET", "/events")
        self.assertEqual([e["event"]["event"] for e in events], ["a", "b"])
        self.assertEqual([e["index"] for e in events], [0, 1])

    def test_a_gzip_batch_is_decompressed(self):
        headers = {**SDK, "Content-Encoding": "gzip"}
        response, _ = self.json("POST", "/v1/batch", gzip.compress(batch_body("zipped")), headers)
        self.assertEqual(response.status, 200)
        _, events = self.json("GET", "/events")
        self.assertEqual(events[0]["event"]["event"], "zipped")
        self.assertTrue(self.last_request()["gzip"])

    def test_events_since_and_clear(self):
        self.request("POST", "/v1/batch", batch_body("a", "b", "c"), SDK)
        _, events = self.json("GET", "/events?since=2")
        self.assertEqual([e["index"] for e in events], [2])
        self.json("GET", "/events/clear")
        _, events = self.json("GET", "/events")
        self.assertEqual(events, [])

    def test_an_unreadable_body_is_400_with_cors(self):
        for body, headers in ((b"not json", SDK), (b"not gzip", {**SDK, "Content-Encoding": "gzip"})):
            response, _ = self.json("POST", "/v1/batch", body, headers)
            self.assertEqual(response.status, 400)
            self.assert_cors(response)

    def test_a_forced_status_keeps_nothing_and_carries_cors_and_retry_after(self):
        self.json("GET", "/control?status=429&retry_after=30")
        response, body = self.json("POST", "/v1/batch", batch_body("a"), SDK)
        self.assertEqual(response.status, 429)
        self.assertEqual(response.getheader("Retry-After"), "30")
        self.assert_cors(response)
        _, events = self.json("GET", "/events")
        self.assertEqual(events, [])
        self.assertEqual(self.last_request()["note"], "forced 429, 1 event(s) not kept")

    def test_every_error_status_carries_cors(self):
        for status in (400, 401, 403, 404, 413, 500, 503):
            self.json("GET", f"/control?status={status}")
            response, _ = self.json("POST", "/v1/batch", batch_body("a"), SDK)
            self.assertEqual(response.status, status)
            self.assert_cors(response)

    def test_the_redirect_mode_answers_302_with_cors(self):
        self.json("GET", "/control?mode=redirect")
        response, _ = self.json("POST", "/v1/batch", batch_body("a"), SDK)
        self.assertEqual(response.status, 302)
        self.assertEqual(response.getheader("Location"), "/elsewhere")
        self.assert_cors(response)

    def test_the_drop_mode_closes_the_connection_without_an_answer(self):
        self.json("GET", "/control?mode=drop")
        with self.assertRaises((http.client.RemoteDisconnected, ConnectionResetError, http.client.BadStatusLine)):
            self.request("POST", "/v1/batch", batch_body("a"), SDK)
        self.assertEqual(self.last_request()["status"], "dropped")

    def test_cors_off_leaves_the_headers_off_the_sdk_answers_only(self):
        _, control = self.json("GET", "/control?cors=off&status=503&retry_after=10")
        self.assertEqual(control["cors"], "off")
        response, _ = self.json("POST", "/v1/batch", batch_body("a"), SDK)
        self.assertEqual(response.status, 503)
        self.assertIsNone(response.getheader("Access-Control-Allow-Origin"))
        self.assertIsNone(response.getheader("Access-Control-Expose-Headers"))
        self.assertIn("CORS headers left out", self.last_request()["note"])
        response, _ = self.preflight("/v1/batch")
        self.assertEqual(response.getheader("Access-Control-Allow-Origin"), "*")
        response, _ = self.json("GET", "/control")
        self.assert_cors(response)

    def test_a_delay_holds_the_answer(self):
        self.json("GET", "/control?delay_ms=300")
        started = time.monotonic()
        response, _ = self.json("POST", "/v1/batch", batch_body("a"), SDK)
        self.assertEqual(response.status, 200)
        self.assertGreaterEqual(time.monotonic() - started, 0.3)

    def test_reset_restores_every_control(self):
        self.json("GET", "/control?status=503&retry_after=5&delay_ms=10&mode=redirect&cors=off&allow_headers=X-A")
        _, control = self.json("GET", "/control/reset")
        self.assertEqual(
            control,
            {"status": 200, "retry_after": None, "delay_ms": 0, "mode": "normal", "cors": "on", "allow_headers": []},
        )

    def test_invalid_control_values_are_400_and_change_nothing(self):
        for query in ("status=abc", "delay_ms=x", "mode=teleport", "cors=maybe"):
            response, _ = self.json("GET", f"/control?{query}")
            self.assertEqual(response.status, 400, query)
            self.assert_cors(response)
        _, control = self.json("GET", "/control")
        self.assertEqual(control["status"], 200)
        self.assertEqual(control["mode"], "normal")


class UserAgentTest(FakeBackendTest):
    def note_for(self, headers):
        self.request("POST", "/v1/batch", batch_body("a"), headers)
        return self.last_request()["note"]

    def test_the_browsers_own_user_agent_with_an_origin_is_expected(self):
        self.assertNotIn("unexpected User-Agent", self.note_for(SDK))

    def test_the_mobile_sdk_user_agents_are_still_expected(self):
        for agent in ("rubicon-ios/1.0.0 (iOS 27.0)", "rubicon-android/1.2.3 (Android 16; Pixel 9)"):
            headers = {"Authorization": f"Bearer {KEY}", "User-Agent": agent}
            self.assertNotIn("unexpected User-Agent", self.note_for(headers), agent)

    def test_any_other_user_agent_is_noted(self):
        cases = (
            {"User-Agent": "curl/8.7.1"},
            {"User-Agent": BROWSER["User-Agent"]},  # a browser string without an Origin
            {"Origin": BROWSER["Origin"], "User-Agent": "rubicon-web/1.0.0"},
            {},
        )
        for headers in cases:
            self.assertIn("unexpected User-Agent", self.note_for({**headers, "Authorization": f"Bearer {KEY}"}))

    def test_the_request_log_never_holds_the_key(self):
        self.request("POST", "/v1/batch", batch_body("a"), SDK)
        _, data = self.request("GET", "/requests")
        self.assertNotIn(KEY.encode(), data)
        self.assertEqual(self.last_request()["authorization"], "Bearer ***")


class RemoteConfigTest(FakeBackendTest):
    def test_no_file_is_404_with_cors(self):
        response, _ = self.json("GET", "/v1/config", headers=SDK)
        self.assertEqual(response.status, 404)
        self.assert_cors(response)

    def test_a_saved_configuration_is_served_with_an_etag_and_304_with_cors(self):
        config = {"enabled": True, "flush_at": 5}
        response, saved = self.json("POST", f"/control/config?key={KEY}", json.dumps(config).encode(), BROWSER)
        self.assertEqual(saved, config)
        self.assertTrue(os.path.exists(os.path.join(self.config_dir, f"{KEY}.json")))
        response, body = self.json("GET", "/v1/config", headers=SDK)
        self.assertEqual(response.status, 200)
        self.assertEqual(body, config)
        etag = response.getheader("ETag")
        self.assertTrue(etag.startswith('"'))
        self.assert_cors(response)
        response, data = self.request("GET", "/v1/config", headers={**SDK, "If-None-Match": etag})
        self.assertEqual(response.status, 304)
        self.assertEqual(data, b"")
        self.assertEqual(response.getheader("ETag"), etag)
        self.assert_cors(response)

    def test_control_config_reads_and_deletes(self):
        self.request("POST", "/control/config?key=k1", b'{"sample_rate": 0.5}')
        _, body = self.json("GET", "/control/config?key=k1")
        self.assertEqual(body, {"sample_rate": 0.5})
        response, _ = self.json("DELETE", "/control/config?key=k1")
        self.assert_cors(response)
        response, _ = self.json("GET", "/control/config?key=k1")
        self.assertEqual(response.status, 404)

    def test_a_body_that_is_not_an_object_is_refused(self):
        response, _ = self.json("POST", "/control/config?key=k1", b"[1, 2]")
        self.assertEqual(response.status, 400)
        self.assert_cors(response)

    def test_a_key_with_path_characters_stays_in_the_directory(self):
        self.request("POST", "/control/config?key=../../escape", b"{}")
        self.assertEqual(os.listdir(self.config_dir), ["....escape.json"])


class DemoPathsTest(FakeBackendTest):
    def test_api_status_and_default_answers_carry_cors(self):
        response, body = self.json("GET", "/api/status/503", headers=BROWSER)
        self.assertEqual(response.status, 503)
        self.assertEqual(body, {"status": 503})
        self.assert_cors(response)
        response, body = self.json("POST", "/api/orders/42", b"{}", BROWSER)
        self.assertEqual(response.status, 200)
        self.assertEqual(body["path"], "/api/orders/42")
        self.assert_cors(response)
        response, _ = self.json("DELETE", "/api/orders/42", headers=BROWSER)
        self.assertEqual(response.status, 200)

    def test_an_unknown_path_is_404_with_cors(self):
        for method, path in (("GET", "/nothing"), ("POST", "/nothing"), ("GET", "/v1/other")):
            response, _ = self.json(method, path)
            self.assertEqual(response.status, 404)
            self.assert_cors(response)

    def test_an_unsupported_method_is_answered_with_cors(self):
        response, _ = self.request("PATCH", "/v1/batch")
        self.assertEqual(response.status, 501)
        self.assert_cors(response)


if __name__ == "__main__":
    unittest.main()
