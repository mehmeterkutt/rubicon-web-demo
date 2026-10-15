// Logs: the SDK's eventObserver (queued, sent, dropped with the reason) and its log lines by level,
// the Android and iOS demos' Logs screen; plus the two callbacks failing on purpose (Web Logging 1).
import { useState } from 'react';
import type { LogLevel } from 'rubicon-analytics';
import type { FeedKind } from '../demo/journal';
import type { Demo } from '../demo/runtime';
import { run } from '../ui/calls';
import { Btn, Chips, Expect, Flow, Pill, SectionCard, useStore } from '../ui/components';
import { FeedList, LineList } from '../ui/shell';

type Level = Exclude<LogLevel, 'off'>;
const LEVELS: readonly Level[] = ['debug', 'info', 'warn', 'error'];
const KINDS: readonly (FeedKind | 'all')[] = ['all', 'queued', 'sent', 'dropped', 'page'];

export function LogsTab(props: { demo: Demo }) {
  const { journal, settings } = props.demo;
  const { feed, lines, counts } = useStore(journal);
  const [tab, setTab] = useState<'events' | 'log'>('events');
  const [kind, setKind] = useState<FeedKind | 'all'>('all');
  const [level, setLevel] = useState<Level>('debug');
  const dropped = Object.entries(counts.dropped);
  return (
    <>
      <div className="tiles">
        <div className="tile">
          <span className="tile-value" data-testid="count-queued">
            {counts.queued}
          </span>
          <span>queued</span>
        </div>
        <div className="tile tile-ok">
          <span className="tile-value" data-testid="count-sent">
            {counts.sent}
          </span>
          <span>sent</span>
        </div>
        <div className="tile tile-bad">
          <span className="tile-value">{dropped.reduce((a, [, n]) => a + n, 0)}</span>
          <span>dropped</span>
        </div>
      </div>
      {dropped.length > 0 ? (
        <Flow>
          {dropped.map(([reason, n]) => (
            <Pill key={reason} text={`${reason} ${n}`} tone="bad" />
          ))}
        </Flow>
      ) : null}
      <Chips
        options={['events', 'log'] as const}
        selected={tab}
        label={(t) => (t === 'events' ? 'Event updates' : 'SDK log')}
        onSelect={setTab}
      />
      {tab === 'events' ? (
        <>
          <Chips options={KINDS} selected={kind} label={(k) => k} onSelect={setKind} />
          <Btn
            onClick={() => {
              journal.clearFeed();
            }}
          >
            Clear
          </Btn>
          <FeedList feed={feed.filter((e) => kind === 'all' || e.kind === kind)} />
        </>
      ) : (
        <>
          <Chips options={LEVELS} selected={level} label={(l) => `${l}+`} onSelect={setLevel} />
          <Btn
            onClick={() => {
              journal.clearLines();
            }}
          >
            Clear
          </Btn>
          {settings.inAppLogger ? null : (
            <Expect>
              The in-app logger is off (Settings): the SDK writes to the browser&apos;s console only, prefixed
              [Rubicon].
            </Expect>
          )}
          <Expect>
            The SDK logs at {settings.logLevel} and above (Settings); off silences everything, debug included.
          </Expect>
          <LineList lines={lines.filter((l) => LEVELS.indexOf(l.level) >= LEVELS.indexOf(level))} />
        </>
      )}
      <SectionCard
        title="Callbacks that fail"
        subtitle="Web Logging 1: a logger or observer that throws is replaced or switched off for the rest of the page; nothing reaches the page."
      >
        <Flow>
          <Btn
            onClick={() => {
              run(journal, 'The observer throws at its next update', () => {
                journal.throwInObserver = true;
              });
            }}
          >
            Observer throws next
          </Btn>
          <Btn
            onClick={() => {
              run(journal, 'The logger throws at its next line', () => {
                journal.throwInLogger = true;
              });
            }}
          >
            Logger throws next
          </Btn>
        </Flow>
        <Expect>
          Observer: OBSERVER_THREW, and no more updates on this page (reload to get them back). Logger: LOGGER_THREW,
          and the SDK&apos;s console sink writes the rest of this page&apos;s lines to the browser&apos;s console.
        </Expect>
      </SectionCard>
    </>
  );
}
