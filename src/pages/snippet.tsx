// The two-tag snippet page (pages/snippet.html): the SDK's stub, the page's own init tag
// (snippet/init.js) and the script build loaded async with its integrity hash, under a strict
// policy that allows the stub and the init tag by their hashes, this origin's files and the fake
// backend's origin only (Web HTTP 6, Web Public API 2). This module is the page's UI: it never
// imports the npm package; it calls `window.rubicon`, the stub until the library arrives, then the
// instance.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { EventUpdate, LogLevel } from 'rubicon-analytics';
import { Journal } from '../demo/journal';
import { DEFAULT_HOST } from '../demo/settings';
import { announce } from '../ui/calls';
import { Btn, Expect, Flow, KeyValue, Mono, SectionCard } from '../ui/components';
import { JournalPanel, Shell } from '../ui/shell';
import type { SdkView } from '../ui/shell';

declare const __STUB_HASH__: string;
declare const __SCRIPT_INTEGRITY__: string;

type QueueItem = ['event', EventUpdate] | ['log', LogLevel, string];

interface SnippetWindow {
  rubicon?: Record<string, unknown> & { _q?: unknown[]; __SV?: number };
  demoSnippetQueue?: QueueItem[];
}

const w = window as unknown as SnippetWindow;
const journal = new Journal(true);
journal.pageLoaded(location.pathname + location.search);
const queuedAtStart = Array.isArray(w.rubicon?._q) ? w.rubicon._q.length : undefined;

// The init tag's logger and observer queue their calls; from now on they reach the journal at once.
function deliver(item: QueueItem): number {
  try {
    if (item[0] === 'event') journal.observe(item[1]);
    else journal.log(item[1], item[2]);
  } catch {
    // A failing journal never reaches the SDK's callback.
  }
  return 0;
}
const queue = w.demoSnippetQueue;
if (queue !== undefined) {
  queue.splice(0).forEach(deliver);
  queue.push = (...items: QueueItem[]) => items.reduce((_, item) => deliver(item), 0);
}

/** The instance once the library has replaced the stub; undefined while `window.rubicon` is the stub. */
function instance(): SdkView | undefined {
  const r = w.rubicon;
  return r !== undefined && typeof r['deviceId'] === 'string' ? (r as unknown as SdkView) : undefined;
}

function call(verb: string, ...args: unknown[]): void {
  const fn = w.rubicon?.[verb];
  if (typeof fn === 'function') {
    (fn as (...a: unknown[]) => void).apply(w.rubicon, args);
    journal.note(`rubicon.${verb}()`);
    announce(`rubicon.${verb}() called on the ${instance() ? 'instance' : 'stub'}`);
  } else {
    announce('window.rubicon is missing: the stub did not run');
  }
}

function Page() {
  const [loads, setLoads] = useState(0);
  return (
    <Shell title="Two-tag snippet" sdk={instance}>
      <SectionCard
        title="The snippet under a strict policy"
        subtitle="default-src 'none'; scripts only from this origin and by hash (the stub, the init tag); connect-src only this origin and the fake backend."
      >
        <KeyValue
          k="window.rubicon at this module's start"
          v={
            queuedAtStart === undefined
              ? 'the instance (the library came first)'
              : `the stub, ${queuedAtStart} calls queued`
          }
        />
        <KeyValue k="stub hash" v={<code>{__STUB_HASH__}</code>} />
        <KeyValue k="library integrity" v={<code>{__SCRIPT_INTEGRITY__}</code>} />
        <KeyValue k="policy allows the host" v={<code>{DEFAULT_HOST}</code>} />
        <Expect>
          The stub queues init, the init tag&apos;s Snippet Page Opened and this page&apos;s Page Viewed record; the
          library replays them in order with the time, page and visibility of each call. The browser&apos;s console
          shows no policy violation.
        </Expect>
        <Expect>
          The init tag applies the saved settings but the beforeSend hooks and the extra configuration. A host other
          than {DEFAULT_HOST} in Settings is blocked by this policy: CSP_BLOCKED.
        </Expect>
      </SectionCard>
      <SectionCard title="Calls on window.rubicon">
        <Flow>
          <Btn
            kind="primary"
            testId="track"
            onClick={() => {
              call('track', 'Snippet Button Clicked', { via: 'snippet' });
            }}
          >
            Track
          </Btn>
          <Btn
            onClick={() => {
              call('screen', 'snippet');
            }}
          >
            Screen
          </Btn>
          <Btn
            onClick={() => {
              call('identify', 'user-42', { plan: 'pro' });
            }}
          >
            Identify user-42
          </Btn>
          <Btn
            onClick={() => {
              call('reset');
            }}
          >
            Reset
          </Btn>
          <Btn
            onClick={() => {
              call('optOut');
            }}
          >
            Opt out
          </Btn>
          <Btn
            onClick={() => {
              call('optIn');
            }}
          >
            Opt in
          </Btn>
          <Btn
            testId="flush"
            onClick={() => {
              call('flush');
            }}
          >
            Flush
          </Btn>
          <Btn
            onClick={() => {
              call('clearLocalData');
            }}
          >
            Clear local data
          </Btn>
        </Flow>
        <Flow>
          <Btn
            onClick={() => {
              const script = document.createElement('script');
              script.src = '/sdk/rubicon.min.js';
              document.head.appendChild(script);
              setLoads(loads + 1);
              announce('The library was loaded a second time');
            }}
          >
            Load the library again
          </Btn>
        </Flow>
        <Expect>
          A second load of the file changes nothing and logs SECOND_INSTANCE (ERROR); window.rubicon stays this
          page&apos;s instance{loads > 0 ? ` (loaded again ${loads} time${loads > 1 ? 's' : ''})` : ''}.
        </Expect>
      </SectionCard>
      <SectionCard title="Without the library">
        <Mono>
          {
            'If the library never arrives (an ad blocker, a network error), the calls stay queued in window.rubicon._q and the\npage works as before: block /sdk/rubicon.min.js in the developer tools (Network, Block request URL) and reload.'
          }
        </Mono>
      </SectionCard>
      <JournalPanel journal={journal} />
    </Shell>
  );
}

const root = document.getElementById('root');
if (root !== null) createRoot(root).render(<Page />);
