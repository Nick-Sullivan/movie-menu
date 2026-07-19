import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// WSL can't run Playwright's bundled Chromium, so the system one is used
// when present; anywhere without it (e.g. CI) falls back to the bundled
// browser (`playwright install chromium`).
const systemChromium = "/usr/bin/chromium-browser";

export default defineConfig({
  testDir: "./tests",
  snapshotPathTemplate: "snapshots/{arg}{ext}",
  use: {
    baseURL: "http://localhost:5173",
    ...devices["Desktop Chrome"],
    viewport: { width: 1200, height: 900 },
    launchOptions: {
      executablePath: existsSync(systemChromium) ? systemChromium : undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },
  webServer: {
    command: "node_modules/.bin/vite",
    url: "http://localhost:5173/the-movie-menu/",
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium" }],
});
