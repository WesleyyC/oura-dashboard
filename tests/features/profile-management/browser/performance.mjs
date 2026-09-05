// On-demand lab measurement only. No operator environment, backend or telemetry.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";

const project = fileURLToPath(new URL("../../../../", import.meta.url));
const output = fileURLToPath(new URL("work/performance", import.meta.url));
const origin = "http://127.0.0.1:5191";
const now = "2026-09-04T12:00:00.000Z";
const profiles = Array.from({ length: 8 }, (_, index) => ({
  id: `synthetic-profile-${index}`, slug: index ? `person-${index}` : "alex",
  displayName: index ? `Person ${index + 1}` : "Alex", colorKey: "ocean",
  sortOrder: index, status: "connected", updatedAt: now, lastSucceededAt: now,
  coverageStartDate: "2026-01-01", safeErrorCode: null,
}));
const config = {
  configFile: false, envDir: false, logLevel: "warn",
  root: fileURLToPath(new URL("performance-fixture", import.meta.url)),
  publicDir: `${project}/public`,
  define: { "process.env": JSON.stringify({ NODE_ENV: "production" }) },
  plugins: [react()],
  resolve: { alias: { "@": project, "next/link": fileURLToPath(import.meta.resolve("vinext/shims/link")) } },
  build: { outDir: `${output}/dist`, emptyOutDir: true },
  preview: { host: "127.0.0.1", port: 5191, strictPort: true },
};

await build(config);
const server = await preview(config);
let browser;
const samples = [];
try {
  browser = await chromium.launch();
  for (let sample = 0; sample < 5; sample++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true, reducedMotion: "reduce",
      serviceWorkers: "block", timezoneId: "UTC",
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      const errors = [];
      const requests = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.clock.setFixedTime(new Date(now));
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false, latency: 100, downloadThroughput: 200_000,
        uploadThroughput: 93_750, connectionType: "cellular3g",
      });
      await page.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin || request.method() !== "GET") {
          errors.push("Unexpected external or non-GET request");
          return route.abort();
        }
        if (!url.pathname.startsWith("/api/")) return route.continue();
        requests.push(url.pathname + url.search);
        // Intercepted API responses do not model server latency: add it explicitly.
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (url.pathname === "/api/profiles") return route.fulfill({ json: { profiles } });
        if (url.pathname === "/api/health") {
          const profile = profiles.find(({ slug }) => slug === url.searchParams.get("profile"));
          assert.ok(profile, "unknown synthetic profile");
          const records = Array.from({ length: 185 }, (_, index) => ({
            date: new Date(Date.UTC(2026, 2, 4 + index)).toISOString().slice(0, 10),
            readinessScore: 80 + index % 4, sleepScore: 82, activityScore: 78,
            steps: 8000, totalSleepMinutes: 450,
          })).filter(({ date }) => date >= url.searchParams.get("start") && date <= url.searchParams.get("end"));
          return route.fulfill({ json: { profile, records, updatedAt: now } });
        }
        errors.push("Unexpected API route");
        return route.abort();
      });
      await page.addInitScript(() => {
        window.__lab = { readyMs: null };
        const observer = new MutationObserver(() => {
          if (document.querySelectorAll('[role="slider"][aria-disabled="false"]').length !== 4) return;
          observer.disconnect();
          requestAnimationFrame(() => requestAnimationFrame(() => { window.__lab.readyMs = performance.now(); }));
        });
        observer.observe(document, { subtree: true, childList: true, attributes: true });
      });
      const historyReady = page.waitForResponse((response) => response.url().includes("/api/health") && response.url().includes("start=2026-03-04"));
      await page.goto(`${origin}/?page=dashboard&view=alex`);
      assert.deepEqual(errors, []);
      await page.waitForFunction(() => window.__lab.readyMs !== null).catch(async (error) => {
        console.error({ errors, requests, sliders: await page.getByRole("slider").count() });
        throw error;
      });
      // Wait for the bounded history read too; subsequent range changes use cache.
      await (await historyReady).finished();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const initialMs = await page.evaluate(() => window.__lab.readyMs);
      assert.equal(requests.filter((url) => url.startsWith("/api/health")).length, 2);
      assert.ok(requests.filter((url) => url.startsWith("/api/health")).every((url) => new URL(url, origin).searchParams.get("profile") === "alex"));

      const range = page.locator("#range-trigger");
      if (await range.isVisible()) await range.click();
      const rangeMs = await measure(page, page.locator("#range-option-6m"), {
        selector: '[role="slider"][aria-disabled="false"][aria-valuemax="184"]', count: 4,
      });
      assert.equal(requests.filter((url) => url.startsWith("/api/health")).length, 2, "range change must use the loaded cache");
      assert.equal(await page.locator(".daily-details tbody tr").count(), 0);
      const chart = page.getByRole("slider").first();
      await chart.focus();
      const chartMs = await measure(page, chart, {
        selector: '[role="slider"][aria-valuenow="183"]', count: 4,
      }, "ArrowLeft");
      const detailsMs = await measure(page, page.locator(".daily-details summary"), {
        selector: ".daily-details tbody tr", count: 185,
      });
      assert.deepEqual(errors, []);
      samples.push({ initialMs, rangeMs, chartMs, detailsMs });
    } finally { await context.close(); }
  }
  const metrics = Object.fromEntries(Object.keys(samples[0]).map((key) => {
    const sorted = samples.map((sample) => sample[key]).sort((a, b) => a - b);
    return [key, { median: Math.round(sorted[2]), max: Math.round(sorted[4]) }];
  }));
  const report = {
    medianBudgetsMs: { initialMs: 4000, rangeMs: 300, chartMs: 150, detailsMs: 750 },
    environment: { browser: browser.version(), node: process.version, platform: process.platform, arch: process.arch },
    method: "Production-built client fixture; 390x844; 4x CPU; 1.6Mbps/100ms assets; synthetic API +100ms; five fresh contexts. Event-to-semantic-DOM plus two animation frames. Not field Web Vitals, SSR, API or real-device performance.",
    metrics, samples,
  };
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  for (const [key, budget] of Object.entries(report.medianBudgetsMs)) {
    assert.ok(metrics[key].median <= budget, `${key}: median ${metrics[key].median}ms exceeds ${budget}ms lab budget`);
  }
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}

async function measure(page, target, condition, key) {
  await target.scrollIntoViewIfNeeded();
  await page.evaluate(({ condition, event }) => {
    window.__lab.interactionMs = null;
    let start;
    const observer = new MutationObserver(check);
    function check() {
      if (start === undefined || document.querySelectorAll(condition.selector).length !== condition.count) return;
      observer.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.__lab.interactionMs = performance.now() - start;
      }));
    }
    document.addEventListener(event, () => { start = performance.now(); check(); }, { capture: true, once: true });
    observer.observe(document, { subtree: true, attributes: true, childList: true });
  }, { condition, event: key ? "keydown" : "click" });
  if (key) await target.press(key); else await target.click();
  await page.waitForFunction(() => window.__lab.interactionMs !== null);
  return page.evaluate(() => window.__lab.interactionMs);
}
