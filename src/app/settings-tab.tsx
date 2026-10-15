// Settings: every setting of the SDK (Web Configuration 1), the hooks, consent, identity and the
// network capture, plus the demo's own. The SDK reads its configuration once per page, so saving
// reloads the page; other open tabs keep theirs until they are reloaded. The Android demo's Settings
// screen, with the web's settings.
import { useState } from 'react';
import type { Consent, LogLevel } from 'rubicon-analytics';
import { HOOK_PRESETS } from '../demo/hooks';
import type { Demo } from '../demo/runtime';
import type { DemoSettings } from '../demo/settings';
import {
  AUTOCAPTURE,
  CONTEXT_FIELDS,
  DEFAULT_SETTINGS,
  LOG_LEVELS,
  clearSettings,
  formatPairs,
  parsePairs,
  saveSettings,
  splitList,
} from '../demo/settings';
import { Btn, Chips, Expect, Field, Flow, Mono, MultiChips, SectionCard, Toggle } from '../ui/components';

declare const __SDK_VERSION__: string;

interface Texts {
  headers: string;
  immediateEvents: string;
  queryParams: string;
  captureHosts: string;
  flushAt: string;
  flushIntervalMs: string;
  sessionTimeoutMs: string;
}

function textsOf(s: DemoSettings): Texts {
  return {
    headers: formatPairs(s.headers),
    immediateEvents: s.immediateEvents.join(', '),
    queryParams: s.queryParams.join(', '),
    captureHosts: s.captureHosts.join(', '),
    flushAt: String(s.flushAt),
    flushIntervalMs: String(s.flushIntervalMs),
    sessionTimeoutMs: String(s.sessionTimeoutMs),
  };
}

export function SettingsTab(props: { demo: Demo }) {
  const [s, setS] = useState<DemoSettings>(props.demo.settings);
  const [t, setT] = useState<Texts>(() => textsOf(props.demo.settings));
  const [error, setError] = useState<string | undefined>(undefined);
  const set = (patch: Partial<DemoSettings>) => {
    setS({ ...s, ...patch });
  };
  const text = (patch: Partial<Texts>) => {
    setT({ ...t, ...patch });
  };
  const num = (value: string, fallback: number) =>
    value.trim() === '' || Number.isNaN(Number(value)) ? fallback : Number(value);

  const withTexts = (): DemoSettings => ({
    ...s,
    headers: parsePairs(t.headers),
    immediateEvents: splitList(t.immediateEvents),
    queryParams: splitList(t.queryParams),
    captureHosts: splitList(t.captureHosts),
    flushAt: num(t.flushAt, s.flushAt),
    flushIntervalMs: num(t.flushIntervalMs, s.flushIntervalMs),
    sessionTimeoutMs: num(t.sessionTimeoutMs, s.sessionTimeoutMs),
  });

  return (
    <>
      <SectionCard
        title="Apply"
        subtitle="The SDK reads its configuration once per page. Saving stores the settings in a cookie of the site (both subdomains) and reloads this page; other open tabs keep theirs until reloaded."
      >
        {error ? <p className="error">{error}</p> : null}
        <Flow>
          <Btn
            kind="primary"
            testId="save-settings"
            onClick={() => {
              const failure = saveSettings(withTexts());
              if (failure === undefined) location.reload();
              else setError(failure);
            }}
          >
            Save and reload
          </Btn>
          <Btn
            onClick={() => {
              clearSettings();
              location.reload();
            }}
          >
            Defaults and reload
          </Btn>
          <Btn
            onClick={() => {
              setS(DEFAULT_SETTINGS);
              setT(textsOf(DEFAULT_SETTINGS));
            }}
          >
            Fill in the defaults
          </Btn>
        </Flow>
      </SectionCard>

      <SectionCard title="Connection" subtitle="apiKey, host, network.headers, debug.">
        <Field
          label="API key"
          value={s.apiKey}
          onChange={(apiKey) => {
            set({ apiKey });
          }}
          supporting="Blank: an instance that does nothing (INVALID_API_KEY). Another key: another keyHash, so other cookies and keys"
          testId="setting-api-key"
        />
        <Field
          label="Host"
          value={s.host}
          onChange={(host) => {
            set({ host });
          }}
          supporting="http:// warns (CLEARTEXT_HOST); an invalid URL gives an instance that does nothing (INVALID_HOST). The Server tab follows it"
        />
        <Field
          label="Extra headers"
          value={t.headers}
          onChange={(headers) => {
            text({ headers });
          }}
          supporting="name=value, comma separated. Allow the names on the Server tab first, or every upload stops at the preflight; a reserved name is ignored (RESERVED_HEADER)"
        />
        <Toggle
          label="debug"
          checked={s.debug}
          onChange={(debug) => {
            set({ debug });
          }}
          supporting="Developer errors written as console.error(new Error(...)) by the SDK's console sink (in-app logger off); never a throw, never a new line"
        />
      </SectionCard>

      <SectionCard title="Logging" subtitle="logging.level, logging.logger, logging.sendDiagnostics.">
        <Chips<LogLevel>
          options={LOG_LEVELS}
          selected={s.logLevel}
          label={(l) => l}
          onSelect={(logLevel) => {
            set({ logLevel });
          }}
        />
        <Toggle
          label="In-app logger"
          checked={s.inAppLogger}
          onChange={(inAppLogger) => {
            set({ inAppLogger });
          }}
          supporting="The Logs tab, mirrored to the console. Off: the SDK's own console sink"
        />
        <Toggle
          label="Send SDK Diagnostics"
          checked={s.sendDiagnostics}
          onChange={(sendDiagnostics) => {
            set({ sendDiagnostics });
          }}
          supporting="Counts of drops and issues, at most hourly"
        />
      </SectionCard>

      <SectionCard
        title="Flushing and sessions"
        subtitle="flush.at, flush.intervalMs, flush.immediateEvents, session.inactivityTimeoutMs."
      >
        <Field
          label="flush.at"
          value={t.flushAt}
          onChange={(flushAt) => {
            text({ flushAt });
          }}
          supporting="1 to 100; outside is clamped (SETTING_OUT_OF_BOUNDS)"
        />
        <Chips
          options={[1, 30, 100]}
          selected={num(t.flushAt, -1)}
          label={(n) => `at ${n}`}
          onSelect={(n) => {
            text({ flushAt: String(n) });
          }}
        />
        <Field
          label="flush.intervalMs"
          value={t.flushIntervalMs}
          onChange={(flushIntervalMs) => {
            text({ flushIntervalMs });
          }}
          supporting="1000 to 600000"
        />
        <Chips
          options={[1_000, 5_000, 60_000, 600_000]}
          selected={num(t.flushIntervalMs, -1)}
          label={(n) => `every ${n / 1000} s`}
          onSelect={(n) => {
            text({ flushIntervalMs: String(n) });
          }}
        />
        <Field
          label="flush.immediateEvents"
          value={t.immediateEvents}
          onChange={(immediateEvents) => {
            text({ immediateEvents });
          }}
          supporting="Comma separated event names"
        />
        <Field
          label="session.inactivityTimeoutMs"
          value={t.sessionTimeoutMs}
          onChange={(sessionTimeoutMs) => {
            text({ sessionTimeoutMs });
          }}
          supporting="60000 to 7200000; the web has no backgroundTimeoutMs"
        />
        <Chips
          options={[60_000, 300_000, 1_800_000]}
          selected={num(t.sessionTimeoutMs, -1)}
          label={(n) => `timeout ${n / 60_000} min`}
          onSelect={(n) => {
            text({ sessionTimeoutMs: String(n) });
          }}
        />
      </SectionCard>

      <SectionCard title="Automatic capture" subtitle="autocapture.enabled (Web Lifecycle 8).">
        <MultiChips
          options={AUTOCAPTURE}
          selected={s.autocapture}
          label={(a) => a}
          onChange={(autocapture) => {
            set({ autocapture });
          }}
        />
        <Toggle
          label="Tab screens with screen()"
          checked={s.tabScreens}
          onChange={(tabScreens) => {
            set({ tabScreens });
          }}
          supporting="The main page's tabs are hash routes, which Page Viewed ignores; each sends screen(tab_<name>) instead"
        />
        <Toggle
          label="Router screens with screen()"
          checked={s.routerScreens}
          onChange={(routerScreens) => {
            set({ routerScreens });
          }}
          supporting="The single-page area also calls screen() with the route template on every navigation: both events arrive"
        />
      </SectionCard>

      <SectionCard title="Context" subtitle="context.app, context.page, context.disabledFields (Web Context 1 to 5).">
        <Field
          label="context.app.name"
          value={s.appName}
          onChange={(appName) => {
            set({ appName });
          }}
        />
        <Field
          label="context.app.version"
          value={s.appVersion}
          onChange={(appVersion) => {
            set({ appVersion });
          }}
        />
        <Field
          label="context.app.namespace"
          value={s.appNamespace}
          onChange={(appNamespace) => {
            set({ appNamespace });
          }}
        />
        <Field
          label="context.page.queryParams"
          value={t.queryParams}
          onChange={(queryParams) => {
            text({ queryParams });
          }}
          supporting="Query parameters copied into context.page.query, comma separated"
        />
        <Toggle
          label="context.page.title"
          checked={s.pageTitle}
          onChange={(pageTitle) => {
            set({ pageTitle });
          }}
          supporting="Send document.title"
        />
        <span className="field-label">Fields switched off: never read, never sent</span>
        <MultiChips
          options={CONTEXT_FIELDS}
          selected={s.disabledFields}
          label={(f) => f}
          onChange={(disabledFields) => {
            set({ disabledFields });
          }}
        />
        <Btn
          onClick={() => {
            set({
              disabledFields: [
                ...new Set([...s.disabledFields, 'page.url', 'page.referrer', 'locale', 'timezone'] as const),
              ],
            });
          }}
        >
          Privacy checklist fields
        </Btn>
      </SectionCard>

      <SectionCard
        title="Identity and consent"
        subtitle="identity.crossSubdomain, identity.cookieDomain, privacy.defaultConsent, privacy.persistConsent."
      >
        <Toggle
          label="identity.crossSubdomain"
          checked={s.crossSubdomain}
          onChange={(crossSubdomain) => {
            set({ crossSubdomain });
          }}
          supporting="Off: host-only cookies, so each subdomain is its own device"
        />
        <Field
          label="identity.cookieDomain"
          value={s.cookieDomain}
          onChange={(cookieDomain) => {
            set({ cookieDomain });
          }}
          supporting="Empty: discovered. Not a suffix of the host: host-only cookies and INVALID_COOKIE_DOMAIN"
        />
        <Chips<Consent>
          options={['granted', 'pending']}
          selected={s.defaultConsent}
          label={(c) => `default ${c}`}
          onSelect={(defaultConsent) => {
            set({ defaultConsent });
          }}
        />
        <Toggle
          label="Store the decision (persistConsent)"
          checked={s.persistConsent}
          onChange={(persistConsent) => {
            set({ persistConsent });
          }}
          supporting="Off: the site's consent platform keeps it and calls optIn or optOut on every page"
        />
      </SectionCard>

      <SectionCard title="beforeSend hooks" subtitle="Public API 4, Web Public API 4 and 5. They run in this order.">
        {HOOK_PRESETS.map((hook) => (
          <Toggle
            key={hook.id}
            label={hook.title}
            checked={s.hooks.includes(hook.id)}
            supporting={hook.description}
            onChange={(on) => {
              set({ hooks: on ? [...s.hooks, hook.id] : s.hooks.filter((h) => h !== hook.id) });
            }}
          />
        ))}
      </SectionCard>

      <SectionCard
        title="Network capture"
        subtitle="createTrackedFetch(analytics, { hosts, maskPathIds }) for the app's own calls."
      >
        <Field
          label="API base"
          value={s.apiBase}
          onChange={(apiBase) => {
            set({ apiBase });
          }}
          supporting="The app's own calls (Capture tab)"
        />
        <Field
          label="Captured hosts"
          value={t.captureHosts}
          onChange={(captureHosts) => {
            text({ captureHosts });
          }}
          supporting="Exact names or *.domain, comma separated; a scheme, port or path is invalid (INVALID_CAPTURE_HOST)"
        />
        <Toggle
          label="Mask ids in paths"
          checked={s.maskPathIds}
          onChange={(maskPathIds) => {
            set({ maskPathIds });
          }}
        />
      </SectionCard>

      <SectionCard
        title="Extra configuration"
        subtitle="A JSON object merged into the configuration last, as it is, for what the fields cannot give."
      >
        <Field
          label="JSON"
          multiline
          value={s.extraConfig}
          onChange={(extraConfig) => {
            set({ extraConfig });
          }}
          supporting='For example {"flush": {"at": "ten"}} (SETTING_WRONG_TYPE), {"session": {"backgroundTimeoutMs": 10000}} (SETTING_NOT_SUPPORTED), {"autocapture": {"enabled": ["screens"]}}'
        />
      </SectionCard>

      <SectionCard title="This build">
        <Expect>SDK {__SDK_VERSION__}, from the local checkout through the link: dependency.</Expect>
        <Expect>The configuration this page passed to createAnalytics (functions shown by name):</Expect>
        <Mono>
          {JSON.stringify(
            props.demo.config,
            (_k, v: unknown) => (typeof v === 'function' ? `function ${v.name || ''}`.trim() : v),
            2,
          )}
        </Mono>
      </SectionCard>
    </>
  );
}
