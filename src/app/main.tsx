// The main page: the SDK is created first, as a site's entry does, then the tabs render. The tabs
// are hash routes (#events, ...), which Page Viewed ignores (Web Lifecycle 2); with "Tab screens"
// on (Settings) each tab sends screen("tab_<name>") when shown, as a router of hash routes should.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { startDemo } from '../demo/runtime';
import type { Demo } from '../demo/runtime';
import { Shell } from '../ui/shell';
import { CaptureTab } from './capture-tab';
import { EventsTab } from './events-tab';
import { IdentityTab } from './identity-tab';
import { LogsTab } from './logs-tab';
import { ServerTab } from './server-tab';
import { SettingsTab } from './settings-tab';

const demo = startDemo();
const sdkOf = () => demo.analytics;

const TABS = ['events', 'identity', 'capture', 'server', 'logs', 'settings'] as const;
type Tab = (typeof TABS)[number];
const TITLES: Record<Tab, string> = {
  events: 'Events',
  identity: 'Identity',
  capture: 'Capture',
  server: 'Server',
  logs: 'Logs',
  settings: 'Settings',
};

/** `#capture` and `#capture-123` (the Capture tab's "Change the hash") are both the Capture tab. */
function tabOf(hash: string): Tab {
  const name = hash.replace(/^#/, '').split('-')[0];
  return TABS.find((t) => t === name) ?? 'events';
}

function App(props: { demo: Demo }) {
  const [tab, setTab] = useState<Tab>(() => tabOf(location.hash));
  useEffect(() => {
    const changed = () => {
      setTab(tabOf(location.hash));
    };
    addEventListener('hashchange', changed);
    return () => {
      removeEventListener('hashchange', changed);
    };
  }, []);
  useEffect(() => {
    if (props.demo.settings.tabScreens) props.demo.analytics.screen(`tab_${tab}`);
  }, [tab, props.demo]);
  return (
    <Shell title={TITLES[tab]} sdk={sdkOf}>
      <nav className="tabs" data-testid="tabs">
        {TABS.map((t) => (
          <a key={t} href={`#${t}`} className={t === tab ? 'tab tab-on' : 'tab'} data-testid={`tab-${t}`}>
            {TITLES[t]}
          </a>
        ))}
      </nav>
      <div className="tab-body" data-testid={`body-${tab}`}>
        {tab === 'events' ? <EventsTab demo={props.demo} /> : null}
        {tab === 'identity' ? <IdentityTab demo={props.demo} /> : null}
        {tab === 'capture' ? <CaptureTab demo={props.demo} /> : null}
        {tab === 'server' ? <ServerTab demo={props.demo} /> : null}
        {tab === 'logs' ? <LogsTab demo={props.demo} /> : null}
        {tab === 'settings' ? <SettingsTab demo={props.demo} /> : null}
      </div>
    </Shell>
  );
}

// No StrictMode: it runs effects twice in development, which would send every tab's screen twice.
const root = document.getElementById('root');
if (root !== null) createRoot(root).render(<App demo={demo} />);
