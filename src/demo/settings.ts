// Everything the demo can set on the SDK, saved in one cookie and applied by reloading the page: the
// SDK reads its configuration once, at `createAnalytics` (Web Configuration 1), as the Android demo
// applies its settings by restarting the process.
//
// The cookie, `demo_settings`, is written on the parent domain (`rubicon.test` for
// `a.rubicon.test`), so both subdomains of D15 run the SDK with one configuration, as the pages of
// one site would; on `localhost` or an IP address it is host-only. Its name is outside the SDK's
// prefixes (`rubicon.`, `rubicon_`, `__rubicon_`). docs/decisions.md, step 9.2.
import type { Autocapture, Consent, ContextField, LogLevel } from 'rubicon-analytics';
// With its extension: vite.config.ts imports this module, and Vite's coming native configuration
// loader resolves only full paths.
import type { HookPresetId } from './hooks.ts';

export interface DemoSettings {
  readonly apiKey: string;
  readonly host: string;
  /** `network.headers`, as `name=value` pairs. */
  readonly headers: Readonly<Record<string, string>>;
  readonly debug: boolean;
  readonly logLevel: LogLevel;
  /** The demo's logger (the Logs tab and the console); off leaves the SDK's own console sink. */
  readonly inAppLogger: boolean;
  readonly sendDiagnostics: boolean;
  readonly flushAt: number;
  readonly flushIntervalMs: number;
  readonly immediateEvents: readonly string[];
  readonly sessionTimeoutMs: number;
  readonly autocapture: readonly Autocapture[];
  readonly disabledFields: readonly ContextField[];
  readonly appName: string;
  readonly appVersion: string;
  readonly appNamespace: string;
  readonly queryParams: readonly string[];
  readonly pageTitle: boolean;
  readonly crossSubdomain: boolean;
  /** `identity.cookieDomain`; empty leaves it out, so the SDK discovers the domain. */
  readonly cookieDomain: string;
  readonly defaultConsent: Consent;
  readonly persistConsent: boolean;
  readonly hooks: readonly HookPresetId[];
  /** Base URL of the app's own calls through `createTrackedFetch`; another name for the fake backend. */
  readonly apiBase: string;
  readonly captureHosts: readonly string[];
  readonly maskPathIds: boolean;
  /** Each tab of the main page calls `screen("tab_<name>")` when shown. */
  readonly tabScreens: boolean;
  /** The single-page area calls `screen()` with the route template on every navigation. */
  readonly routerScreens: boolean;
  /**
   * A JSON object merged into the configuration last, as it is: the way to give the SDK what the
   * fields cannot, such as a setting of the wrong type or another platform's setting.
   */
  readonly extraConfig: string;
}

export const AUTOCAPTURE: readonly Autocapture[] = ['page_views', 'sessions', 'network_requests'];

export const CONTEXT_FIELDS: readonly ContextField[] = [
  'app.name',
  'app.version',
  'app.namespace',
  'device.type',
  'os.name',
  'browser.name',
  'browser.version',
  'screen.width',
  'screen.height',
  'screen.density',
  'page.url',
  'page.referrer',
  'page.viewport_width',
  'page.viewport_height',
  'page.query',
  'locale',
  'timezone',
];

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'off'];

/** The fake backend as the SDK reaches it: the loopback address, another origin than the pages. */
export const DEFAULT_HOST = 'http://127.0.0.1:8080';

export const DEFAULT_SETTINGS: DemoSettings = {
  apiKey: 'rk_demo',
  host: DEFAULT_HOST,
  headers: {},
  debug: false,
  logLevel: 'debug',
  inAppLogger: true,
  sendDiagnostics: true,
  flushAt: 30,
  flushIntervalMs: 5_000,
  immediateEvents: ['Purchase Completed'],
  sessionTimeoutMs: 300_000,
  autocapture: AUTOCAPTURE,
  disabledFields: [],
  appName: 'Rubicon Web Demo',
  appVersion: '0.1.0',
  appNamespace: 'rubicon-web-demo',
  queryParams: ['ref'],
  pageTitle: false,
  crossSubdomain: true,
  cookieDomain: '',
  defaultConsent: 'granted',
  persistConsent: true,
  hooks: ['maskEmail', 'dropDebugEvents', 'maskResetToken'],
  // `localhost` is the fake backend under another name than the SDK's host, so the app's own calls
  // are captured and the SDK's never are (the Android demo's arrangement).
  apiBase: 'http://localhost:8080',
  captureHosts: ['localhost', '*.rubicon.test', '*.rubicon.localhost'],
  maskPathIds: true,
  tabScreens: true,
  routerScreens: false,
  extraConfig: '',
};

export const SETTINGS_COOKIE = 'demo_settings';
// A cookie with its attributes stays well below the 4096 bytes browsers keep.
const MAX_COOKIE_VALUE = 3_800;

/** The saved settings, or the defaults; a value of the wrong type falls back to its default. */
export function loadSettings(): DemoSettings {
  const text = readCookie(SETTINGS_COOKIE);
  if (text === undefined) return DEFAULT_SETTINGS;
  try {
    const saved: unknown = JSON.parse(text);
    return isRecord(saved) ? fromSaved(saved) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Saves `settings`; returns an error message when the cookie could not be written. */
export function saveSettings(settings: DemoSettings): string | undefined {
  const value = encodeURIComponent(JSON.stringify(settings));
  if (value.length > MAX_COOKIE_VALUE) return `The settings are too long for a cookie (${value.length} bytes)`;
  const attributes = `; Path=/; Max-Age=${365 * 24 * 3600}; SameSite=Lax`;
  const domain = parentDomain(location.hostname);
  try {
    // Drop a host-only copy first, so the parent domain's is the one every page reads.
    document.cookie = `${SETTINGS_COOKIE}=; Path=/; Max-Age=0`;
    if (domain !== undefined) document.cookie = `${SETTINGS_COOKIE}=${value}${attributes}; Domain=${domain}`;
    if (readCookie(SETTINGS_COOKIE) === undefined) document.cookie = `${SETTINGS_COOKIE}=${value}${attributes}`;
    return readCookie(SETTINGS_COOKIE) === undefined ? 'The browser refused the settings cookie' : undefined;
  } catch {
    return 'Cookies cannot be written on this page';
  }
}

/** Forgets the saved settings, on the parent domain and on the host. */
export function clearSettings(): void {
  const domain = parentDomain(location.hostname);
  try {
    if (domain !== undefined) document.cookie = `${SETTINGS_COOKIE}=; Path=/; Max-Age=0; Domain=${domain}`;
    document.cookie = `${SETTINGS_COOKIE}=; Path=/; Max-Age=0`;
  } catch {
    // A sandboxed frame has no cookies; nothing to clear.
  }
}

/** `rubicon.test` for `a.rubicon.test`; nothing for `localhost`, an IP address or a two-label host. */
export function parentDomain(hostname: string): string | undefined {
  if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) return undefined;
  const labels = hostname.split('.');
  return labels.length >= 3 ? labels.slice(1).join('.') : undefined;
}

/** The other subdomain of the demo's site: `b.rubicon.test` for `a.rubicon.test`, and back. */
export function otherHost(hostname: string): string | undefined {
  if (hostname.startsWith('a.')) return `b.${hostname.slice(2)}`;
  if (hostname.startsWith('b.')) return `a.${hostname.slice(2)}`;
  return undefined;
}

export function readCookie(name: string): string | undefined {
  try {
    for (const part of document.cookie.split(';')) {
      const index = part.indexOf('=');
      if (index < 0 || part.slice(0, index).trim() !== name) continue;
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  } catch {
    // A sandboxed frame throws on document.cookie.
  }
  return undefined;
}

function fromSaved(saved: Record<string, unknown>): DemoSettings {
  const d = DEFAULT_SETTINGS;
  const string = (key: keyof DemoSettings, fallback: string): string =>
    typeof saved[key] === 'string' ? saved[key] : fallback;
  const number = (key: keyof DemoSettings, fallback: number): number =>
    typeof saved[key] === 'number' ? saved[key] : fallback;
  const boolean = (key: keyof DemoSettings, fallback: boolean): boolean =>
    typeof saved[key] === 'boolean' ? saved[key] : fallback;
  const strings = (key: keyof DemoSettings, fallback: readonly string[]): string[] => {
    const value = saved[key];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [...fallback];
  };
  const oneOf = <T extends string>(key: keyof DemoSettings, options: readonly T[], fallback: T): T => {
    const value = saved[key];
    return options.find((o) => o === value) ?? fallback;
  };
  const someOf = <T extends string>(key: keyof DemoSettings, options: readonly T[], fallback: readonly T[]): T[] => {
    const value = saved[key];
    return Array.isArray(value) ? options.filter((o) => value.includes(o)) : [...fallback];
  };
  const headers = saved['headers'];
  return {
    apiKey: string('apiKey', d.apiKey),
    host: string('host', d.host),
    headers: isRecord(headers)
      ? Object.fromEntries(Object.entries(headers).filter((e): e is [string, string] => typeof e[1] === 'string'))
      : d.headers,
    debug: boolean('debug', d.debug),
    logLevel: oneOf('logLevel', LOG_LEVELS, d.logLevel),
    inAppLogger: boolean('inAppLogger', d.inAppLogger),
    sendDiagnostics: boolean('sendDiagnostics', d.sendDiagnostics),
    flushAt: number('flushAt', d.flushAt),
    flushIntervalMs: number('flushIntervalMs', d.flushIntervalMs),
    immediateEvents: strings('immediateEvents', d.immediateEvents),
    sessionTimeoutMs: number('sessionTimeoutMs', d.sessionTimeoutMs),
    autocapture: someOf('autocapture', AUTOCAPTURE, d.autocapture),
    disabledFields: someOf('disabledFields', CONTEXT_FIELDS, d.disabledFields),
    appName: string('appName', d.appName),
    appVersion: string('appVersion', d.appVersion),
    appNamespace: string('appNamespace', d.appNamespace),
    queryParams: strings('queryParams', d.queryParams),
    pageTitle: boolean('pageTitle', d.pageTitle),
    crossSubdomain: boolean('crossSubdomain', d.crossSubdomain),
    cookieDomain: string('cookieDomain', d.cookieDomain),
    defaultConsent: oneOf<Consent>('defaultConsent', ['granted', 'pending'], d.defaultConsent),
    persistConsent: boolean('persistConsent', d.persistConsent),
    hooks: strings('hooks', d.hooks) as HookPresetId[],
    apiBase: string('apiBase', d.apiBase),
    captureHosts: strings('captureHosts', d.captureHosts),
    maskPathIds: boolean('maskPathIds', d.maskPathIds),
    tabScreens: boolean('tabScreens', d.tabScreens),
    routerScreens: boolean('routerScreens', d.routerScreens),
    extraConfig: string('extraConfig', d.extraConfig),
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `a, b ,c` as `['a', 'b', 'c']`. */
export function splitList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** `name=value, other=x` as an object; pairs without a name are left out. */
export function parsePairs(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of splitList(text)) {
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    result[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
  return result;
}

export function formatPairs(pairs: Readonly<Record<string, string>>): string {
  return Object.entries(pairs)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}
