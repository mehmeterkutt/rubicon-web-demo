// The snippet page's own `init` tag (pages/snippet.html), inlined by the demo's Vite plugin between
// the SDK's stub and the library tag, and allowed by its hash in the page's policy, as a site does
// with its init script (the SDK's docs/csp.md). ES5, like the stub. It reads the demo's settings
// from their cookie (src/demo/settings.ts; the defaults replace the token at build) and passes every
// setting the page can carry in JSON; the beforeSend hooks, the extra configuration and
// createTrackedFetch are the npm pages'. The logger and observer hand their calls to the page's
// module through `window.demoSnippetQueue`, since the instance must not wait for it.
(function () {
  var s = __DEMO_DEFAULTS__;
  try {
    var m = document.cookie.match(/(?:^|;\s*)demo_settings=([^;]*)/);
    var saved = m ? JSON.parse(decodeURIComponent(m[1])) : {};
    for (var k in saved) if (Object.prototype.hasOwnProperty.call(saved, k)) s[k] = saved[k];
  } catch (e) {}
  var queue = (window.demoSnippetQueue = []);
  var app = {};
  if (s.appName) app.name = s.appName;
  if (s.appVersion) app.version = s.appVersion;
  if (s.appNamespace) app.namespace = s.appNamespace;
  var identity = { crossSubdomain: s.crossSubdomain };
  if (s.cookieDomain) identity.cookieDomain = s.cookieDomain;
  var logging = {
    level: s.logLevel,
    sendDiagnostics: s.sendDiagnostics,
    eventObserver: function (update) {
      queue.push(['event', update]);
    },
  };
  if (s.inAppLogger) {
    logging.logger = function (level, message) {
      queue.push(['log', level, message]);
    };
  }
  rubicon.init({
    apiKey: s.apiKey,
    host: s.host,
    debug: s.debug,
    flush: { at: s.flushAt, intervalMs: s.flushIntervalMs, immediateEvents: s.immediateEvents },
    session: { inactivityTimeoutMs: s.sessionTimeoutMs },
    autocapture: { enabled: s.autocapture },
    context: {
      disabledFields: s.disabledFields,
      app: app,
      page: { queryParams: s.queryParams, title: s.pageTitle },
    },
    identity: identity,
    privacy: { defaultConsent: s.defaultConsent, persistConsent: s.persistConsent },
    logging: logging,
    network: { headers: s.headers },
  });
  // Queued by the stub before the library arrives, then replayed with the time of this call.
  rubicon.track('Snippet Page Opened', { queued_before_load: true });
})();
