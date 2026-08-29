import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseHealthProfile,
  parseHealthQuery,
  parseRangeQuery,
  parseSyncPayload,
} from "../../../features/health-data/domain/validation.ts";

const validRow = {
  date: "2026-07-18",
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

test("parseRangeQuery accepts a bounded inclusive date window", () => {
  assert.deepEqual(
    parseRangeQuery(new URLSearchParams("start=2026-01-18&end=2026-07-18")),
    { start: "2026-01-18", end: "2026-07-18" },
  );
});

test("parseRangeQuery rejects invalid and oversized windows", () => {
  assert.throws(() => parseRangeQuery(new URLSearchParams("start=nope&end=2026-07-18")));
  assert.throws(() =>
    parseRangeQuery(new URLSearchParams("start=2025-01-01&end=2026-07-18")),
  );
});

test("parseHealthProfile accepts normalized tenant-local profile slugs", () => {
  assert.equal(parseHealthProfile("member-one"), "member-one");
  assert.equal(parseHealthProfile("member-two"), "member-two");
  assert.equal(parseHealthProfile("family-member-2"), "family-member-2");
  assert.equal(parseHealthProfile(null, "member-one"), "member-one");
  assert.throws(() => parseHealthProfile("Family Member"), /profile/i);
  assert.throws(() => parseHealthProfile("-family"), /profile/i);
  assert.throws(() => parseHealthProfile("a".repeat(33)), /profile/i);
});

test("parseHealthQuery defaults reads to Alex and accepts a dynamic profile", () => {
  assert.deepEqual(
    parseHealthQuery(new URLSearchParams("start=2026-01-19&end=2026-07-19")),
    { profile: "member-one", start: "2026-01-19", end: "2026-07-19" },
  );
  assert.deepEqual(
    parseHealthQuery(new URLSearchParams("profile=family-member-2&start=2026-01-19&end=2026-07-19")),
    { profile: "family-member-2", start: "2026-01-19", end: "2026-07-19" },
  );
});

test("parseSyncPayload validates finite aggregate-only daily records", () => {
  assert.deepEqual(parseSyncPayload({ profile: "member-two", records: [validRow] }), {
    profile: "member-two",
    records: [validRow],
  });
  assert.throws(() => parseSyncPayload({ records: [validRow] }), /profile/i);
  assert.deepEqual(
    parseSyncPayload({ profile: "family-member-2", records: [validRow] }),
    { profile: "family-member-2", records: [validRow] },
  );
  assert.throws(() =>
    parseSyncPayload({ profile: "member-one", records: [{ ...validRow, sleepScore: Number.NaN }] }),
  );
  assert.throws(() =>
    parseSyncPayload({ profile: "member-one", records: [{ ...validRow, eventTitle: "Private meeting" }] }),
    /unknown field/i,
  );
  assert.throws(() =>
    parseSyncPayload({ profile: "member-one", records: [{ ...validRow, meetingMinutes: 60 }] }),
    /unknown field/i,
  );
});

test("API health reads derive the tenant only from trusted identity", async () => {
  const readRoute = await readFile(
    new URL("../../../app/api/health/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(readRoute, /requireRequestUser\(request\)/);
  assert.match(readRoute, /parseHealthQuery\(url\.searchParams\)/);
  assert.match(
    readRoute,
    /readHealthRange\(\s*user\.userId,\s*range\.profile,\s*range\.start,\s*range\.end/s,
  );
  assert.doesNotMatch(readRoute, /searchParams\.get\(["']owner/i);
});
