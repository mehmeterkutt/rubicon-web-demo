// Server: the fake backend from the page, the Android and iOS demos' Server screen with the web's
// CORS controls: how it answers the uploads, the remote configuration, the events it received and
// the requests it saw, preflights included.
import { useCallback, useEffect, useState } from 'react';
import type { Autocapture } from 'rubicon-analytics';
import type { Control, ServerEvent, ServerRequest } from '../demo/backend';
import { eventLabel } from '../demo/backend';
import type { Demo } from '../demo/runtime';
import { AUTOCAPTURE, isRecord } from '../demo/settings';
import { announce } from '../ui/calls';
import {
  Btn,
  Chips,
  Expect,
  Field,
  Flow,
  KeyValue,
  Mono,
  MultiChips,
  Pill,
  SectionCard,
  Toggle,
} from '../ui/components';

const STATUSES = [200, 400, 401, 403, 404, 408, 410, 413, 422, 429, 500, 501, 503] as const;
const MODES = ['normal', 'redirect', 'drop'] as const;

export function ServerTab(props: { demo: Demo }) {
  return (
    <>
      <Connection demo={props.demo} />
      <Responses demo={props.demo} />
      <RemoteConfig demo={props.demo} />
      <ReceivedEvents demo={props.demo} />
      <Requests demo={props.demo} />
    </>
  );
}

/** Runs a call to the fake backend; a failure is told, never thrown. */
async function attempt(block: () => Promise<void>): Promise<void> {
  try {
    await block();
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    announce(`Fake backend unreachable (${name}). Is python3 fake-server/server.py running?`);
  }
}

function describe(control: Control): string {
  return [
    `status ${control.status}`,
    control.retry_after ? `Retry-After ${control.retry_after}` : undefined,
    control.delay_ms ? `delay ${control.delay_ms} ms` : undefined,
    `mode ${control.mode}`,
    `CORS ${control.cors}`,
    control.allow_headers.length ? `extra allowed headers ${control.allow_headers.join(', ')}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function Connection({ demo }: { demo: Demo }) {
  const [state, setState] = useState<{ reachable: boolean; text: string } | undefined>(undefined);
  const check = useCallback(async () => {
    try {
      setState({ reachable: true, text: describe(await demo.backend.control()) });
    } catch (error) {
      setState({ reachable: false, text: error instanceof Error ? error.name : 'unreachable' });
    }
  }, [demo]);
  useEffect(() => {
    void check();
  }, [check]);
  return (
    <SectionCard title="Fake backend" subtitle="fake-server/server.py; the SDK sends to the same host.">
      <Flow>
        <Pill
          text={state === undefined ? 'checking' : state.reachable ? 'reachable' : 'unreachable'}
          tone={state?.reachable ? 'ok' : 'bad'}
          testId="backend-state"
        />
        <code>{demo.settings.host}</code>
      </Flow>
      {state ? <Mono>{state.text}</Mono> : null}
      <Btn onClick={() => void check()}>Check again</Btn>
    </SectionCard>
  );
}

function Responses({ demo }: { demo: Demo }) {
  const [status, setStatus] = useState<number>(200);
  const [retryAfter, setRetryAfter] = useState('');
  const [delayMs, setDelayMs] = useState('0');
  const [mode, setMode] = useState<(typeof MODES)[number]>('normal');
  const [corsOff, setCorsOff] = useState(false);
  const headerNames = Object.keys(demo.settings.headers);
  const apply = (query: string, message: string) =>
    void attempt(async () => {
      const control = await demo.backend.control(query);
      announce(`${message}: ${describe(control)}`);
    });
  return (
    <SectionCard
      title="Batch responses"
      subtitle="How the server answers the SDK's uploads, to see Retry 1 to 5 and Web Retry 1 to 4 at work."
    >
      <Chips options={STATUSES} selected={status as (typeof STATUSES)[number]} label={String} onSelect={setStatus} />
      <Field
        label="Retry-After (seconds)"
        value={retryAfter}
        onChange={setRetryAfter}
        supporting="Empty for none; used with 429 and 503"
      />
      <Field label="Delay (ms)" value={delayMs} onChange={setDelayMs} supporting="Over 45 000 the SDK times out" />
      <Chips options={MODES} selected={mode} label={(m) => m} onSelect={setMode} />
      <Toggle
        label="Leave the CORS headers off"
        checked={corsOff}
        onChange={setCorsOff}
        supporting="As a gateway error page without them: the browser hides the answer, the SDK sees a network failure and logs UPLOAD_FAILED_OPAQUE"
      />
      <Flow>
        <Btn
          kind="primary"
          onClick={() => {
            apply(
              `?status=${status}&retry_after=${encodeURIComponent(retryAfter.trim())}&delay_ms=${Number(delayMs) || 0}&mode=${mode}&cors=${corsOff ? 'off' : 'on'}`,
              'The server now answers',
            );
          }}
        >
          Apply
        </Btn>
        <Btn
          onClick={() =>
            void attempt(async () => {
              await demo.backend.reset();
              setStatus(200);
              setRetryAfter('');
              setDelayMs('0');
              setMode('normal');
              setCorsOff(false);
              announce('The server answers 200 again, with CORS');
            })
          }
        >
          Reset to 200
        </Btn>
      </Flow>
      <Expect>
        5xx, 408, timeouts and drop: kept, backoff 2 s, 10 s, 30 s … up to 10 minutes. 429, or 503 with Retry-After: a
        pause as asked. 400, 422: deleted as rejected. 401, 403, 404, 410, 413, 501, redirect: kept, paused, one ERROR.
        Every tab and page of the site shares a pause; a reload does not end it.
      </Expect>
      <Flow>
        <Btn
          onClick={() => {
            apply(`?allow_headers=${encodeURIComponent(headerNames.join(','))}`, 'The preflight now allows');
          }}
        >
          Allow the extra headers of Settings ({headerNames.length === 0 ? 'none' : headerNames.join(', ')})
        </Btn>
        <Btn
          onClick={() => {
            apply('?allow_headers=', 'The preflight allows the contract headers only');
          }}
        >
          Allow the contract headers only
        </Btn>
      </Flow>
      <Expect>
        The preflight allows Authorization, Content-Type, Content-Encoding and If-None-Match. A network.headers name it
        does not allow stops every upload before it is sent.
      </Expect>
    </SectionCard>
  );
}

interface RemoteForm {
  enabled: boolean;
  off: Autocapture[];
  flushAt: string;
  flushInterval: string;
  sampleRate: string;
  diagnosticsRate: string;
}

const EMPTY_FORM: RemoteForm = {
  enabled: true,
  off: [],
  flushAt: '',
  flushInterval: '',
  sampleRate: '',
  diagnosticsRate: '',
};

function formOf(values: Record<string, unknown> | undefined): RemoteForm {
  if (values === undefined) return EMPTY_FORM;
  const text = (key: string) => {
    const value = values[key];
    return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' ? String(value) : '';
  };
  const off = values['autocapture_off'];
  return {
    enabled: values['enabled'] !== false,
    off: Array.isArray(off) ? AUTOCAPTURE.filter((a) => off.includes(a)) : [],
    flushAt: text('flush_at'),
    flushInterval: text('flush_interval_ms'),
    sampleRate: text('sample_rate'),
    diagnosticsRate: text('diagnostics_sample_rate'),
  };
}

function RemoteConfig({ demo }: { demo: Demo }) {
  const key = demo.settings.apiKey;
  const [form, setForm] = useState<RemoteForm>(EMPTY_FORM);
  const [current, setCurrent] = useState('…');
  const refresh = useCallback(
    () =>
      attempt(async () => {
        const answer = await demo.backend.remoteConfig(key);
        if (answer.status !== 200) {
          setCurrent('none (the server answers 404)');
          setForm(EMPTY_FORM);
          return;
        }
        const values: unknown = JSON.parse(answer.text);
        setCurrent(JSON.stringify(values, null, 2));
        setForm(formOf(isRecord(values) ? values : undefined));
      }),
    [demo, key],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const save = (values: Record<string, unknown>, message: string) =>
    void attempt(async () => {
      await demo.backend.saveRemoteConfig(key, values);
      await refresh();
      announce(message);
    });
  const number = (text: string) => (text.trim() === '' || Number.isNaN(Number(text)) ? undefined : Number(text));
  return (
    <SectionCard
      title="Remote configuration"
      subtitle={`GET /v1/config for ${key} (Configuration 1, Web Configuration 1). It only restricts; saved values apply at the next page load, the kill switch and network_requests at once once read.`}
    >
      <Toggle
        label="enabled"
        checked={form.enabled}
        onChange={(enabled) => {
          setForm({ ...form, enabled });
        }}
        supporting="Off is the kill switch: collection and upload stop"
      />
      <span className="field-label">autocapture_off</span>
      <MultiChips
        options={AUTOCAPTURE}
        selected={form.off}
        label={(a) => a}
        onChange={(off) => {
          setForm({ ...form, off });
        }}
      />
      <Field
        label="flush_at"
        value={form.flushAt}
        onChange={(flushAt) => {
          setForm({ ...form, flushAt });
        }}
        supporting="1 to 100, never below the page's value"
      />
      <Field
        label="flush_interval_ms"
        value={form.flushInterval}
        onChange={(flushInterval) => {
          setForm({ ...form, flushInterval });
        }}
        supporting="1000 to 600000, never below the page's value"
      />
      <Field
        label="sample_rate"
        value={form.sampleRate}
        onChange={(sampleRate) => {
          setForm({ ...form, sampleRate });
        }}
        supporting="0 to 1, by deviceId"
      />
      <Field
        label="diagnostics_sample_rate"
        value={form.diagnosticsRate}
        onChange={(diagnosticsRate) => {
          setForm({ ...form, diagnosticsRate });
        }}
        supporting="0 to 1"
      />
      <Flow>
        <Btn
          kind="primary"
          onClick={() => {
            const values: Record<string, unknown> = { enabled: form.enabled };
            if (form.off.length > 0) values['autocapture_off'] = form.off;
            const entries: [string, number | undefined][] = [
              ['flush_at', number(form.flushAt)],
              ['flush_interval_ms', number(form.flushInterval)],
              ['sample_rate', number(form.sampleRate)],
              ['diagnostics_sample_rate', number(form.diagnosticsRate)],
            ];
            for (const [k, v] of entries) if (v !== undefined) values[k] = v;
            save(values, 'Saved on the server; the SDK reads it at the next page load');
          }}
        >
          Save
        </Btn>
        <Btn
          kind="tonal"
          onClick={() => {
            save({ enabled: false }, 'Kill switch saved; reload to let the SDK read it');
          }}
        >
          Kill switch
        </Btn>
        <Btn
          onClick={() =>
            void attempt(async () => {
              await demo.backend.deleteRemoteConfig(key);
              await refresh();
              announce('Deleted: /v1/config answers 404');
            })
          }
        >
          Delete
        </Btn>
        <Btn
          onClick={() => {
            location.reload();
          }}
        >
          Reload the page
        </Btn>
      </Flow>
      <Mono>{current}</Mono>
    </SectionCard>
  );
}

function ReceivedEvents({ demo }: { demo: Demo }) {
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [open, setOpen] = useState<number | undefined>(undefined);
  const [mine, setMine] = useState(true);
  const refresh = useCallback(
    () =>
      attempt(async () => {
        setEvents((await demo.backend.events()).reverse());
      }),
    [demo],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const deviceId = demo.analytics.deviceId;
  const shown = mine ? events.filter((e) => e.event['device_id'] === deviceId) : events;
  return (
    <SectionCard
      title="Received events"
      subtitle="What the server stored, newest first, exactly as the SDK sent it. Click one for its JSON."
    >
      <Flow>
        <Btn kind="primary" testId="refresh-events" onClick={() => void refresh()}>
          Refresh
        </Btn>
        <Btn
          onClick={() =>
            void attempt(async () => {
              await demo.backend.clearEvents();
              setEvents([]);
            })
          }
        >
          Clear
        </Btn>
        <Toggle label="This browser's deviceId only" checked={mine} onChange={setMine} />
      </Flow>
      <KeyValue k="events" v={`${shown.length} of ${events.length}`} testId="received-count" />
      <ul className="list" data-testid="received">
        {shown.slice(0, 150).map((item) => {
          const properties = item.event['properties'] ?? item.event['traits'];
          return (
            <li key={item.index}>
              <button
                type="button"
                className="row"
                onClick={() => {
                  setOpen(open === item.index ? undefined : item.index);
                }}
              >
                <Pill text={String(item.event['source'])} tone={item.event['source'] === 'auto' ? 'info' : 'ok'} />
                <span className="row-title">{eventLabel(item.event)}</span>
                <span className="time">#{item.index}</span>
              </button>
              <div className="row-detail">
                {String(item.event['type'])} · {JSON.stringify(properties ?? {}).slice(0, 140)}
              </div>
              {open === item.index ? <pre className="mono">{JSON.stringify(item.event, null, 2)}</pre> : null}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function Requests({ demo }: { demo: Demo }) {
  const [requests, setRequests] = useState<ServerRequest[]>([]);
  return (
    <SectionCard
      title="Requests"
      subtitle="The server's view of each request: method, status, origin, size, gzip, the preflights and the headers the SDK sets (Web HTTP 1, 2, 4). Never the key, never Referer."
    >
      <Btn
        onClick={() =>
          void attempt(async () => {
            setRequests(await demo.backend.requests());
          })
        }
      >
        Load the last requests
      </Btn>
      <ul className="list">
        {requests.slice(0, 80).map((r, i) => (
          <li key={i}>
            <div className="row mono-row">
              {r.time} {r.method} {r.path} → {String(r.status)}
            </div>
            <div className="row-detail">
              {[
                r.note || undefined,
                r.origin ? `Origin ${r.origin}` : undefined,
                `gzip=${String(r.gzip)}, ${r.bytes} bytes`,
                r.user_agent ?? undefined,
                r.if_none_match ? `If-None-Match ${r.if_none_match}` : undefined,
              ]
                .filter(Boolean)
                .join('\n')}
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
