// The demo's Vite plugin: everything the pages need from the SDK's build besides the npm package,
// taken from the linked checkout and never edited (the user's decision of 2026-10-15):
//
// - `/sdk/rubicon.min.js` (and its map), the script build, served in development and copied into
//   the build, so the script-tag pages load it from this origin as a site loads a copy it hosts;
// - the snippet page's three tags: the stub text of `dist/snippet.json`, the page's own init tag
//   (`snippet/init.js`, the demo's default settings in place of its token) and the library tag with
//   the SRI hash of `dist/snippet.json`; and its policy, a meta tag that allows the stub and the
//   init tag by their hashes, this origin and the fake backend's origin only;
// - the single-page area's fallback: any address under /spa/ without a file extension serves
//   spa/index.html, so a reload on a deep route works, in development and in preview.
//
// Placeholders in the HTML files (comments, untouched by Vite's own HTML processing) mark where the
// tags go; the replacement runs after Vite's, so Vite never tries to bundle the classic scripts.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Connect, Plugin } from 'vite';

export interface RubiconPagesOptions {
  /** The demo's default settings, written into the init tag (src/demo/settings.ts). */
  readonly defaults: object;
  /** The origin the snippet page's policy allows besides its own: the fake backend's. */
  readonly backendOrigin: string;
  /** The init tag's source. */
  readonly initFile: string;
}

interface SnippetValues {
  readonly version: string;
  readonly stub: string;
  readonly stubHash: string;
  readonly integrity: string;
}

/** The SDK's `dist/` directory, found through the linked package's own `package.json`. */
export function sdkDist(): string {
  const require = createRequire(import.meta.url);
  // The exports map hides package.json; the main entry sits in dist/.
  const main = require.resolve('rubicon-analytics');
  const dist = dirname(main);
  if (!existsSync(join(dist, 'rubicon.min.js')) || !existsSync(join(dist, 'snippet.json'))) {
    throw new Error(
      `The SDK's build is missing in ${dist}: run pnpm install and pnpm -r build in the SDK checkout first (README).`,
    );
  }
  return dist;
}

export function readSnippet(dist: string): SnippetValues {
  return JSON.parse(readFileSync(join(dist, 'snippet.json'), 'utf8')) as SnippetValues;
}

/** `sha256-<base64>` of `text`, the form CSP takes. */
export function cspHash(text: string): string {
  return `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;
}

/** `sha384-<base64>` of `bytes`, the form the integrity attribute takes. */
export function sriHash(bytes: Buffer): string {
  return `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
}

export function rubiconPages(options: RubiconPagesOptions): Plugin {
  const dist = sdkDist();
  const snippet = readSnippet(dist);
  const library = readFileSync(join(dist, 'rubicon.min.js'));
  const libraryMap = readFileSync(join(dist, 'rubicon.min.js.map'));
  // The published hashes must describe the files served here; a mismatch is a stale SDK build.
  if (sriHash(library) !== snippet.integrity || cspHash(snippet.stub) !== snippet.stubHash) {
    throw new Error('dist/snippet.json does not match dist/rubicon.min.js: rebuild the SDK (pnpm -r build).');
  }
  // The file's leading comment is the demo's, not the page's: the tag holds the code only.
  const init = readFileSync(options.initFile, 'utf8')
    .replace(/^(\/\/.*\r?\n)+/, '')
    .replace('__DEMO_DEFAULTS__', JSON.stringify(options.defaults))
    .replace(/\r?\n$/, '');
  const initHash = cspHash(init);
  const libraryTag = `<script async src="/sdk/rubicon.min.js" integrity="${snippet.integrity}" crossorigin="anonymous"></script>`;
  const policy = [
    "default-src 'none'",
    `script-src 'self' '${snippet.stubHash}' '${initHash}'`,
    `connect-src 'self' ${options.backendOrigin}`,
    "style-src 'self'",
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  const replacements: Record<string, string> = {
    '<!-- rubicon:policy -->': `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    '<!-- rubicon:snippet -->': `<script>${snippet.stub}</script>\n    <script>${init}</script>\n    ${libraryTag}`,
    '<!-- rubicon:script -->': `<script src="/sdk/rubicon.min.js" integrity="${snippet.integrity}" crossorigin="anonymous"></script>`,
    // A frame with an opaque origin: no integrity, which would make the load a CORS request.
    '<!-- rubicon:script-plain -->': '<script src="/sdk/rubicon.min.js"></script>',
  };

  const serveSdk: Connect.NextHandleFunction = (req, res, next) => {
    const path = (req.url ?? '').split('?')[0];
    if (path === '/sdk/rubicon.min.js' || path === '/sdk/rubicon.min.js.map') {
      res.setHeader('Content-Type', path.endsWith('.map') ? 'application/json' : 'text/javascript');
      res.end(path.endsWith('.map') ? libraryMap : library);
      return;
    }
    next();
  };
  const spaFallback: Connect.NextHandleFunction = (req, _res, next) => {
    const [path = '', query] = (req.url ?? '').split('?');
    if (path.startsWith('/spa/') && path !== '/spa/index.html' && !/\.[a-z0-9]+$/i.test(path)) {
      req.url = `/spa/index.html${query === undefined ? '' : `?${query}`}`;
    }
    next();
  };

  return {
    name: 'rubicon-pages',
    config() {
      return {
        define: {
          __SDK_VERSION__: JSON.stringify(snippet.version),
          __STUB_HASH__: JSON.stringify(snippet.stubHash),
          __SCRIPT_INTEGRITY__: JSON.stringify(snippet.integrity),
        },
      };
    },
    configureServer(server) {
      server.middlewares.use(serveSdk);
      server.middlewares.use(spaFallback);
    },
    configurePreviewServer(server) {
      server.middlewares.use(spaFallback);
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        let result = html;
        for (const [placeholder, tags] of Object.entries(replacements)) result = result.split(placeholder).join(tags);
        // The policy must come before every script and stylesheet, which Vite may have put above it,
        // so it moves right after the charset declaration.
        const meta = /\s*(<meta http-equiv="Content-Security-Policy"[^>]*>)/.exec(result);
        if (meta?.[1] !== undefined) {
          result = result.replace(meta[0], '').replace(/(<meta charset="utf-8" \/>)/, `$1\n    ${meta[1]}`);
        }
        return result;
      },
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sdk/rubicon.min.js', source: library });
      this.emitFile({ type: 'asset', fileName: 'sdk/rubicon.min.js.map', source: libraryMap });
    },
  };
}
