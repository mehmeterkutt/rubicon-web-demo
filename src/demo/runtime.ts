// Creates the SDK once per page from the saved settings, the way a site should: early, at the
// page's start, and held (Web Public API 1). Every page of the demo that uses the npm package calls
// `startDemo()` first thing in its entry module.
import { createAnalytics, createTrackedFetch } from 'rubicon-analytics';
import type { Analytics, AnalyticsConfig } from 'rubicon-analytics';
import { FakeBackend } from './backend';
import { hooksOf } from './hooks';
import { Journal } from './journal';
import { PersonRecord } from './person';
import { isRecord, loadSettings } from './settings';
import type { DemoSettings } from './settings';

export interface Demo {
  readonly analytics: Analytics;
  readonly settings: DemoSettings;
  readonly journal: Journal;
  readonly person: PersonRecord;
  readonly backend: FakeBackend;
  /** `createTrackedFetch(analytics, { hosts, maskPathIds })` of Settings, over the page's `fetch`. */
  readonly trackedFetch: typeof fetch;
  /** The configuration exactly as passed to `createAnalytics`, for the Settings tab. */
  readonly config: AnalyticsConfig;
}

/** Where the SDK comes from: the npm package by default, `window.Rubicon` on the script build page. */
export interface SdkFactories {
  readonly createAnalytics: typeof createAnalytics;
  readonly createTrackedFetch: typeof createTrackedFetch;
}

const NPM: SdkFactories = { createAnalytics, createTrackedFetch };

let current: Demo | undefined;

export function startDemo(sdk: SdkFactories = NPM): Demo {
  if (current !== undefined) return current;
  const settings = loadSettings();
  const journal = new Journal(true);
  journal.pageLoaded(location.pathname + location.search);
  const config = toConfig(settings, journal);
  const analytics = sdk.createAnalytics(config);
  current = {
    analytics,
    settings,
    journal,
    person: new PersonRecord(),
    backend: new FakeBackend(settings.host),
    trackedFetch: sdk.createTrackedFetch(analytics, {
      hosts: settings.captureHosts,
      maskPathIds: settings.maskPathIds,
    }),
    config,
  };
  return current;
}

/** The SDK configuration of `settings`, with the demo's observer and logger. */
export function toConfig(settings: DemoSettings, journal: Journal): AnalyticsConfig {
  const base: AnalyticsConfig = {
    apiKey: settings.apiKey,
    host: settings.host,
    debug: settings.debug,
    beforeSend: hooksOf(settings.hooks),
    flush: { at: settings.flushAt, intervalMs: settings.flushIntervalMs, immediateEvents: settings.immediateEvents },
    session: { inactivityTimeoutMs: settings.sessionTimeoutMs },
    autocapture: { enabled: settings.autocapture },
    context: {
      disabledFields: settings.disabledFields,
      app: {
        ...(settings.appName ? { name: settings.appName } : {}),
        ...(settings.appVersion ? { version: settings.appVersion } : {}),
        ...(settings.appNamespace ? { namespace: settings.appNamespace } : {}),
      },
      page: { queryParams: settings.queryParams, title: settings.pageTitle },
    },
    identity: {
      crossSubdomain: settings.crossSubdomain,
      ...(settings.cookieDomain ? { cookieDomain: settings.cookieDomain } : {}),
    },
    privacy: { defaultConsent: settings.defaultConsent, persistConsent: settings.persistConsent },
    logging: {
      level: settings.logLevel,
      sendDiagnostics: settings.sendDiagnostics,
      eventObserver: journal.observe,
      ...(settings.inAppLogger ? { logger: journal.log } : {}),
    },
    network: { headers: settings.headers },
  };
  const extra = parseExtra(settings.extraConfig, journal);
  return extra === undefined ? base : (merge(base, extra) as unknown as AnalyticsConfig);
}

function parseExtra(text: string, journal: Journal): Record<string, unknown> | undefined {
  if (text.trim() === '') return undefined;
  try {
    const value: unknown = JSON.parse(text);
    if (isRecord(value)) return value;
    journal.note('The extra configuration is not a JSON object; it is not applied');
  } catch {
    journal.note('The extra configuration is not valid JSON; it is not applied');
  }
  return undefined;
}

/** `extra` over `base`, objects merged key by key, anything else replaced. */
function merge(base: object, extra: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const before = result[key];
    result[key] = isRecord(before) && isRecord(value) ? merge(before, value) : value;
  }
  return result;
}
