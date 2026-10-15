// The script build page (pages/script.html): `rubicon.min.js` from a plain script tag with its
// integrity hash installs `window.Rubicon`, and this module creates the instance through it with the
// saved settings, hooks included (Web Public API 2). The npm package is bundled into this page too,
// unused until "Two copies" calls it: a second copy of the SDK on one page.
import { createRoot } from 'react-dom/client';
import { createAnalytics, createTrackedFetch } from 'rubicon-analytics';
import { startDemo } from '../demo/runtime';
import type { SdkFactories } from '../demo/runtime';
import { announce, run } from '../ui/calls';
import { Btn, Expect, Flow, KeyValue, SectionCard } from '../ui/components';
import { JournalPanel, Shell } from '../ui/shell';

declare const __SCRIPT_INTEGRITY__: string;

const global = (window as unknown as { Rubicon?: SdkFactories }).Rubicon;
const demo = startDemo(global ?? { createAnalytics, createTrackedFetch });
const { analytics, journal } = demo;
const sdkOf = () => analytics;
if (global === undefined)
  journal.note('window.Rubicon is missing: the script build did not load; the npm package is used');

function Page() {
  return (
    <Shell title="Script build" sdk={sdkOf}>
      <SectionCard
        title="One script tag"
        subtitle="<script src integrity crossorigin> installs window.Rubicon with createAnalytics, createNoOpAnalytics and createTrackedFetch; no other global."
      >
        <KeyValue k="window.Rubicon" v={global === undefined ? 'missing' : Object.keys(global).join(', ')} />
        <KeyValue k="integrity" v={<code>{__SCRIPT_INTEGRITY__}</code>} />
        <Flow>
          <Btn
            kind="primary"
            testId="track"
            onClick={() => {
              run(journal, 'Tracked Script Button Clicked', () => {
                analytics.track('Script Button Clicked');
              });
            }}
          >
            Track
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
          <Btn
            onClick={() => {
              const script = document.createElement('script');
              script.src = '/sdk/rubicon.min.js';
              document.head.appendChild(script);
              announce('The script build was loaded a second time');
            }}
          >
            Load the file again
          </Btn>
          <Btn
            onClick={() => {
              run(journal, 'The npm copy called createAnalytics', () => {
                const second = createAnalytics(demo.config);
                journal.note(
                  second === analytics
                    ? 'The npm copy returned the script build’s instance'
                    : 'The npm copy returned another object',
                );
                void createTrackedFetch(second, { hosts: ['localhost'] })(`${demo.settings.apiBase}/api/two-copies`);
              });
            }}
          >
            Two copies
          </Btn>
        </Flow>
        <Expect>
          Load the file again: nothing changes, SECOND_INSTANCE (ERROR). Two copies: the npm copy&apos;s createAnalytics
          returns this page&apos;s instance with SECOND_INSTANCE naming both versions; its createTrackedFetch passes the
          call through without a Network Request.
        </Expect>
      </SectionCard>
      <JournalPanel journal={journal} />
    </Shell>
  );
}

const root = document.getElementById('root');
if (root !== null) createRoot(root).render(<Page />);
