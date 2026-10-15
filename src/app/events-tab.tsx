// Events: quick events, an event builder, every value conversion of Web Serialization 2, every
// rejected value and limit, volume, the hooks and the developer errors; the Android and iOS demos'
// Events screen with the browser's value table.
import { useState } from 'react';
import { createAnalytics } from 'rubicon-analytics';
import type { Demo } from '../demo/runtime';
import { hookTitle } from '../demo/hooks';
import { run } from '../ui/calls';
import { Btn, Chips, Expect, Field, Flow, SectionCard } from '../ui/components';

export function EventsTab(props: { demo: Demo }) {
  return (
    <>
      <QuickEvents demo={props.demo} />
      <EventBuilder demo={props.demo} />
      <ValueTypes demo={props.demo} />
      <Rejected demo={props.demo} />
      <Limits demo={props.demo} />
      <Volume demo={props.demo} />
      <Hooks demo={props.demo} />
      <DeveloperErrors demo={props.demo} />
    </>
  );
}

function QuickEvents({ demo }: { demo: Demo }) {
  const { analytics, journal, settings } = demo;
  const immediate = settings.immediateEvents;
  return (
    <SectionCard
      title="Quick events"
      subtitle="Watch them on the Logs tab (queued, then sent) and on the Server tab (as received)."
    >
      <Flow>
        <Btn
          kind="primary"
          testId="track"
          onClick={() => {
            run(journal, 'Tracked Button Clicked', () => {
              analytics.track('Button Clicked', { button: 'quick' });
            });
          }}
        >
          Track
        </Btn>
        <Btn
          kind="tonal"
          onClick={() => {
            run(journal, 'Sent screen checkout', () => {
              analytics.screen('checkout', { origin: 'events_tab' });
            });
          }}
        >
          Screen
        </Btn>
        <Btn
          kind="tonal"
          onClick={() => {
            run(journal, 'Tracked Purchase Completed', () => {
              analytics.track('Purchase Completed', { amount: 9.99, currency: 'USD', items: 2 });
            });
          }}
        >
          Purchase
        </Btn>
        <Btn
          testId="flush"
          onClick={() => {
            run(journal, 'Flush requested', () => {
              analytics.flush();
            });
          }}
        >
          Flush
        </Btn>
      </Flow>
      <Expect>
        {immediate.includes('Purchase Completed')
          ? 'Purchase Completed is an immediate event: it is uploaded as soon as it is stored.'
          : `Immediate events: ${immediate.length === 0 ? 'none' : immediate.join(', ')} (Settings).`}{' '}
        Otherwise an upload follows {settings.flushAt} waiting events or {settings.flushIntervalMs / 1000} s after the
        first one; flush() asks for one at once.
      </Expect>
      <Expect>
        screen() takes a key of your tracking plan or a route template (checkout, /orders/:id), never a filled path; the
        SDK never sends one by itself.
      </Expect>
    </SectionCard>
  );
}

type RowType = 'text' | 'number' | 'boolean' | 'null' | 'undefined' | 'date' | 'bigint' | 'list' | 'map';
const ROW_TYPES: readonly RowType[] = [
  'text',
  'number',
  'boolean',
  'null',
  'undefined',
  'date',
  'bigint',
  'list',
  'map',
];

interface Row {
  readonly id: number;
  readonly key: string;
  readonly type: RowType;
  readonly value: string;
}

function valueOf(row: Row): unknown {
  const text = row.value.trim();
  switch (row.type) {
    case 'text':
      return row.value;
    case 'number':
      return Number(text);
    case 'boolean':
      return text.toLowerCase() === 'true';
    case 'null':
      return null;
    case 'undefined':
      return undefined;
    case 'date':
      return new Date();
    case 'bigint':
      try {
        return BigInt(text);
      } catch {
        return BigInt(0);
      }
    case 'list':
      return text
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
    case 'map':
      return Object.fromEntries(
        text
          .split(',')
          .map((pair) => pair.split('=', 2).map((s) => s.trim()))
          .filter((p): p is [string, string] => p.length === 2),
      );
    default:
      return row.value;
  }
}

function EventBuilder({ demo }: { demo: Demo }) {
  const { analytics, journal } = demo;
  const [name, setName] = useState('Feature Used');
  const [rows, setRows] = useState<Row[]>([
    { id: 1, key: 'feature', type: 'text', value: 'search' },
    { id: 2, key: 'count', type: 'number', value: '3' },
    { id: 3, key: 'premium', type: 'boolean', value: 'true' },
  ]);
  const change = (id: number, patch: Partial<Row>) => {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const properties = () => Object.fromEntries(rows.map((r) => [r.key, valueOf(r)]));
  return (
    <SectionCard
      title="Build an event"
      subtitle="Any name and typed properties: number is parsed (abc gives NaN), date is now, bigint parses the text, list is comma separated, map is k=v pairs."
    >
      <Field label="Name" value={name} onChange={setName} testId="builder-name" />
      {rows.map((row) => (
        <div className="builder-row" key={row.id}>
          <Field
            label="Key"
            value={row.key}
            onChange={(key) => {
              change(row.id, { key });
            }}
          />
          {row.type === 'null' || row.type === 'undefined' || row.type === 'date' ? null : (
            <Field
              label="Value"
              value={row.value}
              onChange={(value) => {
                change(row.id, { value });
              }}
            />
          )}
          <Chips
            options={ROW_TYPES}
            selected={row.type}
            label={(t) => t}
            onSelect={(type) => {
              change(row.id, { type });
            }}
          />
          <Btn
            onClick={() => {
              setRows(rows.filter((r) => r.id !== row.id));
            }}
          >
            Remove
          </Btn>
        </div>
      ))}
      <Flow>
        <Btn
          onClick={() => {
            setRows([
              ...rows,
              { id: Math.max(0, ...rows.map((r) => r.id)) + 1, key: `key${rows.length + 1}`, type: 'text', value: '' },
            ]);
          }}
        >
          Add property
        </Btn>
        <Btn
          kind="primary"
          onClick={() => {
            run(journal, `Tracked ${name}`, () => {
              analytics.track(name, properties());
            });
          }}
        >
          Send as track
        </Btn>
        <Btn
          kind="tonal"
          onClick={() => {
            run(journal, `Sent screen ${name}`, () => {
              analytics.screen(name, properties());
            });
          }}
        >
          Send as screen
        </Btn>
      </Flow>
    </SectionCard>
  );
}

function ValueTypes({ demo }: { demo: Demo }) {
  const { analytics, journal } = demo;
  return (
    <SectionCard title="Every value type" subtitle="Web Serialization 2: what the SDK accepts and how it converts it.">
      <Btn
        kind="primary"
        testId="all-types"
        onClick={() => {
          run(journal, 'Tracked All Types', () => {
            analytics.track('All Types', {
              string: 'text',
              int: 42,
              float: 1.1,
              beyond_safe: 2 ** 53 + 2,
              boolean: true,
              null: null,
              undefined_value: undefined,
              list_with_undefined: ['a', undefined, , 'b'], // eslint-disable-line no-sparse-arrays -- a hole, on purpose
              bigint_safe: BigInt(9007199254740991),
              boxed_number: Object(5) as unknown,
              boxed_string: Object('boxed') as unknown,
              boxed_boolean: Object(true) as unknown,
              date: new Date(0),
              date_year_9999: new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 999)),
              list: ['a', 1, null, [true]],
              set: new Set(['x', 'y']),
              typed_array: new Float64Array([0.5, 1.5]),
              map: new Map<string, unknown>([
                ['tier', 'gold'],
                ['level', 3],
              ]),
              plain_object: { level1: { level2: { level3: 'deepest allowed' } } },
              null_prototype: Object.assign(Object.create(null) as object, { kind: 'no prototype' }),
              url: new URL('https://example.com/a?b=1#c'),
              unicode: 'ğüşİıöç 日本 😀',
            });
          });
        }}
      >
        Track every allowed type
      </Btn>
      <Expect>
        undefined_value is left out; the undefined and the hole in the list become null; the safe BigInt, boxed values
        and 2^53+2 arrive as numbers and values; the dates as 1970-01-01T00:00:00.000Z and 9999-12-31T23:59:59.999Z; the
        Set, the typed array and the list as lists; the Map, the plain and the null-prototype object as objects; the URL
        as its href. No warning.
      </Expect>
      <Btn
        onClick={() => {
          run(journal, 'Tracked Other Realm', () => {
            const frame = document.createElement('iframe');
            frame.hidden = true;
            document.body.appendChild(frame);
            const realm = frame.contentWindow as (Window & typeof globalThis) | null;
            if (realm === null) return;
            analytics.track('Other Realm', {
              object: new realm.Object(),
              filled: realm.JSON.parse('{"a":1,"b":[1,2]}') as unknown,
              array: realm.Array.of(1, 2, 3),
              date: new realm.Date(0),
              map: new realm.Map([['k', 'v']]),
            });
            frame.remove();
          });
        }}
      >
        Values from an iframe&apos;s realm
      </Btn>
      <Expect>
        Objects, arrays, dates and maps made by another window are converted as this window&apos;s: types are told by
        Object.prototype.toString, never instanceof.
      </Expect>
    </SectionCard>
  );
}

class Product {
  constructor(readonly sku: string) {}
}

/** A moment object as the SDK recognises one: by the marker moment sets on its instances. */
class MomentLike {
  readonly _isAMomentObject = true;
}

function Rejected({ demo }: { demo: Demo }) {
  const { analytics, journal } = demo;
  const cases: { title: string; expect: string; run: () => void }[] = [
    {
      title: 'Numbers the JSON cannot hold',
      expect: 'NaN, Infinity and a BigInt beyond the safe range: each drops its key with PROPERTY_DROPPED; kept stays',
      run: () => {
        analytics.track('Bad Numbers', { nan: NaN, infinity: Infinity, big: BigInt(2) ** BigInt(64), kept: 'stays' });
      },
    },
    {
      title: 'Dates the SDK refuses',
      expect:
        'An invalid Date and the year 10000 are dropped; the moment-like object with the hint to pass a Date, epoch milliseconds or an ISO string',
      run: () => {
        analytics.track('Bad Dates', {
          invalid: new Date('not a date'),
          year_10000: new Date(Date.UTC(10000, 0, 1)),
          moment_like: new MomentLike(),
          kept: 'stays',
        });
      },
    },
    {
      title: 'Objects the SDK never converts',
      expect:
        'A class instance, Error, RegExp, Promise, function, Symbol, ArrayBuffer, DataView, Blob, an object with toJSON (never run) and a DOM node: each key dropped, its type named, never its value',
      run: () => {
        analytics.track('Bad Objects', {
          class_instance: new Product('A-1'),
          error: new Error('never sent'),
          regexp: /x/,
          promise: Promise.resolve(1),
          fn: () => 1,
          symbol: Symbol('s'),
          array_buffer: new ArrayBuffer(4),
          data_view: new DataView(new ArrayBuffer(4)),
          blob: new Blob(['x']),
          to_json: { toJSON: () => 'never called' },
          dom_node: document.body,
          kept: 'stays',
        });
      },
    },
    {
      title: 'A getter and a Proxy that throw',
      expect: 'Read once during the call: the throwing key is dropped, the event kept, nothing reaches the page',
      run: () => {
        const getter = Object.defineProperty({ fine: 1 }, 'broken', {
          enumerable: true,
          get() {
            throw new Error('getter failed');
          },
        });
        const proxy = new Proxy(
          {},
          {
            ownKeys() {
              throw new Error('proxy failed');
            },
          },
        );
        analytics.track('Throwing Values', { getter, proxy, kept: 'stays' });
      },
    },
    {
      title: 'A Map with a number key',
      expect: 'A Map is an object only with string keys: the map is dropped',
      run: () => {
        analytics.track('Bad Map', { map: new Map<unknown, unknown>([[1, 'x']]), kept: 'stays' });
      },
    },
    {
      title: 'Properties that are not an object',
      expect: 'An array instead of an object: the properties become {} with a warning; the event is kept',
      run: () => {
        analytics.track('Array Properties', ['a', 'b'] as unknown as Record<string, unknown>);
      },
    },
  ];
  return (
    <SectionCard
      title="Rejected values"
      subtitle="Each one breaks a rule. A WARN with the key and the type, never the value, and only that key or element dropped (Logs tab); debug on writes it as console.error(new Error(...)). Never a throw."
    >
      {cases.map((c) => (
        <Case
          key={c.title}
          title={c.title}
          expect={c.expect}
          onClick={() => {
            run(journal, c.title, c.run);
          }}
        />
      ))}
    </SectionCard>
  );
}

function Limits({ demo }: { demo: Demo }) {
  const { analytics, journal } = demo;
  const cases: { title: string; expect: string; run: () => void }[] = [
    {
      title: 'Bad keys',
      expect:
        'An empty key, a key of spaces and a key of 256 characters drop themselves; a lone surrogate in a key becomes U+FFFD',
      run: () => {
        analytics.track('Bad Keys', { '': 1, '  ': 2, ['k'.repeat(256)]: 3, 'a\uD800b': 4, kept: true });
      },
    },
    {
      title: 'Nesting deeper than 3',
      expect: 'Three objects inside a property are allowed; the fourth is dropped, so c arrives empty',
      run: () => {
        analytics.track('Too Deep', { a: { b: { c: { d: { e: 'too deep' } } } } });
      },
    },
    {
      title: 'A string over 1024 characters',
      expect: 'Cut at 1024 UTF-16 code units, never inside a surrogate pair, no marker, one PROPERTY_TRUNCATED',
      run: () => {
        analytics.track('Long Text', { text: `a${'😀'.repeat(700)}` });
      },
    },
    {
      title: '300 properties',
      expect: 'Over 256 with the super properties: the rest is dropped, super properties first (TOO_MANY_PROPERTIES)',
      run: () => {
        analytics.track(
          'Many Properties',
          Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`p${i + 1}`, i + 1])),
        );
      },
    },
    {
      title: 'A name of 256 characters',
      expect: 'Dropped, never trimmed (INVALID_EVENT_NAME)',
      run: () => {
        analytics.track('N'.repeat(256));
      },
    },
    {
      title: 'An empty name',
      expect: 'Dropped (INVALID_EVENT_NAME)',
      run: () => {
        analytics.track('');
      },
    },
    {
      title: 'A name of spaces',
      expect: 'Blank, so dropped (INVALID_EVENT_NAME); a name is never trimmed',
      run: () => {
        analytics.track('   ');
      },
    },
    {
      title: 'An event over 32 KB',
      expect: 'Its line is over 32 KB of UTF-8: dropped as oversize (EVENT_OVERSIZE)',
      run: () => {
        analytics.track(
          'Huge Event',
          Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`chunk${i + 1}`, 'x'.repeat(1000)])),
        );
      },
    },
    {
      title: 'An unpaired surrogate',
      expect: 'Becomes U+FFFD, in a name too',
      run: () => {
        analytics.track('Broken \uDC00 Text', { text: 'a\uD800b' });
      },
    },
    {
      title: 'Change the object after track',
      expect: 'The SDK copies during the call: the server sees before',
      run: () => {
        const values = { state: 'before', list: ['before'] };
        analytics.track('Copied Object', values);
        values.state = 'after';
        values.list.push('after');
      },
    },
  ];
  return (
    <SectionCard
      title="Limits"
      subtitle="Serialization 3 and Web Serialization 1: names, keys, depth, strings, counts, size."
    >
      {cases.map((c) => (
        <Case
          key={c.title}
          title={c.title}
          expect={c.expect}
          onClick={() => {
            run(journal, c.title, c.run);
          }}
        />
      ))}
    </SectionCard>
  );
}

function Case(props: { title: string; expect: string; onClick: () => void }) {
  return (
    <div className="case">
      <Btn onClick={props.onClick}>{props.title}</Btn>
      <Expect>{props.expect}</Expect>
    </div>
  );
}

function Volume({ demo }: { demo: Demo }) {
  const { analytics, journal } = demo;
  return (
    <SectionCard
      title="Volume"
      subtitle="Web Queue 1, 5 and 6. Set the server to 503 first (Server tab) to see the queue fill up."
    >
      <Flow>
        <Btn
          onClick={() => {
            run(journal, 'Funnel tracked', () => {
              ['Product Viewed', 'Add To Cart', 'Checkout Started', 'Payment Submitted', 'Order Completed'].forEach(
                (step, i) => {
                  analytics.track(step, { step: i + 1, order_id: 'ord-1001' });
                },
              );
            });
          }}
        >
          Checkout funnel
        </Btn>
        <Btn
          onClick={() => {
            run(journal, '50 events', () => {
              for (let i = 0; i < 50; i++) analytics.track('Burst Event', { index: i });
            });
          }}
        >
          Burst 50
        </Btn>
        <Btn
          onClick={() => {
            run(journal, '1200 events', () => {
              for (let i = 0; i < 1200; i++) analytics.track('Queue Filler', { index: i });
            });
          }}
        >
          1200 events
        </Btn>
        <Btn
          onClick={() => {
            run(journal, '1200 events in 12 tasks', () => {
              for (let t = 0; t < 12; t++) {
                setTimeout(() => {
                  for (let i = 0; i < 100; i++) analytics.track('Task Event', { task: t, index: i });
                }, t * 50);
              }
            });
          }}
        >
          12 tasks × 100
        </Btn>
      </Flow>
      <Expect>
        The calls return at once; the writer stores them after the next paint, in slices. 1200 in one task can exceed
        the writer&apos;s call queue (backpressure); 1200 waiting events exceed the queue of 1000 or its 1 MiB
        (queue_full, the oldest first).
      </Expect>
      <Expect>Events keep their call order: check the index on the Server tab.</Expect>
    </SectionCard>
  );
}

function Hooks({ demo }: { demo: Demo }) {
  const { analytics, journal, settings } = demo;
  const active = settings.hooks;
  const on = (id: (typeof active)[number]) => active.includes(id);
  return (
    <SectionCard
      title="beforeSend hooks"
      subtitle={`Active: ${active.length === 0 ? 'none' : active.map(hookTitle).join(', ')} (Settings).`}
    >
      <Flow>
        <Btn
          onClick={() => {
            run(journal, 'Tracked Debug Event', () => {
              analytics.track('Debug Event', { note: 'should be dropped' });
            });
          }}
        >
          Debug Event
        </Btn>
        <Btn
          onClick={() => {
            run(journal, 'Tracked Hook Test', () => {
              analytics.track('Hook Test');
            });
          }}
        >
          Hook Test
        </Btn>
        <Btn
          onClick={() => {
            run(journal, 'Tracked Async Hook Test', () => {
              analytics.track('Async Hook Test');
            });
          }}
        >
          Async Hook Test
        </Btn>
        <Btn
          onClick={() => {
            run(journal, 'Tracked Signed Up', () => {
              analytics.track('Signed Up', { email: 'ada@example.com', plan: 'pro' });
            });
          }}
        >
          Event with email
        </Btn>
      </Flow>
      <Expect>
        {[
          on('dropDebugEvents') ? 'Debug Event: dropped as before_send.' : 'Debug Event: sent (its hook is off).',
          on('throwOnHookTest')
            ? 'Hook Test: dropped, HOOK_THREW; the page goes on.'
            : 'Hook Test: sent (turn on "Throw on Hook Test" in Settings).',
          on('asyncOnHookTest')
            ? 'Async Hook Test: dropped, HOOK_VIOLATION.'
            : 'Async Hook Test: sent (turn on the async hook in Settings).',
          on('maskEmail') ? 'Email: the value arrives as ***.' : 'Email: sent as is (its hook is off).',
          on('renamePageViewed') ? 'Every Page Viewed is dropped with HOOK_VIOLATION.' : '',
        ].join(' ')}
      </Expect>
      <Expect>SDK Diagnostics never reaches a hook.</Expect>
    </SectionCard>
  );
}

function DeveloperErrors({ demo }: { demo: Demo }) {
  const { analytics, journal, settings } = demo;
  return (
    <SectionCard
      title="Developer errors"
      subtitle={`WARN or ERROR lines with their code, under the log level (now ${settings.logLevel}); debug ${settings.debug ? 'on: the console shows them as console.error(new Error(...)) when the in-app logger is off' : 'off'}. Never a throw.`}
    >
      <Case
        title="A second createAnalytics"
        expect="Returns this page's instance and logs SECOND_INSTANCE (ERROR) naming both versions"
        onClick={() => {
          run(journal, 'createAnalytics called again', () => {
            // This page's configuration with another key: the factory logs through the second call's
            // logger, so the line reaches the Logs tab.
            const second = createAnalytics({ ...demo.config, apiKey: 'rk_other' });
            journal.note(
              second === analytics
                ? 'The second call returned the first instance'
                : 'The second call returned another object',
            );
          });
        }}
      />
      <Case
        title="identify with a blank id"
        expect="Ignored (INVALID_USER_ID)"
        onClick={() => {
          run(journal, 'identify("")', () => {
            analytics.identify('');
          });
        }}
      />
      <Case
        title="register with a function"
        expect="The value is dropped with PROPERTY_DROPPED; nothing is registered"
        onClick={() => {
          run(journal, 'register(fn)', () => {
            analytics.register('callback', () => 1);
          });
        }}
      />
      <Expect>
        Invalid configuration (a blank API key, an invalid host, numbers out of range, a wrong type, another
        platform&apos;s setting) is tried from Settings, with its extra configuration field.
      </Expect>
    </SectionCard>
  );
}
