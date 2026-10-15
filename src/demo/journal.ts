// What the SDK reported on this tab: its `logging.eventObserver` updates (queued, sent, dropped with
// the reason) and its log lines, for the Logs tab and the panel of the other pages; the Android
// demo's EventFeed and SdkLog in one store. It is kept per tab across page loads in
// `sessionStorage` (`demo.journal`, outside the SDK's prefixes), so what happened while a page went
// away is still readable on the next one. docs/decisions.md, step 9.2.
import type { DropReason, Event, EventUpdate, LogLevel } from 'rubicon-analytics';

export type FeedKind = 'queued' | 'sent' | 'dropped' | 'page';

export interface FeedEntry {
  readonly id: number;
  readonly time: string;
  readonly kind: FeedKind;
  readonly title: string;
  readonly detail: string;
  /** For a queued event: its JSON as the observer saw it, after the hooks. */
  readonly json?: string;
  readonly userId?: string | null;
}

export interface LogLine {
  readonly id: number;
  readonly time: string;
  readonly level: Exclude<LogLevel, 'off'>;
  readonly message: string;
  /** The type of the caught error the SDK passed to the logger, never its text. */
  readonly error?: string;
}

export interface Counts {
  readonly queued: number;
  readonly sent: number;
  readonly dropped: Readonly<Partial<Record<DropReason, number>>>;
}

export interface JournalState {
  readonly feed: readonly FeedEntry[];
  readonly lines: readonly LogLine[];
  readonly counts: Counts;
}

const STORAGE_KEY = 'demo.journal';
const MAX_FEED = 400;
const MAX_LINES = 600;
const SAVE_DELAY_MS = 300;
const EMPTY: JournalState = { feed: [], lines: [], counts: { queued: 0, sent: 0, dropped: {} } };

export class Journal {
  private state: JournalState;
  private nextId: number;
  private readonly listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  // From pagehide on, every change is saved at once: the SDK reports what a closing page could not
  // write (page_closed) from its own pagehide handler, after this one, and no timer runs after it.
  private closing = false;
  /** Set by the Logs tab: the next observer call throws, so the SDK switches the observer off. */
  throwInObserver = false;
  /** Set by the Logs tab: the next logger call throws, so the SDK falls back to the console. */
  throwInLogger = false;
  /** The demo's logger also writes each line to the console, as the SDK's own sink would. */
  echoToConsole = true;

  constructor(private readonly persist: boolean) {
    this.state = persist ? restore() : EMPTY;
    this.nextId = Math.max(0, ...this.state.feed.map((e) => e.id), ...this.state.lines.map((l) => l.id)) + 1;
    if (persist) {
      try {
        addEventListener('pagehide', () => {
          this.closing = true;
          this.saveNow();
        });
        // A page restored from the back/forward cache lives again.
        addEventListener('pageshow', () => {
          this.closing = false;
        });
      } catch {
        // No window: nothing to keep.
      }
    }
  }

  get snapshot(): JournalState {
    return this.state;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): JournalState => this.state;

  /** `logging.eventObserver`. */
  readonly observe = (update: EventUpdate): void => {
    if (this.throwInObserver) {
      this.throwInObserver = false;
      throw new Error('The demo observer failed on purpose');
    }
    const counts = this.state.counts;
    switch (update.type) {
      case 'queued':
        this.addFeed('queued', titleOf(update.event), detailOf(update.event), {
          json: JSON.stringify(update.event, null, 2),
          userId: update.event.userId,
        });
        this.setCounts({ ...counts, queued: counts.queued + 1 });
        break;
      case 'sent':
        this.addFeed('sent', `${update.messageIds.length} sent`, 'the server accepted the batch');
        this.setCounts({ ...counts, sent: counts.sent + update.messageIds.length });
        break;
      case 'dropped': {
        const n = update.messageIds.length;
        this.addFeed('dropped', `${n} dropped`, `reason: ${update.reason}`);
        const before = counts.dropped[update.reason] ?? 0;
        this.setCounts({ ...counts, dropped: { ...counts.dropped, [update.reason]: before + n } });
        break;
      }
      default:
        break;
    }
  };

  /** `logging.logger`. */
  readonly log = (level: LogLevel, message: string, error?: unknown): void => {
    if (this.throwInLogger) {
      this.throwInLogger = false;
      throw new Error('The demo logger failed on purpose');
    }
    if (level === 'off') return;
    if (this.echoToConsole) echo(level, `[Rubicon] ${message}`);
    this.addLine(level, message, error === undefined ? undefined : errorType(error));
  };

  /** A line of the demo itself, marked as such. */
  note(message: string): void {
    this.addLine('info', `[demo] ${message}`);
  }

  /** A separator in the feed at every page load, so a reload is visible in the kept entries. */
  pageLoaded(path: string): void {
    this.addFeed('page', `page load ${path}`, new Date().toLocaleTimeString());
  }

  clearFeed(): void {
    this.update({ ...this.state, feed: [], counts: EMPTY.counts });
  }

  clearLines(): void {
    this.update({ ...this.state, lines: [] });
  }

  private addFeed(kind: FeedKind, title: string, detail: string, extra: Partial<FeedEntry> = {}): void {
    const entry: FeedEntry = { id: this.nextId++, time: now(), kind, title, detail, ...extra };
    this.update({ ...this.state, feed: [entry, ...this.state.feed].slice(0, MAX_FEED) });
  }

  private addLine(level: LogLine['level'], message: string, error?: string): void {
    const line: LogLine = { id: this.nextId++, time: now(), level, message, ...(error ? { error } : {}) };
    this.update({ ...this.state, lines: [line, ...this.state.lines].slice(0, MAX_LINES) });
  }

  private setCounts(counts: Counts): void {
    this.update({ ...this.state, counts });
  }

  private update(next: JournalState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
    if (this.persist && this.closing) this.saveNow();
    else if (this.persist && this.saveTimer === undefined) {
      this.saveTimer = setTimeout(() => {
        this.saveNow();
      }, SAVE_DELAY_MS);
    }
  }

  private saveNow(): void {
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Full or blocked storage (a sandboxed frame): the journal lives for this page only.
    }
  }
}

function restore(): JournalState {
  try {
    const text = sessionStorage.getItem(STORAGE_KEY);
    if (text === null) return EMPTY;
    const saved = JSON.parse(text) as Partial<JournalState>;
    if (!Array.isArray(saved.feed) || !Array.isArray(saved.lines) || typeof saved.counts !== 'object') return EMPTY;
    return { feed: saved.feed, lines: saved.lines, counts: saved.counts };
  } catch {
    return EMPTY;
  }
}

function titleOf(event: Event): string {
  switch (event.type) {
    case 'track':
      return event.name;
    case 'screen':
      return `screen ${event.name}`;
    case 'identify':
      return `identify ${event.userId ?? ''}`;
    default:
      return 'unknown event';
  }
}

function detailOf(event: Event): string {
  const values = event.type === 'identify' ? event.traits : event.properties;
  const keys = Object.keys(values);
  const session = event.context.session ? `session …${event.context.session.id.slice(-6)}` : 'no session';
  const shown = keys
    .slice(0, 6)
    .map((k) => `${k}=${short(JSON.stringify(values[k]))}`)
    .join(', ');
  const count = `${keys.length} ${keys.length === 1 ? 'property' : 'properties'}`;
  return `${event.source} · ${session} · ${count}${shown ? `\n${shown}` : ''}`;
}

function short(text: string | undefined): string {
  const value = text ?? 'undefined';
  return value.length > 40 ? `${value.slice(0, 40)}…` : value;
}

function errorType(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function echo(level: Exclude<LogLevel, 'off'>, text: string): void {
  // The SDK's own sink writes debug lines with console.log, since Chrome hides console.debug.
  const method = level === 'debug' ? 'log' : level;
  // eslint-disable-next-line no-console -- the demo's logger mirrors the SDK's console sink.
  console[method](text);
}

function now(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
