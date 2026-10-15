// The page inside the sandboxed iframe (pages/sandboxed-frame.html), a classic script after the
// script build: an opaque origin has no cookies and no storage, so it cannot read the demo's
// settings; the parent page passes the API key and the host in the address. It writes the SDK's
// lines and updates into the frame itself.
(function () {
  'use strict';
  var out = document.getElementById('out');
  function write(text) {
    out.textContent = text + '\n' + out.textContent;
  }
  var params = new URLSearchParams(location.search);
  if (!window.Rubicon) {
    write('window.Rubicon is missing: the script build did not load');
    return;
  }
  var analytics = window.Rubicon.createAnalytics({
    apiKey: params.get('apiKey') || 'rk_demo',
    host: params.get('host') || 'http://127.0.0.1:8080',
    flush: { at: 1 },
    logging: {
      level: 'debug',
      logger: function (level, message) {
        write(level + ' ' + message);
      },
      eventObserver: function (update) {
        write(
          'observer: ' + update.type + (update.type === 'queued' ? ' ' + (update.event.name || update.event.type) : ''),
        );
      },
    },
  });
  document.getElementById('device').textContent = analytics.deviceId;
  document.getElementById('track').addEventListener('click', function () {
    analytics.track('Sandboxed Button Clicked');
  });
})();
