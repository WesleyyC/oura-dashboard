import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: "*.spec.mjs", fullyParallel: true,
  forbidOnly: Boolean(process.env.CI), retries: 0, workers: 2,
  reporter: "list", outputDir: "work/results",
  use: {
    baseURL: "http://127.0.0.1:5190", reducedMotion: "reduce",
    screenshot: "only-on-failure", trace: "retain-on-failure", serviceWorkers: "block",
  },
  projects: [
    { name: "chromium-desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 800 }, colorScheme: "light" } },
    { name: "webkit-dark", use: { browserName: "webkit", viewport: { width: 1280, height: 800 }, colorScheme: "dark" } },
    { name: "webkit-phone", use: { browserName: "webkit", viewport: { width: 320, height: 740 }, hasTouch: true, isMobile: true, colorScheme: "light" } },
    { name: "chromium-landscape", use: { browserName: "chromium", viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, colorScheme: "dark" } },
  ],
  webServer: { command: "npm run preview", url: "http://127.0.0.1:5190", reuseExistingServer: false, timeout: 30_000 },
});
