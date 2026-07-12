import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  snapshotPathTemplate: 'snapshots/{arg}{ext}',
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['Desktop Chrome'],
    viewport: { width: 1200, height: 900 },
    launchOptions: {
      executablePath: '/usr/bin/chromium-browser',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  },
  webServer: {
    command: 'node_modules/.bin/vite',
    url: 'http://localhost:5173/tasting-shrek/',
    reuseExistingServer: true,
  },
  projects: [{ name: 'chromium' }],
});
