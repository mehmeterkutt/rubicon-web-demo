// Capture: what the SDK records by itself in a browser (Web Lifecycle 1, 2, 5, 6, 8; Web Session 1
// to 5) and the ways to try it: full page loads, the single-page area, utm_* links, the back/forward
// cache, hiding and leaving a page, and the app's own calls through createTrackedFetch. The Android
// demo's Capture screen, with pages where Android has activities and deep links.
import { useState } from 'react';
import { API_CALLS } from '../demo/api-calls';
import { AUTOCAPTURE } from '../demo/settings';
import type { Demo } from '../demo/runtime';
import { announce, run } from '../ui/calls';
import { Btn, Expect, Flow, KeyValue, Pill, SectionCard } from '../ui/components';
import { otherHostUrl } from '../ui/shell';

const UTM =
  'utm_source=newsletter&utm_medium=email&utm_campaign=fall&utm_term=shoes&utm_content=banner&ref=demo&token=secret#top';

export function CaptureTab(props: { demo: Demo }) {
  const enabled = props.demo.settings.autocapture;
  return (
    <>
      <SectionCard
        title="Automatic capture"
        subtitle="autocapture.enabled (Settings); the backend may switch each off remotely."
      >
        <Flow>
          {AUTOCAPTURE.map((a) => (
            <Pill key={a} text={a} tone={enabled.includes(a) ? 'ok' : 'bad'} />
          ))}
        </Flow>
        <Expect>
          Page Viewed, Session Started and Session Ended, Network Request (only through createTrackedFetch), and at most
          hourly SDK Diagnostics; all source auto. A remote switch-off of network_requests applies at once, the others
          at the next page load.
        </Expect>
      </SectionCard>
      <PageViews demo={props.demo} />
      <Pages />
      <Leaving demo={props.demo} />
      <Network demo={props.demo} />
    </>
  );
}

function PageViews({ demo }: { demo: Demo }) {
  const { journal } = demo;
  return (
    <SectionCard
      title="Page views"
      subtitle="Web Lifecycle 1 and 2: one Page Viewed per page the visitor sees; its page in context.page.url, its only properties the five utm_*."
    >
      <Flow>
        <a className="btn btn-primary" href="/pages/one.html">
          Full page load
        </a>
        <a className="btn btn-tonal" href={`/pages/one.html?${UTM}`}>
          Campaign link
        </a>
        <a className="btn btn-tonal" href="/pages/two.html?utm_source=partner&utm_term=&utm_campaign=">
          Empty utm values
        </a>
        <a className="btn btn-tonal" href="/spa/">
          Single-page area
        </a>
        <a className="btn btn-tonal" href="/spa/login-required">
          Redirect at load
        </a>
        <a className="btn btn-outline" href="/pages/one.html" target="_blank" rel="noopener">
          New tab
        </a>
      </Flow>
      <Expect>
        Campaign link: utm_source, utm_medium, utm_campaign, utm_term and utm_content as properties; ref in
        context.page.query (Settings, query parameters); never token, never #top, and nothing carried to later events.
        Empty utm values are left out.
      </Expect>
      <Expect>
        Redirect at load: the single-page area replaces /spa/login-required with /spa/login while rendering, within the
        500 ms window: one Page Viewed, of /spa/login, with the load&apos;s time.
      </Expect>
      <Expect>
        Open a link in a background tab (Cmd or Ctrl and click) and leave it unseen: no Page Viewed until it is shown,
        none if closed unseen. Returning to a tab sends nothing.
      </Expect>
      <Flow>
        <Btn
          onClick={() => {
            run(journal, 'pushState with a new query', () => {
              history.pushState(null, '', `?pushed=${Date.now()}${location.hash}`);
            });
          }}
        >
          pushState, query only
        </Btn>
        <Btn
          onClick={() => {
            run(journal, 'Hash changed', () => (location.hash = `capture-${Date.now() % 1000}`));
          }}
        >
          Change the hash
        </Btn>
      </Flow>
      <Expect>
        A change of the query or the fragment alone sends none; so do this page&apos;s tabs, which are hash routes and
        call screen() instead (Settings, tab screens).
      </Expect>
    </SectionCard>
  );
}

function Pages() {
  const other = otherHostUrl('/pages/other-host.html');
  return (
    <SectionCard
      title="Other pages"
      subtitle="Each one a full page load with its own SDK instance on the same browser storage."
    >
      <Flow>
        <a className="btn btn-outline" href="/pages/bfcache.html">
          Back/forward cache
        </a>
        {other === undefined ? (
          <a className="btn btn-outline" href="/pages/other-host.html">
            Subdomains
          </a>
        ) : (
          <a className="btn btn-outline" href={other}>
            The other subdomain
          </a>
        )}
        <a className="btn btn-outline" href="/pages/script.html">
          Script build
        </a>
        <a className="btn btn-outline" href="/pages/snippet.html">
          Two-tag snippet
        </a>
        <a className="btn btn-outline" href="/pages/csp-blocked.html">
          CSP blocks the host
        </a>
        <a className="btn btn-outline" href="/pages/sandboxed.html">
          Sandboxed iframe
        </a>
      </Flow>
      <Expect>
        Back/forward cache: leave that page by a link and come back with the browser&apos;s Back: restored, it sends a
        Page Viewed and goes on where it stopped. Subdomains: the same deviceId, user, session and consent on the other
        host; super properties stay per host.
      </Expect>
    </SectionCard>
  );
}

function Leaving({ demo }: { demo: Demo }) {
  const { analytics, journal, settings } = demo;
  return (
    <SectionCard
      title="Hidden pages, leaving and sessions"
      subtitle={`Web Queue 1 and 3, Web Session 1 to 5. Session inactivity timeout: ${settings.sessionTimeoutMs / 1000} s (Settings).`}
    >
      <Flow>
        <Btn
          onClick={() => {
            run(journal, 'A track in 5 s: switch to another tab now', () => undefined);
            setTimeout(() => {
              analytics.track('Tracked While Hidden', { visibility: document.visibilityState });
            }, 5_000);
          }}
        >
          Track in 5 s
        </Btn>
        <Btn
          onClick={() => {
            analytics.track('Before Reload', { note: 'tracked, then the page reloads at once' });
            location.reload();
          }}
        >
          Track, then reload
        </Btn>
        <Btn
          onClick={() => {
            for (let i = 0; i < 300; i++) analytics.track('Left While Writing', { index: i });
            location.href = '/pages/one.html';
          }}
        >
          300 events, then leave
        </Btn>
      </Flow>
      <Expect>
        Hiding the page (another tab, minimising) sends what waits at once, with keepalive and uncompressed; an event
        from a hidden page joins the open session without extending it.
      </Expect>
      <Expect>
        Leaving: what the writer still holds is written within a small budget; what it could not write is lost and
        counted as page_closed with PAGE_CLOSED, best effort; the closing page reports it, and the next page&apos;s Logs
        tab shows it, since this tab&apos;s journal is kept across page loads. Stored events go on the next page or
        visit.
      </Expect>
      <Expect>
        Sessions: the first event of a visible page starts one; after the timeout without activity, or 12 hours, the
        next event sends Session Ended, backdated to the last activity, and a new Session Started. Tabs and subdomains
        share one session.
      </Expect>
      <Expect>
        Offline: the browser&apos;s developer tools (Network, Offline) or the system&apos;s network switch. Nothing is
        sent and nothing is lost; going online sends after a short delay.
      </Expect>
    </SectionCard>
  );
}

function Network({ demo }: { demo: Demo }) {
  const { settings, trackedFetch, journal } = demo;
  const [results, setResults] = useState<Record<string, string>>({});
  return (
    <SectionCard
      title="HTTP calls through createTrackedFetch"
      subtitle="Web Lifecycle 6 and Privacy 5c: the app's own calls; Network Request events appear on the Logs and Server tabs. The SDK never replaces fetch."
    >
      <KeyValue k="API base" v={settings.apiBase} />
      <KeyValue k="captured hosts" v={settings.captureHosts.join(', ') || 'none'} />
      <KeyValue k="mask path ids" v={String(settings.maskPathIds)} />
      {API_CALLS.map((call) => (
        <div className="case" key={call.id}>
          <Btn
            testId={`api-${call.id}`}
            onClick={() => {
              setResults((r) => ({ ...r, [call.id]: 'running…' }));
              void call.run(trackedFetch, settings.apiBase, settings.host).then((text) => {
                setResults((r) => ({ ...r, [call.id]: text }));
                journal.note(`${call.title}: ${text}`);
                announce(`${call.title}: ${text}`);
              });
            }}
          >
            {call.title}
          </Btn>
          <Expect>{call.expectation}</Expect>
          {results[call.id] ? <div className="result">{results[call.id]}</div> : null}
        </div>
      ))}
      <Expect>
        Never sent: headers, bodies, query strings, fragments. While opted out, while consent is pending or with
        network_requests off, every call passes through unmeasured.
      </Expect>
    </SectionCard>
  );
}
