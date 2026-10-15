// The real HTML pages of the demo (pages/*.html): each a full page load with its own SDK instance
// from the npm package, created first, as a site's entry does. `<body data-page>` names the page.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { startDemo } from '../demo/runtime';
import type { Demo } from '../demo/runtime';
import { run } from '../ui/calls';
import { Btn, Expect, Flow, KeyValue, SectionCard } from '../ui/components';
import { JournalPanel, Shell, otherHostUrl } from '../ui/shell';

const demo = startDemo();
const page = document.body.dataset['page'] ?? 'one';

function Page() {
  const content = PAGES[page] ?? PAGES['one'];
  if (content === undefined) return null;
  return (
    <Shell title={content.title} sdk={sdkOf}>
      {content.body(demo)}
      <Actions demo={demo} />
      <JournalPanel journal={demo.journal} />
    </Shell>
  );
}

function sdkOf() {
  return demo.analytics;
}

interface PageContent {
  readonly title: string;
  readonly body: (demo: Demo) => ReactNode;
}

const PAGES: Record<string, PageContent> = {
  one: {
    title: 'Page one',
    body: () => (
      <SectionCard
        title="A full page load"
        subtitle="Web Lifecycle 1 and 2: this page's Page Viewed is its load, once it is visible."
      >
        <KeyValue k="this page" v={<code>{location.pathname + location.search + location.hash}</code>} />
        <Flow>
          <a className="btn btn-primary" href="/pages/two.html">
            To page two (same site)
          </a>
          <a className="btn btn-tonal" href="/pages/two.html?utm_source=page_one&utm_medium=link">
            To page two with utm_*
          </a>
          <a className="btn btn-outline" href="/pages/one.html" target="_blank" rel="noopener">
            This page in a new tab
          </a>
        </Flow>
        <Expect>
          context.page.url is the origin and the path with ids masked, never the query or the fragment; utm_* of this
          page&apos;s address are its Page Viewed&apos;s properties only; page.referrer is the previous page&apos;s
          origin and path.
        </Expect>
        <Expect>
          Opened in a background tab and never shown: no Page Viewed. Shown later: one, then. Returning to the tab:
          none.
        </Expect>
      </SectionCard>
    ),
  },
  two: {
    title: 'Page two',
    body: () => (
      <SectionCard
        title="Another full page load"
        subtitle="Its own SDK instance; the session and the device carry over through the cookies."
      >
        <KeyValue k="this page" v={<code>{location.pathname + location.search + location.hash}</code>} />
        <Flow>
          <a className="btn btn-primary" href="/pages/one.html">
            Back to page one
          </a>
          <a className="btn btn-tonal" href="/users/12345/orders/3f2a9c1e-0b1c-4d2e-8f3a-7b2d9c1e0b1c">
            A 404 page with ids
          </a>
        </Flow>
        <Expect>
          Empty utm values (utm_term=) are left out. The 404 address has no SDK and sends nothing; it is only a referrer
          with ids for the next page, masked as /users/:id/orders/:id.
        </Expect>
      </SectionCard>
    ),
  },
  bfcache: {
    title: 'Back/forward cache',
    body: () => <BackForward />,
  },
  'other-host': {
    title: 'Subdomains',
    body: (d) => <Subdomains demo={d} />,
  },
  sandboxed: {
    title: 'Sandboxed iframe',
    body: (d) => (
      <SectionCard
        title="A frame without storage"
        subtitle='Web Disk 4: an iframe with sandbox="allow-scripts" has an opaque origin, so localStorage and document.cookie throw; the SDK runs from memory for that page.'
      >
        <iframe
          className="frame"
          title="Sandboxed frame"
          sandbox="allow-scripts"
          src={`/pages/sandboxed-frame.html?${new URLSearchParams({ apiKey: d.settings.apiKey, host: d.settings.host }).toString()}`}
        />
        <Expect>
          In the frame: STORAGE_UNAVAILABLE (WARN) once, a deviceId for this frame only, events sent from origin null
          (Server tab, Requests) without context.page.url. This page outside the frame is unaffected.
        </Expect>
      </SectionCard>
    ),
  },
  'csp-blocked': {
    title: 'CSP blocks the host',
    body: (d) => (
      <SectionCard
        title="A Content Security Policy without the host"
        subtitle="This page's policy (a meta tag) allows connect-src 'self' only, so the browser blocks every request to the SDK's host before it leaves (Web HTTP 3 and 6)."
      >
        <KeyValue k="SDK host" v={<code>{d.settings.host}</code>} />
        <Expect>
          CSP_BLOCKED (ERROR) once on this page, from the securitypolicyviolation event; the failure is a network
          failure retried with backoff, and UPLOAD_FAILED_OPAQUE may follow. The events are kept in localStorage, not
          lost: another page of this site sends them later (Web Queue 2).
        </Expect>
      </SectionCard>
    ),
  },
};

function BackForward() {
  const [shows, setShows] = useState<string[]>([]);
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      setShows((list) => [...list, `${new Date().toLocaleTimeString()} pageshow, persisted ${String(e.persisted)}`]);
    };
    addEventListener('pageshow', onShow);
    return () => {
      removeEventListener('pageshow', onShow);
    };
  }, []);
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  return (
    <SectionCard
      title="Leave and come back"
      subtitle="Web Lifecycle 2, Web Session 1, Web Queue 3: a page restored from the back/forward cache is live again."
    >
      <KeyValue k="navigation type" v={navigation?.type ?? 'unknown'} />
      <Mono text={shows.length === 0 ? 'No pageshow since this page loaded.' : shows.join('\n')} />
      <Flow>
        <a className="btn btn-primary" href="/pages/one.html">
          Leave to page one
        </a>
        <a className="btn btn-tonal" href="https://example.com/">
          Leave to another site
        </a>
      </Flow>
      <Expect>
        Then use the browser&apos;s Back button. Restored (persisted true): one Page Viewed of this page, the session
        evaluated again, and the uploads go on where they stopped. Leaving sent what was waiting from pagehide.
      </Expect>
      <Expect>
        The development server (pnpm dev) keeps a WebSocket open, which keeps a page out of the cache in some browsers;
        use the built app (pnpm preview). Chrome lists the reasons a page was not cached under Application, Back/forward
        cache.
      </Expect>
    </SectionCard>
  );
}

function Mono(props: { text: string }) {
  return <pre className="mono">{props.text}</pre>;
}

function Subdomains({ demo: d }: { demo: Demo }) {
  const other = otherHostUrl();
  return (
    <SectionCard
      title="The second subdomain"
      subtitle="Web Identity 2, Web Privacy 2, Web Session 2: one site on two hosts, a.rubicon.test and b.rubicon.test (D15)."
    >
      <KeyValue k="this host" v={<code>{location.host}</code>} />
      <KeyValue k="identity.crossSubdomain" v={String(d.settings.crossSubdomain)} />
      {other === undefined ? (
        <Expect>
          This host has no second subdomain: open the demo on a.rubicon.test (README, Hostnames), or a.rubicon.localhost
          without any setup.
        </Expect>
      ) : (
        <Flow>
          <a className="btn btn-primary" href={other}>
            This page on {new URL(other).host}
          </a>
          <a className="btn btn-outline" href={other} target="_blank" rel="noopener">
            In a new tab
          </a>
        </Flow>
      )}
      <Expect>
        The same deviceId, user and session on both hosts; an opt-out on one is an opt-out on the other; super
        properties and the events waiting in localStorage stay per host. With crossSubdomain off, each host is its own
        device.
      </Expect>
    </SectionCard>
  );
}

function Actions({ demo: d }: { demo: Demo }) {
  const { analytics, journal } = d;
  return (
    <SectionCard title="Calls">
      <Flow>
        <Btn
          kind="primary"
          testId="track"
          onClick={() => {
            run(journal, `Tracked Button Clicked on ${page}`, () => {
              analytics.track('Button Clicked', { page });
            });
          }}
        >
          Track
        </Btn>
        <Btn
          onClick={() => {
            run(journal, 'identify(user-42)', () => {
              analytics.identify('user-42', { plan: 'pro' });
              d.person.identified('user-42');
            });
          }}
        >
          Identify user-42
        </Btn>
        <Btn
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
    </SectionCard>
  );
}

const root = document.getElementById('root');
if (root !== null) createRoot(root).render(<Page />);
