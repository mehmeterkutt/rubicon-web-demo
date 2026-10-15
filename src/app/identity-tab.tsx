// Identity: deviceId, identify, reset, super properties, consent, clearLocalData, "forget me", and
// what the SDK stores in this browser; the Android and iOS demos' Identity screen with the web's
// cookies, tabs and subdomains.
import { useCallback, useState } from 'react';
import type { Demo } from '../demo/runtime';
import { parsePairs } from '../demo/settings';
import { sdkStorage } from '../demo/storage-view';
import { announce, run } from '../ui/calls';
import { Btn, Expect, Field, Flow, KeyValue, Mono, Pill, SectionCard, usePoll, useStore } from '../ui/components';
import { otherHostUrl } from '../ui/shell';

// TypeScript's DOM library does not declare the signal yet (the SDK's README, Consent).
declare global {
  interface Navigator {
    readonly globalPrivacyControl?: boolean;
  }
}

export function IdentityTab(props: { demo: Demo }) {
  return (
    <>
      <ThisBrowser demo={props.demo} />
      <Identify demo={props.demo} />
      <SuperProperties demo={props.demo} />
      <Privacy demo={props.demo} />
      <Storage />
    </>
  );
}

function ThisBrowser({ demo }: { demo: Demo }) {
  const { analytics, journal } = demo;
  const person = useStore(demo.person);
  const { feed } = useStore(journal);
  const deviceId = usePoll(useCallback(() => analytics.deviceId, [analytics]));
  const lastQueued = feed.find((e) => e.kind === 'queued' && e.userId !== undefined);
  const other = otherHostUrl();
  return (
    <SectionCard
      title="This browser"
      subtitle="deviceId is read-only; it changes only with clearLocalData, or when the browser forgets the site (Web Identity 1, 4)."
    >
      <KeyValue
        k="deviceId"
        v={<code>{deviceId === '' ? 'SDK disabled' : deviceId}</code>}
        testId="identity-device-id"
      />
      <KeyValue k="user (as this host told the SDK)" v={person.userId ?? 'anonymous'} />
      <KeyValue
        k="user_id of the last queued event"
        v={lastQueued === undefined ? 'no event queued on this tab yet' : (lastQueued.userId ?? 'null (anonymous)')}
      />
      <Flow>
        <a className="btn btn-outline" href={location.href} target="_blank" rel="noopener">
          Open this page in a new tab
        </a>
        {other === undefined ? null : (
          <a className="btn btn-outline" href={otherHostUrl('/pages/other-host.html')}>
            The other subdomain
          </a>
        )}
      </Flow>
      <Expect>
        Every tab and, with identity.crossSubdomain (Settings), every subdomain shares deviceId, the user and the
        session through the SDK&apos;s cookie; super properties stay per host. A call in another tab after identify
        carries the new user.
      </Expect>
    </SectionCard>
  );
}

function Identify({ demo }: { demo: Demo }) {
  const { analytics, journal, person } = demo;
  const [userId, setUserId] = useState('user-42');
  const [traits, setTraits] = useState('plan=pro, email=ada@example.com');
  return (
    <SectionCard
      title="Identify"
      subtitle="Identity 3 and 4: traits are sent once, with the identify event, and never stored."
    >
      <Field label="User id" value={userId} onChange={setUserId} testId="user-id" />
      <Field label="Traits" value={traits} onChange={setTraits} supporting="key=value, comma separated" />
      <Flow>
        <Btn
          kind="primary"
          testId="identify"
          onClick={() => {
            run(journal, `identify(${userId})`, () => {
              analytics.identify(userId, parsePairs(traits));
              person.identified(userId);
            });
          }}
        >
          Identify
        </Btn>
        <Btn
          kind="tonal"
          onClick={() => {
            run(journal, `identify(${userId}) without traits`, () => {
              analytics.identify(userId);
              person.identified(userId);
            });
          }}
        >
          Without traits
        </Btn>
        <Btn
          onClick={() => {
            run(journal, 'reset()', () => {
              analytics.reset();
              person.cleared();
            });
          }}
        >
          Reset
        </Btn>
        <Btn
          onClick={() => {
            run(journal, 'identify with a blank id', () => {
              analytics.identify('  ');
            });
          }}
        >
          Blank id
        </Btn>
        <Btn
          onClick={() => {
            run(journal, 'identify with 256 characters', () => {
              analytics.identify('u'.repeat(256));
            });
          }}
        >
          Id of 256 characters
        </Btn>
      </Flow>
      <Expect>
        Same id again without traits: nothing. Another id while identified: a new user, the session and the super
        properties cleared first. Blank or too long: ignored with INVALID_USER_ID.
      </Expect>
      <Expect>
        Reset: the user, the super properties and the session go; deviceId and unsent events stay; no event.
      </Expect>
    </SectionCard>
  );
}

function SuperProperties({ demo }: { demo: Demo }) {
  const { analytics, journal, person } = demo;
  const record = useStore(person);
  const [key, setKey] = useState('plan');
  const [value, setValue] = useState('pro');
  const entries = Object.entries(record.superProperties);
  return (
    <SectionCard
      title="Super properties"
      subtitle="Context 5: merged into every later event of this user on this host; the event's own key wins."
    >
      <div className="builder-row">
        <Field label="Key" value={key} onChange={setKey} />
        <Field label="Value" value={value} onChange={setValue} />
      </div>
      <Flow>
        <Btn
          kind="primary"
          onClick={() => {
            run(journal, `register(${key})`, () => {
              analytics.register(key, value);
              person.registered(key, value);
            });
          }}
        >
          Register
        </Btn>
        <Btn
          kind="tonal"
          onClick={() => {
            run(journal, `register(${key}, {...})`, () => {
              const nested = { tier: value, since: new Date(0) };
              analytics.register(key, nested);
              person.registered(key, nested);
            });
          }}
        >
          Register an object
        </Btn>
        <Btn
          kind="tonal"
          onClick={() => {
            run(journal, `register(${key}, null)`, () => {
              analytics.register(key, null);
              person.registered(key, null);
            });
          }}
        >
          Register null
        </Btn>
        <Btn
          onClick={() => {
            run(journal, `unregister(${key})`, () => {
              analytics.unregister(key);
              person.unregistered(key);
            });
          }}
        >
          Unregister
        </Btn>
      </Flow>
      {entries.length === 0 ? (
        <Expect>None registered on this host.</Expect>
      ) : (
        entries.map(([k, v]) => <KeyValue key={k} k={k} v={v} />)
      )}
    </SectionCard>
  );
}

function Privacy({ demo }: { demo: Demo }) {
  const { analytics, journal, person, settings } = demo;
  const optedOut = usePoll(useCallback(() => analytics.isOptedOut, [analytics]));
  return (
    <SectionCard title="Consent and erasure" subtitle="Privacy 1 to 4; Web Privacy 1 to 3.">
      <Flow>
        <Pill text={optedOut ? 'not sending' : 'sending'} tone={optedOut ? 'warn' : 'ok'} testId="consent-state" />
        <Pill
          text={`default consent ${settings.defaultConsent}`}
          tone={settings.defaultConsent === 'pending' ? 'warn' : 'ok'}
        />
        {settings.persistConsent ? null : <Pill text="decision not stored" tone="bad" />}
      </Flow>
      <Flow>
        <Btn
          kind="primary"
          testId="opt-in"
          onClick={() => {
            run(journal, 'optIn()', () => {
              analytics.optIn();
            });
          }}
        >
          Opt in
        </Btn>
        <Btn
          kind="tonal"
          testId="opt-out"
          onClick={() => {
            run(journal, 'optOut()', () => {
              analytics.optOut();
            });
          }}
        >
          Opt out
        </Btn>
        <Btn
          onClick={() => {
            run(journal, 'clearLocalData()', () => {
              analytics.clearLocalData();
              person.cleared();
            });
          }}
        >
          Clear local data
        </Btn>
        <Btn
          onClick={() => {
            const old = analytics.deviceId;
            run(journal, `Forgotten; ask the backend to erase ${old}`, () => {
              analytics.optOut();
              analytics.clearLocalData();
              person.cleared();
            });
          }}
        >
          Forget me
        </Btn>
        <Btn
          onClick={() => {
            run(journal, `Global Privacy Control is ${String(navigator.globalPrivacyControl ?? 'not sent')}`, () => {
              if (navigator.globalPrivacyControl === true) analytics.optOut();
            });
          }}
        >
          Honour Global Privacy Control
        </Btn>
      </Flow>
      <Expect>
        Opt out: no new events of any kind and no uploads, in every tab and subdomain that shares the cookie; only the
        decision is written; stored events wait for opt in (deleted after three days). Opt in: resumes, no event.
      </Expect>
      <Expect>
        While pending (Settings): nothing is written to the browser and nothing is sent; events wait in this page&apos;s
        memory under a temporary deviceId. Opt in writes and sends them, opt out drops them; leaving the page loses
        them.
      </Expect>
      <Expect>
        Clear local data: deletes the events not yet sent (other tabs&apos; too), the user and super properties, renews
        deviceId, keeps the consent decision; collection goes on. Forget me reads deviceId first, then opts out and
        clears.
      </Expect>
      <Expect>
        The SDK reads neither Global Privacy Control nor Do Not Track; the button is the guide&apos;s one line, which
        opts out only when the browser sends the signal.
      </Expect>
    </SectionCard>
  );
}

function Storage() {
  const [items, setItems] = useState(sdkStorage);
  return (
    <SectionCard
      title="What the SDK stores on this host"
      subtitle="Its cookies and localStorage keys by name and size; each one is listed in the SDK's docs/storage-declaration.md (Web Privacy 5)."
    >
      <Btn
        onClick={() => {
          setItems(sdkStorage());
          announce('Storage read again');
        }}
      >
        Read again
      </Btn>
      {items.length === 0 ? (
        <Expect>
          Nothing: a first visit before the first event, pending consent, or after the browser forgot the site.
        </Expect>
      ) : (
        <Mono testId="sdk-storage">
          {items.map((i) => `${i.where.padEnd(13)} ${i.name}  (${i.size} characters)`).join('\n')}
        </Mono>
      )}
      <Expect>
        The cookie rubicon_&lt;keyHash&gt; holds deviceId and the user, rubicon_&lt;keyHash&gt;_s the session and
        rubicon_&lt;keyHash&gt;_c the consent decision; localStorage holds their records (.device, .person, .consent),
        the remote configuration (.remote), a retry pause (.pause) and the events not yet sent (.q1.… chunks).
      </Expect>
    </SectionCard>
  );
}
