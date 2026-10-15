// The demo app: several real HTML pages (full page loads and the back/forward cache), the
// single-page area under /spa/ on React Router (D19), and the SDK from the local checkout through
// the `link:` dependency. tooling/rubicon-pages.ts adds the script build, the snippet and the
// single-page fallback. Served on 127.0.0.1, under the names of D15 (README, Hostnames).
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { DEFAULT_HOST, DEFAULT_SETTINGS } from './src/demo/settings.ts';
import { rubiconPages } from './tooling/rubicon-pages.ts';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The names of D15 and the zero-setup fallback; Vite refuses other Host headers (DNS rebinding).
const allowedHosts = ['.rubicon.test', '.rubicon.localhost'];

export default defineConfig({
  appType: 'mpa',
  plugins: [
    rubiconPages({
      defaults: DEFAULT_SETTINGS,
      backendOrigin: new URL(DEFAULT_HOST).origin,
      initFile: page('snippet/init.js'),
    }),
  ],
  build: {
    target: 'es2022',
    // A test harness: readable code and class names in the browser's tools (the SDK names a class
    // instance it refuses by its constructor's name).
    minify: false,
    sourcemap: true,
    rollupOptions: {
      onwarn(warning, warn) {
        // React Router marks its modules "use client" for server components; meaningless in this app.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
      input: {
        main: page('index.html'),
        one: page('pages/one.html'),
        two: page('pages/two.html'),
        bfcache: page('pages/bfcache.html'),
        otherHost: page('pages/other-host.html'),
        script: page('pages/script.html'),
        snippet: page('pages/snippet.html'),
        cspBlocked: page('pages/csp-blocked.html'),
        sandboxed: page('pages/sandboxed.html'),
        sandboxedFrame: page('pages/sandboxed-frame.html'),
        spa: page('spa/index.html'),
      },
    },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, allowedHosts },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, allowedHosts },
});
