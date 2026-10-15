// The frame of every page: the links between the demo's pages (full page loads, so each one is a
// new `Page Viewed` and a new SDK instance), the host, the SDK's `deviceId` and consent state, and
// the status line of the last action.
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import type { Journal, FeedEntry, LogLine } from '../demo/journal';
import { otherHost } from '../demo/settings';
import { statusLine } from './calls';
import { Btn, Chips, Expect, Pill, usePoll, useStore } from './components';

export interface SdkView {
  readonly deviceId: string;
  readonly isOptedOut: boolean;
}

export const PAGES: readonly { readonly href: string; readonly title: string }[] = [
  { href: '/', title: 'App' },
  { href: '/pages/one.html', title: 'Page one' },
  { href: '/pages/two.html', title: 'Page two' },
  { href: '/pages/bfcache.html', title: 'Back/forward cache' },
  { href: '/spa/', title: 'Single-page area' },
  { href: '/pages/other-host.html', title: 'Subdomains' },
  { href: '/pages/script.html', title: 'Script build' },
  { href: '/pages/snippet.html', title: 'Snippet' },
  { href: '/pages/csp-blocked.html', title: 'CSP blocks the host' },
  { href: '/pages/sandboxed.html', title: 'Sandboxed iframe' },
];

/** The same path on the other subdomain of D15, or undefined on a host without one. */
export function otherHostUrl(path = location.pathname + location.search): string | undefined {
  const host = otherHost(location.hostname);
  return host === undefined
    ? undefined
    : `${location.protocol}//${host}${location.port ? `:${location.port}` : ''}${path}`;
}

export function Shell(props: { title: string; sdk: () => SdkView | undefined; children: ReactNode }) {
  const status = useStore(statusLine);
  // Polled as one string, so the page renders again only when one of the two changes.
  const getSdk = props.sdk;
  const read = useCallback(() => {
    const view = getSdk();
    return view === undefined ? '' : `${String(view.isOptedOut)} ${view.deviceId}`;
  }, [getSdk]);
  const polled = usePoll(read);
  const sdk =
    polled === ''
      ? undefined
      : { isOptedOut: polled.startsWith('true'), deviceId: polled.slice(polled.indexOf(' ') + 1) };
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-row">
          <strong className="brand">Rubicon web demo</strong>
          <span className="host" data-testid="host">
            {location.host}
          </span>
          {sdk === undefined ? (
            <Pill text="SDK not loaded yet" tone="muted" testId="sdk-state" />
          ) : (
            <>
              <Pill
                text={sdk.isOptedOut ? 'not sending' : 'sending'}
                tone={sdk.isOptedOut ? 'warn' : 'ok'}
                testId="sdk-state"
              />
              <code className="device-id" data-testid="device-id" title="deviceId">
                {sdk.deviceId === '' ? 'SDK disabled' : sdk.deviceId}
              </code>
            </>
          )}
        </div>
        <nav className="pages">
          {PAGES.map((p) => (
            <a key={p.href} href={p.href} className={isCurrent(p.href) ? 'current' : undefined}>
              {p.title}
            </a>
          ))}
        </nav>
      </header>
      <main>
        <h1>{props.title}</h1>
        {props.children}
      </main>
      <footer className="status" data-testid="status" aria-live="polite">
        {status}
      </footer>
    </div>
  );
}

function isCurrent(href: string): boolean {
  if (href === '/') return location.pathname === '/' || location.pathname === '/index.html';
  return location.pathname.startsWith(href);
}

/** The recent observer updates and log lines, for the pages that have no Logs tab. */
export function JournalPanel(props: { journal: Journal }) {
  const { feed, lines, counts } = useStore(props.journal);
  const [tab, setTab] = useState<'events' | 'log'>('events');
  const dropped = Object.values(counts.dropped).reduce((a, b) => a + b, 0);
  return (
    <section className="card">
      <h2>What the SDK reported</h2>
      <p className="subtitle">
        queued {counts.queued} · sent {counts.sent} · dropped {dropped} (this tab, kept across page loads)
      </p>
      <Chips
        options={['events', 'log'] as const}
        selected={tab}
        label={(t) => (t === 'events' ? 'Event updates' : 'SDK log')}
        onSelect={setTab}
      />
      {tab === 'events' ? <FeedList feed={feed.slice(0, 40)} /> : <LineList lines={lines.slice(0, 60)} />}
      <Btn
        onClick={() => {
          if (tab === 'events') props.journal.clearFeed();
          else props.journal.clearLines();
        }}
      >
        Clear
      </Btn>
    </section>
  );
}

export function FeedList(props: { feed: readonly FeedEntry[] }) {
  const [open, setOpen] = useState<number | undefined>(undefined);
  if (props.feed.length === 0) return <Expect>Nothing yet. These come from logging.eventObserver.</Expect>;
  return (
    <ul className="list" data-testid="feed">
      {props.feed.map((entry) => (
        <li key={entry.id} className={`feed-${entry.kind}`}>
          <button
            type="button"
            className="row"
            onClick={() => {
              setOpen(open === entry.id ? undefined : entry.id);
            }}
          >
            <span className="time">{entry.time}</span>
            <Pill text={entry.kind} tone={TONES[entry.kind]} />
            <span className="row-title">{entry.title}</span>
          </button>
          <div className="row-detail">{entry.detail}</div>
          {open === entry.id && entry.json ? <pre className="mono">{entry.json}</pre> : null}
        </li>
      ))}
    </ul>
  );
}

const TONES = { queued: 'info', sent: 'ok', dropped: 'bad', page: 'muted' } as const;
const LEVEL_TONES = { debug: 'muted', info: 'info', warn: 'warn', error: 'bad' } as const;

export function LineList(props: { lines: readonly LogLine[] }) {
  if (props.lines.length === 0) return <Expect>No lines at this level.</Expect>;
  return (
    <ul className="list" data-testid="log-lines">
      {props.lines.map((line) => (
        <li key={line.id}>
          <div className="row">
            <span className="time">{line.time}</span>
            <Pill text={line.level} tone={LEVEL_TONES[line.level]} />
            <span className="row-title log-message">{line.message}</span>
          </div>
          {line.error ? <div className="row-detail">with a caught {line.error}</div> : null}
        </li>
      ))}
    </ul>
  );
}
