import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: "list",
  outputDir: process.env.BROWSER_TEST_OUTPUT_DIR || "work/results",
  use: {
    baseURL: "http://127.0.0.1:5189",
    browserName: "chromium",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-light", use: { viewport: { width: 1280, height: 800 }, colorScheme: "light" } },
    { name: "desktop-dark", use: { viewport: { width: 1280, height: 800 }, colorScheme: "dark" } },
    { name: "phone-light", use: { viewport: { width: 390, height: 844 }, colorScheme: "light", hasTouch: true, isMobile: true } },
    { name: "phone-dark", use: { viewport: { width: 320, height: 740 }, colorScheme: "dark", hasTouch: true, isMobile: true } },
    { name: "landscape", use: { viewport: { width: 844, height: 390 }, colorScheme: "light", hasTouch: true, isMobile: true } },
  ],
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:5189",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
