// Ready-made `beforeSend` hooks, one for each rule of Public API 4 and Web Public API 4 and 5, ported
// from the Android and iOS demos' HookPreset. They run in this order.
import type { BeforeSend, Event } from 'rubicon-analytics';

export type HookPresetId =
  | 'maskEmail'
  | 'dropDebugEvents'
  | 'maskResetToken'
  | 'tagAppEvents'
  | 'throwOnHookTest'
  | 'asyncOnHookTest'
  | 'renamePageViewed';

export interface HookPreset {
  readonly id: HookPresetId;
  readonly title: string;
  readonly description: string;
  readonly hook: BeforeSend;
}

const RESET_TOKEN = /\/reset-password\/[^/?#]+/g;

export const HOOK_PRESETS: readonly HookPreset[] = [
  {
    id: 'maskEmail',
    title: 'Mask email values',
    description:
      'Any event: an email property or trait keeps its key, its value becomes "***". Allowed for automatic events too.',
    hook: (event) => {
      switch (event.type) {
        case 'track':
        case 'screen':
          return 'email' in event.properties ? { ...event, properties: { ...event.properties, email: '***' } } : event;
        case 'identify':
          return 'email' in event.traits ? { ...event, traits: { ...event.traits, email: '***' } } : event;
        default:
          return event;
      }
    },
  },
  {
    id: 'dropDebugEvents',
    title: 'Drop "Debug Event"',
    description: 'Returns null for the app\'s "Debug Event": dropped and counted as before_send.',
    hook: (event) => (event.type === 'track' && event.source === 'app' && event.name === 'Debug Event' ? null : event),
  },
  {
    id: 'maskResetToken',
    title: 'Mask reset tokens',
    description:
      'Network Request (automatic): /reset-password/<token> in url and path becomes /reset-password/:token; values of an automatic event may change, its keys may not (Privacy 5c).',
    hook: (event) => {
      if (event.type !== 'track' || event.name !== 'Network Request') return event;
      const properties = { ...event.properties };
      for (const key of ['url', 'path']) {
        const value = properties[key];
        if (typeof value === 'string') properties[key] = value.replace(RESET_TOKEN, '/reset-password/:token');
      }
      return { ...event, properties };
    },
  },
  {
    id: 'tagAppEvents',
    title: 'Tag app events',
    description: "Adds hooked=true to the app's track and screen events (an app event may change freely).",
    hook: (event) => {
      if (event.source !== 'app' || event.type === 'identify') return event;
      return { ...event, properties: { ...event.properties, hooked: true } };
    },
  },
  {
    id: 'throwOnHookTest',
    title: 'Throw on "Hook Test"',
    description: 'Throws for the event "Hook Test": the event is dropped (HOOK_THREW); the page goes on.',
    hook: (event) => {
      if (event.type === 'track' && event.name === 'Hook Test') throw new Error('A hook failed on purpose');
      return event;
    },
  },
  {
    id: 'asyncOnHookTest',
    title: 'Async hook on "Async Hook Test"',
    description:
      'Returns a Promise for the event "Async Hook Test", as an async function does: the event is dropped (HOOK_VIOLATION).',
    hook: (event) =>
      event.type === 'track' && event.name === 'Async Hook Test'
        ? // A Promise where an event belongs, on purpose: the SDK must refuse it.
          (Promise.resolve(event) as unknown as Event)
        : event,
  },
  {
    id: 'renamePageViewed',
    title: 'Rename Page Viewed',
    description:
      'Breaks the rule for automatic events: every Page Viewed is dropped with HOOK_VIOLATION, a developer error.',
    hook: (event) =>
      event.type === 'track' && event.name === 'Page Viewed' ? { ...event, name: 'Page Opened' } : event,
  },
];

/** The hooks of `selected`, in the presets' order. */
export function hooksOf(selected: readonly HookPresetId[]): BeforeSend[] {
  return HOOK_PRESETS.filter((p) => selected.includes(p.id)).map((p) => p.hook);
}

export function hookTitle(id: HookPresetId): string {
  return HOOK_PRESETS.find((p) => p.id === id)?.title ?? id;
}
