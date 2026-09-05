import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import TestRenderer from "react-test-renderer";

import {
  DashboardContent,
  DashboardScreen,
} from "../../../features/dashboard/components/DashboardScreen.tsx";
import { useDashboardController } from "../../../features/dashboard/model/use-dashboard-controller.ts";
import { IndividualHealthView } from "../../../features/dashboard/components/IndividualHealthView.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const profile = {
  id: "profile-member-one",
  slug: "member-one",
  displayName: "Alex",
  colorKey: "ocean",
  sortOrder: 0,
  status: "connected",
  updatedAt: "2026-08-02T12:00:00.000Z",
  lastSucceededAt: "2026-08-02T12:00:00.000Z",
  coverageStartDate: "2026-02-02",
  safeErrorCode: null,
};

const record = {
  date: "2026-08-02",
  sleepScore: 82,
  readinessScore: 79,
  activityScore: 88,
  totalSleepMinutes: 438,
  timeInBedMinutes: 472,
  sleepEfficiency: 93,
  deepSleepMinutes: 86,
  remSleepMinutes: 104,
  sleepLatencyMinutes: 12,
  averageBreathingRate: 14.2,
  averageHeartRate: 58,
  hrvMs: 47.2,
  restingHeartRate: 54,
  temperatureDeviationC: -0.2,
  stressMinutes: 60,
  recoveryMinutes: 120,
  steps: 10_204,
  activeCalories: 512,
  totalCalories: 2_300,
  activeMinutes: 120,
  sedentaryMinutes: 480,
  walkingEquivalentMeters: 8_500,
  workoutMinutes: 45,
  workoutCount: 1,
  workoutCalories: 260,
  workoutDistanceMeters: 5_000,
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function jsonResponse(body) {
  return {
    ok: true,
    async json() {
      return body;
    },
  };
}

async function flushAsync(turns = 6) {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

function textContent(node) {
  if (typeof node === "string") return node;
  if (!node?.children) return "";
  return node.children.map(textContent).join("");
}

function ControllerProbe({ api, onRender, initialView = "member-one" }) {
  const controller = useDashboardController(initialView, api);
  onRender(controller);
  return null;
}

function installBrowser(t, { timeZone } = {}) {
  const originalWindow = globalThis.window;
  const originalSelf = globalThis.self;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
  const documentTarget = new EventTarget();
  const intervals = new Map();
  Object.defineProperty(documentTarget, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  globalThis.document = documentTarget;
  globalThis.window = {
    location: { href: "https://health.example/?view=member-one" },
    history: { replaceState() {} },
    setInterval(callback, delay) {
      intervals.set(delay, callback);
      return delay;
    },
    clearInterval() {},
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
  globalThis.self = globalThis.window;
  if (timeZone) {
    Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptions() {
      return { ...originalResolvedOptions.call(this), timeZone };
    };
  }
  console.error = (message, ...rest) => {
    if (String(message).includes("react-test-renderer is deprecated")) return;
    originalError(message, ...rest);
  };

  t.after(() => {
    console.error = originalError;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalSelf === undefined) delete globalThis.self;
    else globalThis.self = originalSelf;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
    Intl.DateTimeFormat.prototype.resolvedOptions = originalResolvedOptions;
  });
  return { intervals, documentTarget };
}

test("an eight-person dashboard loads only the selected person's cache until another view is needed", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-02T12:00:00.000Z") });
  let renderer;
  t.after(() => { if (renderer) act(() => renderer.unmount()); });
  installBrowser(t);
  const summaries = Array.from({ length: 8 }, (_, index) => ({
    ...profile, id: `profile-${index}`, slug: index ? `member-${index}` : "member-one",
  }));
  const calls = [];
  let controller;
  const api = {
    async loadProfiles() { return summaries; },
    async loadHealthProfile(target, window) {
      calls.push({ id: target.profile.id, ...window });
      return { profile: target.profile, records: [record], updatedAt: profile.lastSucceededAt };
    },
    async requestProfileRefresh() { throw new Error("Fresh profiles do not need refresh"); },
  };
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(ControllerProbe, { api, onRender(value) { controller = value; } }));
    await flushAsync(20);
  });
  assert.equal(calls.length, 2, "one recent-window request and one selected-person history request");
  assert.ok(calls.every(({ id }) => id === "profile-0"));
  await act(async () => { controller.changeView("member-7"); await flushAsync(20); });
  assert.ok(calls.slice(2).every(({ id }) => id === "profile-7"));
  assert.equal(controller.profiles.find(({ profile }) => profile.id === "profile-7").records.length, 1);
});

for (const phase of ["recent", "history"]) {
  test(`queued ${phase} reads from an old lifecycle cannot start or overwrite current data`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-02T12:00:00.000Z") });
    let renderer;
    t.after(() => { if (renderer) act(() => renderer.unmount()); });
    installBrowser(t);
    const people = Array.from({ length: 3 }, (_, index) => ({ ...profile, id: `profile-${index}`, slug: `member-${index}` }));
    const pending = [deferred(), deferred()];
    let afterReset = false;
    let lateCalls = 0;
    let controller;
    const onRender = (value) => { controller = value; };
    const oldApi = {
      async loadProfiles() { return people; },
      async loadHealthProfile(target, window) {
        if (afterReset) lateCalls += 1;
        const index = people.findIndex(({ id }) => id === target.profile.id);
        if (index < 2 && (phase === "recent" ? window.start === "2026-07-27" : window.start === "2026-02-02")) await pending[index].promise;
        return { profile: target.profile, records: [{ ...record, steps: 1 }], updatedAt: profile.lastSucceededAt };
      },
      async requestProfileRefresh() { throw new Error("Unexpected refresh"); },
    };
    const newApi = { ...oldApi, async loadHealthProfile(target) { return { profile: target.profile, records: [{ ...record, steps: 2 }], updatedAt: profile.lastSucceededAt }; } };
    await act(async () => { renderer = TestRenderer.create(React.createElement(ControllerProbe, { api: oldApi, initialView: "family", onRender })); await flushAsync(30); });
    afterReset = true;
    await act(async () => { renderer.update(React.createElement(ControllerProbe, { api: newApi, initialView: "family", onRender })); await flushAsync(30); });
    await act(async () => { pending.forEach(({ resolve }) => resolve()); await flushAsync(30); });
    assert.equal(lateCalls, 0);
    assert.ok(controller.profiles.every(({ records }) => records[0].steps === 2));
  });
}

test("hidden tabs do no polling work and catch up on return", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-02T12:00:00.000Z") });
  let renderer;
  t.after(() => { if (renderer) act(() => renderer.unmount()); });
  const { intervals, documentTarget } = installBrowser(t);
  let calls = 0;
  const api = {
    async loadProfiles() { return [profile]; },
    async loadHealthProfile(target) {
      calls += 1;
      return { profile: target.profile, records: [record], updatedAt: profile.lastSucceededAt };
    },
    async requestProfileRefresh() { throw new Error("Fresh profiles do not need refresh"); },
  };
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(ControllerProbe, { api, onRender() {} }));
    await flushAsync(20);
  });
  const baseline = calls;
  Object.defineProperty(documentTarget, "visibilityState", { configurable: true, value: "hidden" });
  await act(async () => { intervals.get(5 * 60_000)(); await flushAsync(20); });
  assert.equal(calls, baseline);
  Object.defineProperty(documentTarget, "visibilityState", { configurable: true, value: "visible" });
  await act(async () => { documentTarget.dispatchEvent(new Event("visibilitychange")); await flushAsync(20); });
  assert.ok(calls > baseline);
});

test("a completed refresh updates its person before a slower peer finishes", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-02T12:00:00.000Z") });
  let renderer;
  t.after(() => { if (renderer) act(() => renderer.unmount()); });
  installBrowser(t);
  const peer = { ...profile, id: "profile-peer", slug: "peer" };
  const replies = [deferred(), deferred()];
  let controller;
  const api = {
    async loadProfiles() { return [profile, peer]; },
    async loadHealthProfile(target) { return { profile: target.profile, records: [record], updatedAt: profile.lastSucceededAt }; },
    requestProfileRefresh(id) { return replies[id === profile.id ? 0 : 1].promise; },
  };
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(ControllerProbe, { api, onRender(value) { controller = value; } }));
    await flushAsync(20);
  });
  let refresh;
  await act(async () => { refresh = controller.refreshProfiles(controller.profiles, true); await flushAsync(); });
  await act(async () => {
    replies[0].resolve({ profileId: profile.id, status: "refreshed", safeErrorCode: null, lastSucceededAt: profile.lastSucceededAt });
    await flushAsync(20);
  });
  assert.equal(controller.profiles[0].refreshing, false);
  assert.equal(controller.profiles[1].refreshing, true);
  await act(async () => {
    replies[1].resolve({ profileId: peer.id, status: "refreshed", safeErrorCode: null, lastSucceededAt: peer.lastSucceededAt });
    await refresh;
  });
});

test("closed daily details mount no record rows and reveal all rows on demand", async (t) => {
  let renderer;
  t.after(() => { if (renderer) act(() => renderer.unmount()); });
  installBrowser(t);
  const records = Array.from({ length: 180 }, (_, index) => ({
    ...record, date: new Date(Date.UTC(2026, 1, 4 + index)).toISOString().slice(0, 10),
  }));
  act(() => {
    renderer = TestRenderer.create(React.createElement(IndividualHealthView, {
      profileId: profile.id, displayName: profile.displayName, colorKey: "ocean", range: "6m",
      records, loading: false, error: null, today: "2026-08-02", onRetry() {},
    }));
  });
  const details = renderer.root.findByProps({ className: "daily-details" });
  assert.equal(details.findAllByType("tr").length, 0);
  act(() => details.props.onToggle({ currentTarget: { open: true } }));
  await act(async () => {
    await import("../../../features/dashboard/components/DailyDetailsTable.tsx");
  });
  assert.equal(details.findAllByType("tbody")[0].findAllByType("tr").length, 180);
  act(() => details.props.onToggle({ currentTarget: { open: false } }));
  assert.equal(details.findAllByType("tr").length, 0);
});

test("retrying a failed profile list actually requests the list again", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-02T12:00:00.000Z") });
  let renderer;
  t.after(() => { if (renderer) act(() => renderer.unmount()); });
  installBrowser(t);
  let controller;
  let attempts = 0;
  const api = {
    async loadProfiles() { if (++attempts === 1) throw new Error("offline"); return [profile]; },
    async loadHealthProfile(target) { return { profile: target.profile, records: [record], updatedAt: profile.lastSucceededAt }; },
    async requestProfileRefresh() { throw new Error("Unexpected refresh"); },
  };
  await act(async () => { renderer = TestRenderer.create(React.createElement(ControllerProbe, { api, onRender: (value) => { controller = value; } })); await flushAsync(20); });
  assert.ok(controller.profileListError);
  await act(async () => { controller.retryProfiles(); await flushAsync(20); });
  assert.equal(attempts, 2);
  assert.equal(controller.profileListError, null);
  assert.equal(controller.profiles[0].profile.id, profile.id);
});

test("an old mutation response cannot change status after the dashboard reinitializes", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-02T12:00:00.000Z") });
  let renderer;
  t.after(() => { if (renderer) act(() => renderer.unmount()); });
  installBrowser(t);
  const pending = deferred();
  let controller;
  const onRender = (value) => { controller = value; };
  const first = {
    async loadProfiles() { return [profile]; },
    async loadHealthProfile(target) { return { profile: target.profile, records: [record], updatedAt: profile.lastSucceededAt }; },
    requestProfileRefresh() { return pending.promise; },
  };
  const second = { ...first, async loadProfiles() { return [{ ...profile, lastSucceededAt: "2026-08-02T13:00:00.000Z" }]; } };
  await act(async () => { renderer = TestRenderer.create(React.createElement(ControllerProbe, { api: first, onRender })); await flushAsync(20); });
  let refresh;
  await act(async () => { refresh = controller.refreshProfiles(controller.profiles, true); await flushAsync(); });
  await act(async () => { renderer.update(React.createElement(ControllerProbe, { api: second, onRender })); await flushAsync(20); });
  await act(async () => {
    pending.resolve({ profileId: profile.id, status: "failed", safeErrorCode: "authorization_required", lastSucceededAt: profile.lastSucceededAt });
    await refresh;
  });
  assert.equal(controller.profiles[0].profile.status, "connected");
  assert.equal(controller.profiles[0].profile.lastSucceededAt, "2026-08-02T13:00:00.000Z");
});

test("a China device boundary drives health windows and automatic and manual refreshes", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-08-03T01:25:00.000Z"),
  });
  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
    t.mock.timers.reset();
  });
  installBrowser(t, { timeZone: "Asia/Shanghai" });
  const healthWindows = [];
  const refreshCalls = [];
  let controller;
  const api = {
    async loadProfiles() {
      return [{
        ...profile,
        coverageStartDate: "2026-02-03",
      }];
    },
    async loadHealthProfile(_profile, window) {
      healthWindows.push(window);
      return {
        profile: {
          id: profile.id,
          slug: profile.slug,
          displayName: profile.displayName,
        },
        records: [{ ...record, date: "2026-08-03" }],
        updatedAt: profile.lastSucceededAt,
      };
    },
    async requestProfileRefresh(...args) {
      refreshCalls.push(args);
      return {
        profileId: profile.id,
        status: "fresh",
        lastSucceededAt: profile.lastSucceededAt,
        safeErrorCode: null,
      };
    },
  };

  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(ControllerProbe, {
        api,
        onRender(value) {
          controller = value;
        },
      }),
    );
    await flushAsync(20);
  });

  assert.equal(controller.timeZone, "Asia/Shanghai");
  assert.equal(controller.today, "2026-08-03");
  assert.deepEqual(healthWindows.slice(0, 2), [
    { start: "2026-07-28", end: "2026-08-03" },
    { start: "2026-02-03", end: "2026-08-03" },
  ]);
  assert.deepEqual(refreshCalls, [[profile.id, "Asia/Shanghai", false]]);

  await act(async () => {
    await controller.refreshProfiles(controller.profiles, true);
    await flushAsync();
  });
  assert.deepEqual(refreshCalls.at(-1), [profile.id, "Asia/Shanghai", true]);
});

test("dashboard commits seven-day data before requesting six-month history", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-08-02T12:00:00.000Z"),
  });
  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
    t.mock.timers.reset();
  });
  installBrowser(t);
  const initialHealth = deferred();
  const historyHealth = deferred();
  const healthRequests = [];

  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path === "/api/profiles") {
      return jsonResponse({ profiles: [profile] });
    }
    const url = new URL(path, "https://health.example");
    assert.equal(url.pathname, "/api/health");
    healthRequests.push(`${url.pathname}${url.search}`);
    if (url.searchParams.get("start") === "2026-07-27") {
      return initialHealth.promise;
    }
    if (url.searchParams.get("start") === "2026-02-02") {
      return historyHealth.promise;
    }
    throw new Error(`Unexpected health window: ${url.search}`);
  };

  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(DashboardScreen, { initialView: "member-one" }),
      {
        createNodeMock() {
          return {
            contains() {
              return false;
            },
            focus() {},
            scrollIntoView() {},
          };
        },
      },
    );
    await flushAsync();
  });

  assert.deepEqual(healthRequests, [
    "/api/health?profile=member-one&start=2026-07-27&end=2026-08-02",
  ]);

  await act(async () => {
    initialHealth.resolve(jsonResponse({
      profile: {
        id: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
      },
      records: [record],
      updatedAt: profile.lastSucceededAt,
    }));
    await flushAsync();
  });

  assert.equal(
    renderer.root.findByProps({ className: "score-strip" }).props["aria-busy"],
    false,
  );
  assert.deepEqual(healthRequests, [
    "/api/health?profile=member-one&start=2026-07-27&end=2026-08-02",
    "/api/health?profile=member-one&start=2026-02-02&end=2026-08-02",
  ]);

  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await flushAsync();
  });
  assert.deepEqual(healthRequests, [
    "/api/health?profile=member-one&start=2026-07-27&end=2026-08-02",
    "/api/health?profile=member-one&start=2026-02-02&end=2026-08-02",
    "/api/health?profile=member-one&start=2026-07-27&end=2026-08-02",
  ]);

  act(() => renderer.root.findByProps({ id: "range-trigger" }).props.onClick());
  act(() => renderer.root.findByProps({
    role: "option",
    "data-value": "6m",
  }).props.onClick());

  assert.deepEqual(healthRequests, [
    "/api/health?profile=member-one&start=2026-07-27&end=2026-08-02",
    "/api/health?profile=member-one&start=2026-02-02&end=2026-08-02",
    "/api/health?profile=member-one&start=2026-07-27&end=2026-08-02",
  ]);
  assert.equal(
    renderer.root.findByProps({ className: "score-strip" }).props["aria-busy"],
    true,
  );

  await act(async () => {
    historyHealth.resolve(jsonResponse({
      profile: {
        id: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
      },
      records: [record],
      updatedAt: profile.lastSucceededAt,
    }));
    await flushAsync();
  });

  assert.equal(
    renderer.root.findByProps({ className: "score-strip" }).props["aria-busy"],
    false,
  );
});

test("one slow profile does not block a resolved profile's seven-day view", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-08-02T12:00:00.000Z"),
  });
  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
    t.mock.timers.reset();
  });
  installBrowser(t);
  const secondProfile = {
    ...profile,
    id: "profile-member-two",
    slug: "member-two",
    displayName: "Blair",
    colorKey: "berry",
  };
  const initialHealth = {
    "member-one": deferred(),
    "member-two": deferred(),
  };
  const historyHealth = deferred();

  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path === "/api/profiles") {
      return jsonResponse({ profiles: [profile, secondProfile] });
    }
    const url = new URL(path, "https://health.example");
    if (url.searchParams.get("start") === "2026-07-27") {
      return initialHealth[url.searchParams.get("profile")].promise;
    }
    if (url.searchParams.get("start") === "2026-02-02") {
      return historyHealth.promise;
    }
    throw new Error(`Unexpected health window: ${url.search}`);
  };

  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(DashboardScreen, { initialView: "member-one" }),
      {
        createNodeMock() {
          return {
            contains() {
              return false;
            },
            focus() {},
            scrollIntoView() {},
          };
        },
      },
    );
    await flushAsync();
  });

  await act(async () => {
    initialHealth["member-one"].resolve(jsonResponse({
      profile: {
        id: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
      },
      records: [record],
      updatedAt: profile.lastSucceededAt,
    }));
    await flushAsync();
  });

  const scoreValues = renderer.root
    .findAllByProps({ className: "score-item" })
    .map((item) => textContent(item.findByType("dd")));
  assert.deepEqual(scoreValues, ["79", "82", "88"]);

  await act(async () => {
    initialHealth["member-two"].resolve(jsonResponse({
      profile: {
        id: secondProfile.id,
        slug: secondProfile.slug,
        displayName: secondProfile.displayName,
      },
      records: [{ ...record, readinessScore: 72 }],
      updatedAt: secondProfile.lastSucceededAt,
    }));
    await flushAsync();
  });
});

test("Family applies each six-month profile response independently", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-08-02T12:00:00.000Z"),
  });
  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
    t.mock.timers.reset();
  });
  installBrowser(t);
  const secondProfile = {
    ...profile,
    id: "profile-member-two",
    slug: "member-two",
    displayName: "Blair",
    colorKey: "berry",
  };
  const historyHealth = {
    "member-one": deferred(),
    "member-two": deferred(),
  };

  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path === "/api/profiles") {
      return jsonResponse({ profiles: [profile, secondProfile] });
    }
    const url = new URL(path, "https://health.example");
    const slug = url.searchParams.get("profile");
    const responseProfile = slug === "member-one" ? profile : secondProfile;
    const responseRecord = slug === "member-one"
      ? record
      : { ...record, readinessScore: 72 };
    if (url.searchParams.get("start") === "2026-07-27") {
      return jsonResponse({
        profile: {
          id: responseProfile.id,
          slug: responseProfile.slug,
          displayName: responseProfile.displayName,
        },
        records: [responseRecord],
        updatedAt: responseProfile.lastSucceededAt,
      });
    }
    if (url.searchParams.get("start") === "2026-02-02") {
      return historyHealth[slug].promise;
    }
    throw new Error(`Unexpected health window: ${url.search}`);
  };

  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(DashboardScreen, { initialView: "family" }),
      {
        createNodeMock() {
          return {
            contains() {
              return false;
            },
            focus() {},
            scrollIntoView() {},
          };
        },
      },
    );
    await flushAsync(10);
  });

  act(() => renderer.root.findByProps({ id: "range-trigger" }).props.onClick());
  await act(async () => {
    renderer.root.findByProps({
      role: "option",
      "data-value": "6m",
    }).props.onClick();
    await flushAsync();
  });

  await act(async () => {
    historyHealth["member-one"].resolve(jsonResponse({
      profile: {
        id: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
      },
      records: [record],
      updatedAt: profile.lastSucceededAt,
    }));
    await flushAsync();
  });

  await act(async () => {
    await import("../../../features/dashboard/components/FamilyHealthView.tsx");
  });
  await act(async () => {
    await import("../../../features/dashboard/components/FamilyHealthView.tsx");
  });
  const legendItems = renderer.root.findAllByProps({
    className: "family-score-legend-item",
  });
  assert.equal(textContent(legendItems[0].findByType("dd")), "79");
  assert.equal(textContent(legendItems[1].findByType("dd")), "…");

  await act(async () => {
    historyHealth["member-two"].resolve(jsonResponse({
      profile: {
        id: secondProfile.id,
        slug: secondProfile.slug,
        displayName: secondProfile.displayName,
      },
      records: [{ ...record, readinessScore: 72 }],
      updatedAt: secondProfile.lastSucceededAt,
    }));
    await flushAsync();
  });
});

test("a failed background load stays quiet until its longer range is selected", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-08-02T12:00:00.000Z"),
  });
  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
    t.mock.timers.reset();
  });
  installBrowser(t);
  const historyHealth = deferred();
  const healthRequests = [];

  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path === "/api/profiles") {
      return jsonResponse({ profiles: [profile] });
    }
    const url = new URL(path, "https://health.example");
    healthRequests.push(url.searchParams.get("start"));
    if (url.searchParams.get("start") === "2026-07-27") {
      return jsonResponse({
        profile: {
          id: profile.id,
          slug: profile.slug,
          displayName: profile.displayName,
        },
        records: [record],
        updatedAt: profile.lastSucceededAt,
      });
    }
    if (url.searchParams.get("start") === "2026-02-02") {
      return historyHealth.promise;
    }
    throw new Error(`Unexpected health window: ${url.search}`);
  };

  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(DashboardScreen, { initialView: "member-one" }),
      {
        createNodeMock() {
          return {
            contains() {
              return false;
            },
            focus() {},
            scrollIntoView() {},
          };
        },
      },
    );
    await flushAsync(10);
  });

  assert.equal(
    renderer.root.findAllByProps({ className: "notice error-notice" }).length,
    0,
  );
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await flushAsync();
  });

  await act(async () => {
    historyHealth.reject(new Error("Longer history could not be loaded"));
    await flushAsync();
  });
  assert.equal(
    renderer.root.findAllByProps({ className: "notice error-notice" }).length,
    0,
  );

  act(() => renderer.root.findByProps({ id: "range-trigger" }).props.onClick());
  await act(async () => {
    renderer.root.findByProps({
      role: "option",
      "data-value": "6m",
    }).props.onClick();
    await flushAsync();
  });

  const notices = renderer.root.findAllByProps({
    className: "notice error-notice",
  });
  assert.equal(notices.length, 1);
  assert.match(textContent(notices[0]), /Longer history could not be loaded/);
  assert.equal(
    renderer.root.findByProps({ className: "score-strip" }).props["aria-busy"],
    true,
  );

  await act(async () => {
    renderer.root.findByProps({
      className: "secondary-button",
    }).props.onClick();
    await flushAsync();
  });
  assert.deepEqual(healthRequests, [
    "2026-07-27",
    "2026-02-02",
    "2026-07-27",
    "2026-02-02",
  ]);
});

test("manual refresh reloads only the coverage already held in the browser", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-08-02T12:00:00.000Z"),
  });
  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
    t.mock.timers.reset();
  });
  installBrowser(t);
  const historyHealth = deferred();
  const healthRequests = [];

  globalThis.fetch = async (input, init) => {
    const path = String(input);
    if (path === "/api/profiles") {
      return jsonResponse({ profiles: [profile] });
    }
    if (path === "/api/oura/refresh") {
      assert.equal(init?.method, "POST");
      return jsonResponse({
        profileId: profile.id,
        status: "fresh",
        lastSucceededAt: profile.lastSucceededAt,
        safeErrorCode: null,
      });
    }
    const url = new URL(path, "https://health.example");
    healthRequests.push(`${url.pathname}${url.search}`);
    if (url.searchParams.get("start") === "2026-02-02") {
      return historyHealth.promise;
    }
    return jsonResponse({
      profile: {
        id: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
      },
      records: [record],
      updatedAt: profile.lastSucceededAt,
    });
  };

  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(DashboardScreen, { initialView: "member-one" }),
      {
        createNodeMock() {
          return {
            contains() {
              return false;
            },
            focus() {},
            scrollIntoView() {},
          };
        },
      },
    );
    await flushAsync(10);
  });

  await act(async () => {
    historyHealth.reject(new Error("Longer history could not be loaded"));
    await flushAsync();
  });
  await act(async () => {
    renderer.root.findByProps({
      className: "dashboard-refresh-button",
    }).props.onClick();
    await flushAsync(10);
  });

  assert.deepEqual(healthRequests, [
    "/api/health?profile=member-one&start=2026-07-27&end=2026-08-02",
    "/api/health?profile=member-one&start=2026-02-02&end=2026-08-02",
    "/api/health?profile=member-one&start=2026-07-27&end=2026-08-02",
  ]);
});

test("an aborted refresh cannot apply after the dashboard reinitializes", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-08-02T12:00:00.000Z"),
  });
  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
    t.mock.timers.reset();
  });
  installBrowser(t);
  const staleRefresh = deferred();
  let firstApiHealthCalls = 0;
  let refreshSignal;
  let controller;
  const response = (readinessScore, updatedAt) => ({
    profile: {
      id: profile.id,
      slug: profile.slug,
      displayName: profile.displayName,
    },
    records: [{ ...record, readinessScore }],
    updatedAt,
  });
  const firstApi = {
    async loadProfiles() {
      return [profile];
    },
    async loadHealthProfile(_profile, _window, signal) {
      firstApiHealthCalls += 1;
      if (firstApiHealthCalls === 3) {
        refreshSignal = signal;
        return staleRefresh.promise;
      }
      return response(79, profile.lastSucceededAt);
    },
    async requestProfileRefresh() {
      return {
        profileId: profile.id,
        status: "fresh",
        lastSucceededAt: profile.lastSucceededAt,
        safeErrorCode: null,
      };
    },
  };
  const secondApi = {
    async loadProfiles() {
      return [profile];
    },
    async loadHealthProfile() {
      return response(91, "2026-08-02T13:00:00.000Z");
    },
    async requestProfileRefresh() {
      throw new Error("Unexpected refresh");
    },
  };
  const capture = (value) => {
    controller = value;
  };

  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(ControllerProbe, {
        api: firstApi,
        onRender: capture,
      }),
    );
    await flushAsync(20);
  });

  let refreshPromise;
  await act(async () => {
    refreshPromise = controller.refreshProfiles(controller.profiles, true);
    await flushAsync(10);
  });
  assert.ok(refreshSignal);

  await act(async () => {
    renderer.update(React.createElement(ControllerProbe, {
      api: secondApi,
      onRender: capture,
    }));
    await flushAsync(20);
  });
  assert.equal(refreshSignal.aborted, true);

  await act(async () => {
    staleRefresh.resolve(response(41, "2026-08-02T14:00:00.000Z"));
    await refreshPromise;
    await flushAsync();
  });
  assert.equal(controller.profiles[0].records[0].readinessScore, 91);
});

test("selecting a longer range prioritizes one deduplicated history request", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-08-02T12:00:00.000Z"),
  });
  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
    t.mock.timers.reset();
  });
  installBrowser(t);
  const initialHealth = deferred();
  const historyHealth = deferred();
  const healthRequests = [];

  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path === "/api/profiles") {
      return jsonResponse({ profiles: [profile] });
    }
    const url = new URL(path, "https://health.example");
    healthRequests.push(`${url.pathname}${url.search}`);
    if (url.searchParams.get("start") === "2026-07-27") {
      return initialHealth.promise;
    }
    if (url.searchParams.get("start") === "2026-02-02") {
      return historyHealth.promise;
    }
    throw new Error(`Unexpected health window: ${url.search}`);
  };

  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(DashboardScreen, { initialView: "member-one" }),
      {
        createNodeMock() {
          return {
            contains() {
              return false;
            },
            focus() {},
            scrollIntoView() {},
          };
        },
      },
    );
    await flushAsync();
  });

  act(() => renderer.root.findByProps({ id: "range-trigger" }).props.onClick());
  await act(async () => {
    renderer.root.findByProps({
      role: "option",
      "data-value": "6m",
    }).props.onClick();
    await flushAsync();
  });

  assert.deepEqual(healthRequests, [
    "/api/health?profile=member-one&start=2026-07-27&end=2026-08-02",
    "/api/health?profile=member-one&start=2026-02-02&end=2026-08-02",
  ]);

  await act(async () => {
    initialHealth.resolve(jsonResponse({
      profile: {
        id: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
      },
      records: [record],
      updatedAt: profile.lastSucceededAt,
    }));
    await flushAsync();
  });

  assert.equal(healthRequests.length, 2);
  assert.equal(
    renderer.root.findByProps({ className: "score-strip" }).props["aria-busy"],
    true,
  );

  await act(async () => {
    historyHealth.resolve(jsonResponse({
      profile: {
        id: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
      },
      records: [record],
      updatedAt: profile.lastSucceededAt,
    }));
    await flushAsync();
  });

  assert.equal(
    renderer.root.findByProps({ className: "score-strip" }).props["aria-busy"],
    false,
  );
});

test("a longer range selected before profiles load still starts history", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-08-02T12:00:00.000Z"),
  });
  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
    t.mock.timers.reset();
  });
  installBrowser(t);
  const profilesRequest = deferred();
  const initialHealth = deferred();
  const historyHealth = deferred();
  const healthRequests = [];

  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path === "/api/profiles") return profilesRequest.promise;
    const url = new URL(path, "https://health.example");
    healthRequests.push(`${url.pathname}${url.search}`);
    if (url.searchParams.get("start") === "2026-07-27") {
      return initialHealth.promise;
    }
    if (url.searchParams.get("start") === "2026-02-02") {
      return historyHealth.promise;
    }
    throw new Error(`Unexpected health window: ${url.search}`);
  };

  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(DashboardScreen, { initialView: "member-one" }),
      {
        createNodeMock() {
          return {
            contains() {
              return false;
            },
            focus() {},
            scrollIntoView() {},
          };
        },
      },
    );
    await flushAsync();
  });

  act(() => renderer.root.findByProps({ id: "range-trigger" }).props.onClick());
  await act(async () => {
    renderer.root.findByProps({
      role: "option",
      "data-value": "6m",
    }).props.onClick();
    await flushAsync();
  });
  assert.deepEqual(healthRequests, []);

  await act(async () => {
    profilesRequest.resolve(jsonResponse({ profiles: [profile] }));
    await flushAsync();
  });
  assert.deepEqual(healthRequests, [
    "/api/health?profile=member-one&start=2026-07-27&end=2026-08-02",
  ]);

  await act(async () => {
    initialHealth.resolve(jsonResponse({
      profile: {
        id: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
      },
      records: [record],
      updatedAt: profile.lastSucceededAt,
    }));
    await flushAsync();
  });

  assert.deepEqual(healthRequests, [
    "/api/health?profile=member-one&start=2026-07-27&end=2026-08-02",
    "/api/health?profile=member-one&start=2026-02-02&end=2026-08-02",
  ]);

  await act(async () => {
    historyHealth.resolve(jsonResponse({
      profile: {
        id: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
      },
      records: [record],
      updatedAt: profile.lastSucceededAt,
    }));
    await flushAsync();
  });
});

test("a pending seven-day success preserves an earlier history failure", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-08-02T12:00:00.000Z"),
  });
  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
    t.mock.timers.reset();
  });
  installBrowser(t);
  const initialHealth = deferred();
  const historyHealth = deferred();

  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path === "/api/profiles") {
      return jsonResponse({ profiles: [profile] });
    }
    const url = new URL(path, "https://health.example");
    if (url.searchParams.get("start") === "2026-07-27") {
      return initialHealth.promise;
    }
    if (url.searchParams.get("start") === "2026-02-02") {
      return historyHealth.promise;
    }
    throw new Error(`Unexpected health window: ${url.search}`);
  };

  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(DashboardScreen, { initialView: "member-one" }),
      {
        createNodeMock() {
          return {
            contains() {
              return false;
            },
            focus() {},
            scrollIntoView() {},
          };
        },
      },
    );
    await flushAsync();
  });

  act(() => renderer.root.findByProps({ id: "range-trigger" }).props.onClick());
  await act(async () => {
    renderer.root.findByProps({
      role: "option",
      "data-value": "6m",
    }).props.onClick();
    await flushAsync();
  });

  await act(async () => {
    historyHealth.reject(new Error("Longer history could not be loaded"));
    await flushAsync();
  });
  assert.match(
    textContent(renderer.root.findByProps({ className: "notice error-notice" })),
    /Longer history could not be loaded/,
  );

  await act(async () => {
    initialHealth.resolve(jsonResponse({
      profile: {
        id: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
      },
      records: [record],
      updatedAt: profile.lastSucceededAt,
    }));
    await flushAsync();
  });

  assert.match(
    textContent(renderer.root.findByProps({ className: "notice error-notice" })),
    /Longer history could not be loaded/,
  );
});

test("a late seven-day response cannot overwrite newer six-month data", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-08-02T12:00:00.000Z"),
  });
  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
    t.mock.timers.reset();
  });
  installBrowser(t);
  const initialHealth = deferred();
  const historyHealth = deferred();

  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path === "/api/profiles") {
      return jsonResponse({ profiles: [profile] });
    }
    const url = new URL(path, "https://health.example");
    if (url.searchParams.get("start") === "2026-07-27") {
      return initialHealth.promise;
    }
    if (url.searchParams.get("start") === "2026-02-02") {
      return historyHealth.promise;
    }
    throw new Error(`Unexpected health window: ${url.search}`);
  };

  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(DashboardScreen, { initialView: "member-one" }),
      {
        createNodeMock() {
          return {
            contains() {
              return false;
            },
            focus() {},
            scrollIntoView() {},
          };
        },
      },
    );
    await flushAsync();
  });

  act(() => renderer.root.findByProps({ id: "range-trigger" }).props.onClick());
  await act(async () => {
    renderer.root.findByProps({
      role: "option",
      "data-value": "6m",
    }).props.onClick();
    await flushAsync();
  });

  await act(async () => {
    historyHealth.resolve(jsonResponse({
      profile: {
        id: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
      },
      records: [{ ...record, readinessScore: 91 }],
      updatedAt: "2026-08-02T13:00:00.000Z",
    }));
    await flushAsync();
  });

  await act(async () => {
    initialHealth.resolve(jsonResponse({
      profile: {
        id: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
      },
      records: [record],
      updatedAt: profile.lastSucceededAt,
    }));
    await flushAsync();
  });

  const readiness = renderer.root.findAllByProps({ className: "score-item" })[0];
  assert.equal(textContent(readiness.findByType("dd")), "91");
  assert.match(textContent(readiness.findByType("p")), /^91 6-month average/);
});

test("an incomplete individual range never presents cached partial averages", (t) => {
  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
  });
  installBrowser(t);
  const controller = {
    view: "member-one",
    range: "6m",
    profiles: [{
      profile,
      records: [record],
      updatedAt: profile.lastSucceededAt,
      loading: false,
      refreshing: false,
      error: null,
      historyError: null,
      loadedStartDate: "2026-07-27",
      loadedEndDate: "2026-08-02",
    }],
    profilesLoading: false,
    profileListError: null,
    now: new Date("2026-08-02T12:00:00.000Z"),
    today: "2026-08-02",
    setRange() {},
    changeView() {},
    async refreshProfiles() {},
    retryProfiles() {},
  };

  act(() => {
    renderer = TestRenderer.create(
      React.createElement(DashboardContent, { controller }),
      {
        createNodeMock() {
          return {
            contains() {
              return false;
            },
            focus() {},
            scrollIntoView() {},
          };
        },
      },
    );
  });

  const scoreDetails = renderer.root
    .findAllByProps({ className: "score-item" })
    .map((item) => textContent(item.findByType("p")));
  assert.deepEqual(scoreDetails, [
    "No measurements",
    "No measurements",
    "No measurements",
  ]);
});

test("Family keeps a covered peer visible while another profile loads history", async (t) => {
  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
  });
  installBrowser(t);
  const secondProfile = {
    ...profile,
    id: "profile-member-two",
    slug: "member-two",
    displayName: "Blair",
    colorKey: "berry",
  };
  const controller = {
    view: "family",
    range: "6m",
    profiles: [
      {
        profile,
        records: [record],
        updatedAt: profile.lastSucceededAt,
        loading: false,
        refreshing: false,
        error: null,
        historyError: null,
        loadedStartDate: "2026-02-02",
        loadedEndDate: "2026-08-02",
      },
      {
        profile: secondProfile,
        records: [{ ...record, readinessScore: 72 }],
        updatedAt: secondProfile.lastSucceededAt,
        loading: false,
        refreshing: false,
        error: null,
        historyError: "Longer history could not be loaded",
        loadedStartDate: "2026-07-27",
        loadedEndDate: "2026-08-02",
      },
    ],
    profilesLoading: false,
    profileListError: null,
    now: new Date("2026-08-02T12:00:00.000Z"),
    today: "2026-08-02",
    setRange() {},
    changeView() {},
    async refreshProfiles() {},
    retryProfiles() {},
  };

  act(() => {
    renderer = TestRenderer.create(
      React.createElement(DashboardContent, { controller }),
      {
        createNodeMock() {
          return {
            contains() {
              return false;
            },
            focus() {},
            scrollIntoView() {},
          };
        },
      },
    );
  });

  await act(async () => { await import("../../../features/dashboard/components/FamilyHealthView.tsx"); });
  const legendItems = renderer.root.findAllByProps({
    className: "family-score-legend-item",
  });
  assert.equal(textContent(legendItems[0].findByType("dd")), "79");
  assert.equal(textContent(legendItems[1].findByType("dd")), "…");
  const incompleteSeries = renderer.root.findAll((node) =>
    node.type === "path" &&
    node.props.className === "family-chart-series" &&
    node.props["data-profile-id"] === secondProfile.id
  );
  assert.equal(incompleteSeries.length, 3);
  assert.ok(incompleteSeries.every((path) => path.props.d === ""));
  assert.match(
    textContent(renderer.root.findByProps({ className: "notice error-notice" })),
    /Blair: Longer history could not be loaded/,
  );
});
