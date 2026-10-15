// The demo's Playwright suite: the built app (vite preview on 4173) and the fake backend (8080), both
// started here, in Chromium, Firefox and WebKit. The hostnames of D15 resolve to the loopback
// interface as in the SDK's own browser tests, with no change to the machine: a host resolver rule in
// Chromium, the `network.dns.localDomains` preference in Firefox, and in WebKit, which has neither,
// a proxy (e2e/proxy.ts, set in e2e/fixtures.ts). docs/decisions.md, step 9.2.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const HOSTS = ['a.rubicon.test', 'b.rubicon.test'];

// macOS 27 protects ~/Library/Application Support/Firefox, which Playwright's Firefox reads even with
// its own profile; its home is pointed at a temporary directory, as the SDK's configuration does
// (SDK plan section 15, 2026-10-14).
const firefoxHome = join(tmpdir(), 'rubicon-web-demo-firefox-home');
if (process.platform === 'darwin') mkdirSync(firefoxHome, { recursive: true });

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  // Both servers belong to the run: a server already on one of the ports fails the run instead of
  // being reused with someone's /control settings (README, Check).
  webServer: [
    {
      command: 'python3 fake-server/server.py 8080',
      url: 'http://127.0.0.1:8080/control',
      reuseExistingServer: false,
      stdout: 'ignore',
    },
    {
      command: 'pnpm exec vite build --logLevel warn && pnpm exec vite preview',
      url: 'http://127.0.0.1:4173/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--host-resolver-rules=MAP *.rubicon.test 127.0.0.1'] },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: { 'network.dns.localDomains': HOSTS.join(',') },
          ...(process.platform === 'darwin' ? { env: { ...process.env, CFFIXED_USER_HOME: firefoxHome } } : {}),
        },
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
