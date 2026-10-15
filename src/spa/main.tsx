// The single-page area on React Router (D19), under /spa/: the SDK is created first, as an app's
// entry does, then the router renders. Page Viewed follows pushState, replaceState and popstate
// through the SDK's history wrapper, coalescing a navigation and its redirects within 500 ms into
// one view (Web Lifecycle 2). With "Router screens" on (Settings) every navigation also calls
// screen() with the route template, as a router integration would, so both events arrive.
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Link,
  Navigate,
  matchRoutes,
  useLocation,
  useNavigate,
  useParams,
  useRoutes,
} from 'react-router';
import type { RouteObject } from 'react-router';
import { startDemo } from '../demo/runtime';
import { run } from '../ui/calls';
import { Btn, Expect, Flow, KeyValue, SectionCard } from '../ui/components';
import { JournalPanel, Shell } from '../ui/shell';

const demo = startDemo();
const { analytics, journal } = demo;

function Home() {
  const navigate = useNavigate();
  return (
    <SectionCard
      title="Single-page area"
      subtitle="Client-side navigations: no page load, one Page Viewed per path the visitor sees."
    >
      <Flow>
        <Link className="btn btn-primary" to="/orders" data-testid="spa-orders">
          Orders
        </Link>
        <Link className="btn btn-tonal" to="/login-required">
          Redirect while rendering
        </Link>
        <Link className="btn btn-tonal" to="/old-orders">
          An old address
        </Link>
        <Link className="btn btn-tonal" to="/orders?utm_source=spa&utm_campaign=router&ref=spa">
          Orders with utm_*
        </Link>
      </Flow>
      <Expect>
        Redirect while rendering: /login-required is replaced by /login at once, one view of /login. An old address:
        /old-orders becomes /orders the same way.
      </Expect>
      <Flow>
        <Btn
          onClick={() => {
            run(journal, 'Two pushes in a row', () => {
              void navigate('/orders/1001');
              void navigate('/orders/1002');
            });
          }}
        >
          Two pushes in a row
        </Btn>
        <Btn
          onClick={() => {
            run(journal, 'A push, then a replace after 1 s', () => {
              void navigate('/orders');
              setTimeout(() => void navigate('/orders/1003', { replace: true }), 1_000);
            });
          }}
        >
          Replace after 1 s
        </Btn>
        <Btn
          onClick={() => {
            run(journal, 'A push, then a replace after 100 ms', () => {
              void navigate('/orders');
              setTimeout(() => void navigate('/orders/1004', { replace: true }), 100);
            });
          }}
        >
          Replace after 100 ms
        </Btn>
      </Flow>
      <Expect>
        Two pushes: two views. A replace outside the 500 ms window: a view of each; inside it: one view, of the final
        path. The browser&apos;s Back and Forward (popstate): a view each. Reloading on any path of this area loads it
        again: one view.
      </Expect>
    </SectionCard>
  );
}

function Orders() {
  const location = useLocation();
  return (
    <SectionCard title="Orders" subtitle={`This view: ${location.pathname}${location.search}${location.hash}`}>
      <Flow>
        <Link className="btn btn-primary" to="/orders/4521">
          Order 4521
        </Link>
        <Link className="btn btn-primary" to="/orders/4522">
          Order 4522
        </Link>
        <Link className="btn btn-tonal" to="/orders?sort=desc">
          Sort (query only)
        </Link>
        <Link className="btn btn-tonal" to="/orders#summary">
          Summary (fragment only)
        </Link>
        <Link className="btn btn-outline" to="/">
          Home
        </Link>
      </Flow>
      <Expect>
        Order pages: a view each, context.page.url /spa/orders/:id (ids masked). A change of the query or the fragment
        alone: none.
      </Expect>
    </SectionCard>
  );
}

function Order() {
  const { id } = useParams();
  return (
    <SectionCard title={`Order ${id ?? ''}`} subtitle="A route with an id: /orders/:id.">
      <Flow>
        <Btn
          kind="primary"
          onClick={() => {
            run(journal, 'Tracked Order Viewed', () => {
              analytics.track('Order Viewed', { order_id: id ?? '' });
            });
          }}
        >
          Track Order Viewed
        </Btn>
        <Link className="btn btn-outline" to="/orders">
          All orders
        </Link>
      </Flow>
    </SectionCard>
  );
}

function Login() {
  const navigate = useNavigate();
  return (
    <SectionCard title="Log in" subtitle="Where a guard sends a visitor who is not logged in.">
      <Btn
        kind="primary"
        onClick={() => {
          run(journal, 'identify(user-42), then to /orders', () => {
            analytics.identify('user-42', { plan: 'pro' });
            demo.person.identified('user-42');
            void navigate('/orders');
          });
        }}
      >
        Log in as user-42
      </Btn>
    </SectionCard>
  );
}

function NotFound() {
  return (
    <SectionCard title="Not found" subtitle="A path this area does not know.">
      <Link className="btn btn-outline" to="/">
        Home
      </Link>
    </SectionCard>
  );
}

const ROUTES: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/orders', element: <Orders /> },
  { path: '/orders/:id', element: <Order /> },
  { path: '/login', element: <Login /> },
  { path: '/login-required', element: <Navigate to="/login" replace /> },
  { path: '/old-orders', element: <Navigate to="/orders" replace /> },
  { path: '*', element: <NotFound /> },
];

function RouterScreens() {
  const location = useLocation();
  useEffect(() => {
    if (!demo.settings.routerScreens) return;
    const template = matchRoutes(ROUTES, location)?.at(-1)?.route.path;
    if (template !== undefined && template !== '*' && !template.endsWith('-required') && template !== '/old-orders') {
      analytics.screen(template);
    }
  }, [location]);
  return null;
}

function Area() {
  const routes = useRoutes(ROUTES);
  const location = useLocation();
  return (
    <Shell title="Single-page area" sdk={sdkOf}>
      <KeyValue k="router path" v={<code data-testid="spa-path">{location.pathname}</code>} />
      <RouterScreens />
      {routes}
      <JournalPanel journal={journal} />
    </Shell>
  );
}

function sdkOf() {
  return analytics;
}

const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(
    <BrowserRouter basename="/spa">
      <Area />
    </BrowserRouter>,
  );
}
