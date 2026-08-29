import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL("../../shared/time-zone.ts", import.meta.url);

async function loadTimeZoneModule() {
  return import(moduleUrl).catch(() => ({}));
}

test("one instant resolves to each device timezone's calendar date", async () => {
  const timeZone = await loadTimeZoneModule();
  const instant = new Date("2026-08-03T01:25:00.000Z");

  assert.equal(timeZone.dateInTimeZone?.(instant, "Asia/Shanghai"), "2026-08-03");
  assert.equal(timeZone.dateInTimeZone?.(instant, "America/New_York"), "2026-08-02");
});

test("timezone validation accepts IANA names and rejects offsets or malformed input", async () => {
  const timeZone = await loadTimeZoneModule();

  assert.equal(timeZone.isValidTimeZone?.("Asia/Shanghai"), true);
  assert.equal(timeZone.isValidTimeZone?.("America/New_York"), true);
  assert.equal(timeZone.isValidTimeZone?.("UTC"), true);
  assert.equal(timeZone.isValidTimeZone?.("+08:00"), false);
  assert.equal(timeZone.isValidTimeZone?.("Not a timezone"), false);
  assert.equal(timeZone.isValidTimeZone?.(null), false);
});

test("browser timezone normalization falls back without using network location", async () => {
  const timeZone = await loadTimeZoneModule();

  assert.equal(timeZone.normalizeTimeZone?.("Asia/Shanghai"), "Asia/Shanghai");
  assert.equal(timeZone.normalizeTimeZone?.("+08:00"), "America/New_York");
  assert.equal(timeZone.normalizeTimeZone?.(undefined), "America/New_York");
});

test("browser timezone resolution uses Intl and falls back when it is unavailable", async () => {
  const timeZone = await loadTimeZoneModule();

  assert.equal(
    timeZone.resolveLocalTimeZone?.(() => "Asia/Shanghai"),
    "Asia/Shanghai",
  );
  assert.equal(
    timeZone.resolveLocalTimeZone?.(() => {
      throw new Error("timezone unavailable");
    }),
    "America/New_York",
  );
});
