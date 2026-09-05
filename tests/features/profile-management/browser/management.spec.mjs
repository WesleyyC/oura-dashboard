import { test, expect } from "@playwright/test";

const origin = "http://127.0.0.1:5190";
const now = "2026-09-04T12:00:00.000Z";
function person(index = 0, overrides = {}) {
  return { id: `synthetic-profile-${index}`, slug: index ? `person-${index}` : "alex", displayName: index ? `Person ${index + 1}` : "Alex",
    colorKey: "ocean", sortOrder: index, status: "connected", updatedAt: now,
    lastSucceededAt: now, coverageStartDate: "2026-01-01", safeErrorCode: null, ...overrides };
}

async function sandbox(page, options = {}) {
  const state = { profiles: options.profiles ?? [person()], calls: [], errors: [] };
  await page.clock.setFixedTime(new Date(now));
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === "https://cloud.ouraring.com" && url.pathname === "/oauth/authorize") {
      await route.fulfill({ contentType: "text/html", body: "<h1>Synthetic Oura consent destination</h1>" });
      return;
    }
    if (url.origin !== origin) { await route.abort(); throw new Error("External request blocked in synthetic suite"); }
    if (!url.pathname.startsWith("/api/")) { await route.continue(); return; }
    const body = request.postData() ? request.postDataJSON() : null;
    state.calls.push({ path: url.pathname, method: request.method(), body, query: Object.fromEntries(url.searchParams) });
    const json = (value, status = 200) => route.fulfill({ status, json: value, headers: { "Cache-Control": "private, no-store" } });
    if (url.pathname === "/api/account") {
      if (request.method() === "DELETE") return route.fulfill({ status: 204 });
      return json({ configured: { ouraClientId: true, ouraClientSecret: true, tokenEncryptionKey: true } });
    }
    if (url.pathname === "/api/profiles") {
      if (request.method() === "DELETE") { state.profiles = state.profiles.filter(({ id }) => id !== url.searchParams.get("profile_id")); return route.fulfill({ status: 204 }); }
      if (request.method() === "PATCH") {
        const target = state.profiles.find(({ id }) => id === body.profileId);
        Object.assign(target, body);
        return json({ profile: target });
      }
      return json({ profiles: state.profiles });
    }
    if (url.pathname === "/api/oura/guest/inspect") return options.expired ? json({ error: "invitation_unavailable" }, 410) :
      json({ displayName: options.guestName ?? "Alex", expiresAt: "2099-01-01T00:00:00.000Z" });
    if (url.pathname === "/api/oura/authorize" || url.pathname === "/api/oura/guest/authorize") return json({ authorizationUrl: "https://cloud.ouraring.com/oauth/authorize?synthetic=true" });
    if (url.pathname === "/api/oura/invites") {
      if (request.method() === "DELETE") return route.fulfill({ status: 204 });
      return json({ profile: state.profiles[0], handoff: { connectUrl: `${origin}/connect/oura#invite=synthetic-capability`, expiresAt: "2099-01-01T00:00:00.000Z" } });
    }
    if (url.pathname === "/api/oura/refresh") return json({ profileId: body.profileId, status: "refreshed", lastSucceededAt: now, safeErrorCode: null });
    if (url.pathname === "/api/oura/diagnostics") return json({ checkedAt: now, profiles: state.profiles.map(({ id }) => ({ profileId: id, status: "succeeded", lastAttemptAt: now, lastSucceededAt: now, durationMs: 1200, lastSuccessfulRowCount: 8, safeErrorCode: null })) });
    if (url.pathname === "/api/health") {
      const profile = state.profiles.find(({ slug }) => slug === url.searchParams.get("profile"));
      const records = Array.from({ length: 185 }, (_, index) => ({
        date: new Date(Date.UTC(2026, 2, 4 + index)).toISOString().slice(0, 10),
        readinessScore: 80, sleepScore: 82, activityScore: 78, steps: 8000,
      })).filter(({ date }) => date >= url.searchParams.get("start") && date <= url.searchParams.get("end"));
      return json({ profile, records, updatedAt: now });
    }
    await route.abort();
    throw new Error(`Unmocked API route: ${request.method()} ${url.pathname}`);
  });
  return state;
}

async function noHorizontalOverflow(page) {
  const size = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth,
    overflow: [...document.querySelectorAll("main *")].filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 12).map((element) => ({ tag: element.tagName, className: element.className, width: element.getBoundingClientRect().width })),
  }));
  expect(size.content, JSON.stringify(size.overflow)).toBeLessThanOrEqual(size.viewport + 1);
}

test("guest sees sharing and revocation details before authorizing; capability leaves the URL", async ({ page }) => {
  const state = await sandbox(page);
  await page.goto("/connect/oura#invite=synthetic-capability");
  await expect(page.getByRole("heading", { name: "What you are sharing" })).toBeVisible();
  await expect(page.getByText(/dashboard owner can view/)).toBeVisible();
  await expect(page.getByText(/Revoke access in your Oura account/)).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  expect(state.calls.filter(({ path }) => path.endsWith("authorize"))).toHaveLength(0);
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "Connect Oura", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic Oura consent destination" })).toBeVisible();
  expect(state.calls.filter(({ path }) => path.endsWith("/guest/authorize"))).toHaveLength(1);
  expect(state.errors).toEqual([]);
});

test("expired guest links reveal no controls or profile details", async ({ page }) => {
  const state = await sandbox(page, { expired: true });
  await page.goto("/connect/oura#invite=synthetic-expired");
  await expect(page.getByRole("alert")).toContainText("no longer available");
  await expect(page.getByRole("button", { name: "Connect Oura" })).toHaveCount(0);
  await expect(page.getByText("Alex", { exact: true })).toHaveCount(0);
  expect(state.calls.map(({ path }) => path)).toEqual(["/api/oura/guest/inspect"]);
  await noHorizontalOverflow(page);
  expect(state.errors).toEqual([]);
});

test("Settings reconnect targets the existing profile and does not add a new one", async ({ page }) => {
  const state = await sandbox(page, { profiles: [person(0, { status: "reauthorization_required", safeErrorCode: "authorization_required" })] });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Reconnect here", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic Oura consent destination" })).toBeVisible();
  expect(state.calls.find(({ path }) => path.endsWith("/authorize")).body).toEqual({ mode: "reconnect", profileId: "synthetic-profile-0" });
  expect(state.errors).toEqual([]);
});

test("Settings product credit opens DrQ separately without a referrer or opener", async ({ page }) => {
  const state = await sandbox(page);
  await page.context().route("https://drq.ai/", (route) => route.fulfill({
    contentType: "text/html", body: "<h1>Synthetic DrQ destination</h1>",
  }));
  await page.goto("/settings");
  const credit = page.locator("footer");
  await expect(credit).toContainText("A product by DrQ");
  const link = credit.getByRole("link", { name: "DrQ (opens in a new tab)" });
  await link.scrollIntoViewIfNeeded();
  const bounds = await link.boundingBox();
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  await link.focus();
  await expect(link).toHaveCSS("outline-style", "solid");
  await noHorizontalOverflow(page);
  const popupReady = page.waitForEvent("popup");
  await page.keyboard.press("Enter");
  const popup = await popupReady;
  await expect(popup.getByRole("heading", { name: "Synthetic DrQ destination" })).toBeVisible();
  expect(await popup.evaluate(() => ({ opener: window.opener === null, referrer: document.referrer })))
    .toEqual({ opener: true, referrer: "" });
  await expect(page).toHaveURL(`${origin}/settings`);
  expect(state.errors).toEqual([]);
});

test("profile deletion requires confirmation and never deletes the account", async ({ page }) => {
  const state = await sandbox(page);
  await page.goto("/settings");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Remove profile" }).click();
  expect(state.calls.filter(({ method }) => method === "DELETE")).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove profile" }).click();
  await expect(page.locator(".profile-card")).toHaveCount(0);
  expect(state.calls.filter(({ method }) => method === "DELETE")).toEqual([{ path: "/api/profiles", method: "DELETE", body: null, query: { profile_id: "synthetic-profile-0" } }]);
  expect(state.errors).toEqual([]);
});

test("account deletion stays hidden and requires exact typed confirmation", async ({ page }) => {
  const state = await sandbox(page);
  await page.goto("/settings");
  const field = page.getByLabel("Type DELETE to confirm");
  await expect(field).toBeHidden();
  await page.locator(".danger-zone summary").click();
  await field.fill("delete");
  const button = page.getByRole("button", { name: "Delete dashboard data", exact: true });
  await expect(button).toBeDisabled();
  await field.fill("DELETE");
  await button.click();
  await expect(page.getByRole("heading", { name: "Dashboard data deleted" })).toBeVisible();
  expect(state.calls.find(({ method }) => method === "DELETE").body).toEqual({ confirmation: "DELETE" });
  expect(state.errors).toEqual([]);
});

test("diagnostics are on demand and history repair is explicitly confirmed", async ({ page }) => {
  const state = await sandbox(page);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Alex", exact: true })).toBeVisible();
  expect(state.calls.filter(({ path }) => path.endsWith("diagnostics") || path.endsWith("refresh"))).toHaveLength(0);
  await page.locator(".sync-diagnostics summary").click();
  expect((await page.getByLabel("Person to repair").boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.getByRole("button", { name: "Check sync status" }).click();
  await expect(page.getByText(/Rows in last successful refresh: 8/)).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Repair six-month history" }).click();
  expect(state.calls.filter(({ path }) => path.endsWith("refresh"))).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Repair six-month history" }).click();
  await expect(page.getByText(/History repaired/)).toBeVisible();
  expect(state.calls.find(({ path }) => path.endsWith("refresh")).body).toMatchObject({ profileId: "synthetic-profile-0", repairHistory: true });
  await noHorizontalOverflow(page);
  expect(state.errors).toEqual([]);
});

test("long names, keyboard focus and 200 percent layout zoom remain usable", async ({ page }) => {
  const state = await sandbox(page, { profiles: [person(0, { displayName: "Alexandra".repeat(8) })] });
  await page.goto("/settings");
  await expect(page.locator(".profile-card")).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByLabel("Display name", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveCSS("outline-style", "solid");
  // Keep the zoomed layout at least 320 CSS px; phone pinch-zoom does not
  // reflow to 160 px. Narrow phone layout is verified above at native scale.
  await page.setViewportSize({ width: Math.max(640, page.viewportSize().width), height: page.viewportSize().height });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await noHorizontalOverflow(page);
  await page.locator(".sync-diagnostics summary").click();
  await expect(page.getByRole("button", { name: "Check sync status" })).toBeVisible();
  await noHorizontalOverflow(page);
  expect(state.errors).toEqual([]);
});

test("eight-person dashboard honors request budget and deferred details through real controllers", async ({ page }) => {
  const state = await sandbox(page, { profiles: Array.from({ length: 8 }, (_, index) => person(index)) });
  await page.goto("/?page=dashboard&view=alex");
  await expect(page.getByRole("slider")).toHaveCount(4);
  await expect.poll(() => state.calls.filter(({ path }) => path === "/api/health").length).toBe(2);
  expect(state.calls.filter(({ path }) => path === "/api/health").every(({ query }) => query.profile === "alex")).toBe(true);
  const range = page.locator("#range-trigger");
  if (await range.isVisible()) await range.click();
  await page.locator("#range-option-6m").click();
  await expect(page.locator(".daily-details tbody tr")).toHaveCount(0);
  await page.locator(".daily-details summary").click();
  await expect(page.locator(".daily-details tbody tr")).toHaveCount(185);
  await page.locator(".daily-details summary").click();
  await expect(page.locator(".daily-details tbody tr")).toHaveCount(0);
  await noHorizontalOverflow(page);
  expect(state.errors).toEqual([]);
});
