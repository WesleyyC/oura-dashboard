import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runWithConcurrency } from "../../shared/async/run-with-concurrency.ts";

test("runWithConcurrency preserves order, caps work, and settles every item", async () => {
  let active = 0;
  let maximumActive = 0;
  const results = await runWithConcurrency([1, 2, 3, 4], 2, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    if (value === 3) throw new Error("expected failure");
    return value * 10;
  });

  assert.equal(maximumActive, 2);
  assert.deepEqual(
    results.map((result) =>
      result.status === "fulfilled" ? result.value : "rejected"
    ),
    [10, 20, "rejected", 40],
  );
});

test("dashboard refresh controller reuses bounded selected-view orchestration", async () => {
  const [controller, api, screen] = await Promise.all([
    readFile(
      new URL("../../features/dashboard/model/use-dashboard-controller.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../features/dashboard/client/dashboard-api.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../features/dashboard/components/DashboardScreen.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(controller, /runWithConcurrency\(targets,\s*2,/);
  assert.match(api, /\/api\/oura\/refresh/);
  assert.match(controller, /lastSucceededAt/);
  assert.match(controller, /coverageStartDate/);
  assert.match(
    screen,
    /activeProfiles\.filter\([\s\S]*status === "connected"/s,
  );
  assert.match(
    screen,
    /onClick=\{\(\) => void refreshProfiles\(manualRefreshTargets,\s*true\)\}/,
  );
  assert.match(screen, /aria-busy=\{manuallyRefreshing\}/);
  assert.match(
    screen,
    /data-refreshing=\{manuallyRefreshing \? "true" : "false"\}/,
  );
  assert.match(controller, /refreshing/);
  assert.doesNotMatch(
    `${controller}\n${api}\n${screen}`,
    /HEALTH_PROFILES|DISPLAY_NAMES/,
  );
});
