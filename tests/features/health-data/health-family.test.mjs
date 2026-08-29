import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFamilyTrend,
  summarizeFamilyScore,
} from "../../../features/health-data/domain/family.ts";

const scoreRow = (date, readinessScore) => ({ date, readinessScore });

test("buildFamilyTrend aligns arbitrary profile IDs and preserves missing scores", () => {
  const profiles = [
    {
      profileId: "a",
      records: [scoreRow("2026-07-18", 84), scoreRow("2026-07-17", 80)],
    },
    {
      profileId: "b",
      records: [scoreRow("2026-07-18", 88), scoreRow("2026-07-17", null)],
    },
    {
      profileId: "c",
      records: [scoreRow("2026-07-18", 77)],
    },
  ];

  assert.deepEqual(buildFamilyTrend(profiles, "readinessScore"), [
    {
      date: "2026-07-17",
      label: "Jul 17",
      values: { a: 80, b: null, c: null },
    },
    {
      date: "2026-07-18",
      label: "Jul 18",
      values: { a: 84, b: 88, c: 77 },
    },
  ]);
});

test("summarizeFamilyScore reports independent averages and a two-profile delta", () => {
  const profiles = [
    {
      profileId: "a",
      records: [scoreRow("2026-07-17", 80), scoreRow("2026-07-18", 84)],
    },
    {
      profileId: "b",
      records: [scoreRow("2026-07-17", null), scoreRow("2026-07-18", 88)],
    },
  ];

  assert.deepEqual(summarizeFamilyScore(profiles, "readinessScore"), {
    averages: { a: 82, b: 88 },
    difference: 6,
    pairedDays: 1,
  });
});

test("three-profile summaries omit pairwise deltas and require all profiles for shared days", () => {
  assert.deepEqual(
    summarizeFamilyScore(
      [
        {
          profileId: "a",
          records: [
            scoreRow("2026-07-17", 80),
            scoreRow("2026-07-18", Number.NaN),
          ],
        },
        {
          profileId: "b",
          records: [scoreRow("2026-07-18", 88)],
        },
        {
          profileId: "c",
          records: [scoreRow("2026-07-18", 77)],
        },
      ],
      "readinessScore",
    ),
    {
      averages: { a: 80, b: 88, c: 77 },
      difference: null,
      pairedDays: 0,
    },
  );
});

test("buildFamilyTrend uses aligned trailing windows for every profile", () => {
  const profiles = [
    {
      profileId: "a",
      records: [
        scoreRow("2026-07-01", 70),
        scoreRow("2026-07-02", 80),
        scoreRow("2026-07-03", 90),
        scoreRow("2026-07-04", null),
      ],
    },
    {
      profileId: "b",
      records: [
        scoreRow("2026-07-01", 60),
        scoreRow("2026-07-02", null),
        scoreRow("2026-07-03", 80),
        scoreRow("2026-07-04", 100),
      ],
    },
  ];

  assert.deepEqual(buildFamilyTrend(profiles, "readinessScore", 3), [
    { date: "2026-07-01", label: "Jul 1", values: { a: 70, b: 60 } },
    { date: "2026-07-02", label: "Jul 2", values: { a: 75, b: 60 } },
    { date: "2026-07-03", label: "Jul 3", values: { a: 80, b: 70 } },
    { date: "2026-07-04", label: "Jul 4", values: { a: 85, b: 90 } },
  ]);
});
