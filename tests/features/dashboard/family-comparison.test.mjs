import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import TestRenderer from "react-test-renderer";

import { METRIC_GROUPS } from "../../../features/health-data/domain/metrics.ts";
import {
  buildFamilyComparisonSections,
  FamilyComparison,
} from "../../../features/dashboard/components/FamilyComparison.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function summary(values = {}) {
  return Object.fromEntries(
    METRIC_GROUPS.flatMap(({ items }) => items).map(({ key }) => [
      key,
      Object.hasOwn(values, key) ? {
        average: values[key].average,
        minimum: null,
        maximum: null,
        latest: values[key].latest,
        standardDeviation: values[key].standardDeviation,
        count: values[key].count ?? 1,
      } : {
        average: null,
        minimum: null,
        maximum: null,
        latest: null,
        standardDeviation: null,
        count: 0,
      },
    ]),
  );
}

function profile(id, displayName, color, values = {}, loading = false) {
  return {
    id,
    displayName,
    color,
    summary: summary(values),
    loading,
  };
}

function create(element) {
  const originalError = console.error;
  console.error = (message, ...rest) => {
    if (String(message).includes("react-test-renderer is deprecated")) return;
    originalError(message, ...rest);
  };
  try {
    let renderer;
    act(() => {
      renderer = TestRenderer.create(element);
    });
    return renderer;
  } finally {
    console.error = originalError;
  }
}

function text(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node.children.map(text).join("");
}

test("family comparison derives selected-range outliers and renders both selectable views", (t) => {
  const memberOne = profile(
    "member-one",
    "Alex",
    "var(--profile-ocean)",
    {
      sleepEfficiency: { average: 90, latest: 100, standardDeviation: 5 },
      totalSleepMinutes: { average: 450, latest: 600, standardDeviation: 20 },
    },
  );
  const memberTwo = profile(
    "member-two",
    "Blair with a longer family name",
    "var(--profile-rose)",
    { sleepEfficiency: { average: 80, latest: 70, standardDeviation: 5 } },
  );
  const sections = buildFamilyComparisonSections([memberOne, memberTwo], false);

  assert.deepEqual(sections.map(({ title }) => title), [
    "Sleep",
    "Recovery",
    "Daily balance",
    "Movement",
  ]);
  const efficiency = sections[0].rows.find(
    ({ metric }) => metric.key === "sleepEfficiency",
  );
  assert.deepEqual(
    efficiency.values.map(({ displayName, formattedValue, status }) => ({
      displayName,
      formattedValue,
      status: status?.label ?? null,
    })),
    [
      { displayName: "Alex", formattedValue: "90%", status: "Favorable" },
      { displayName: "Blair with a longer family name", formattedValue: "80%", status: "Unfavorable" },
    ],
  );
  assert.deepEqual(efficiency.difference, {
    label: "Blair with a longer family name − Alex",
    formattedValue: "−10%",
  });

  const selected = [];
  const renderer = create(React.createElement(FamilyComparison, {
    profiles: [memberOne, memberTwo],
    loading: false,
    selectedMetric: "totalSleepMinutes",
    onSelectMetric: (key) => selected.push(key),
  }));
  t.after(() => act(() => renderer.unmount()));

  assert.equal(renderer.root.findAllByProps({ className: "family-comparison-desktop" }).length, 1);
  assert.equal(renderer.root.findAllByProps({ className: "family-comparison-list" }).length, 1);
  assert.equal(renderer.root.findByType("table").findAllByType("col").length, 4);
  const statuses = renderer.root
    .findAllByProps({ className: "metric-status" })
    .map(text);
  assert.equal(statuses.filter((status) => status === "↑Latest favorable").length, 2);
  assert.equal(statuses.filter((status) => status === "↓Latest unfavorable").length, 2);
  for (const displayName of [memberOne.displayName, memberTwo.displayName]) {
    assert.equal(
      renderer.root.findAllByProps({ className: "family-comparison-mobile-profile-name" })
        .some((node) => node.children.join("") === displayName),
      true,
    );
  }
  act(() => {
    renderer.root
      .findAllByProps({ "data-metric-key": "sleepEfficiency" })
      .at(-1)
      .props.onClick();
  });
  assert.deepEqual(selected, ["sleepEfficiency"]);
});

test("family comparison omits in-range, missing, and neutral selected-range statuses", () => {
  const sections = buildFamilyComparisonSections([
    profile("member-one", "Alex", "var(--profile-ocean)", {
      sleepEfficiency: { average: 90, latest: 95, standardDeviation: 5 },
      hrvMs: { average: null, latest: null, standardDeviation: null, count: 0 },
      recoveryMinutes: { average: 100, latest: 120, standardDeviation: 0 },
      totalSleepMinutes: { average: 450, latest: 600, standardDeviation: 20 },
    }),
  ], false);

  const valuesByMetric = new Map(
    sections.flatMap(({ rows }) => rows).map(({ metric, values }) => [
      metric.key,
      values[0],
    ]),
  );
  assert.equal(valuesByMetric.get("sleepEfficiency").status, null);
  assert.equal(valuesByMetric.get("hrvMs").status, null);
  assert.equal(valuesByMetric.get("recoveryMinutes").status, null);
  assert.equal(valuesByMetric.get("totalSleepMinutes").status, null);
});

test("family comparison preserves loaded peers while another profile is pending", () => {
  const memberOne = profile(
    "member-one",
    "Alex",
    "var(--profile-ocean)",
    { sleepEfficiency: { average: 90, latest: 100, standardDeviation: 5 } },
  );
  const memberTwo = profile(
    "member-two",
    "Blair",
    "var(--profile-rose)",
    { sleepEfficiency: { average: 80, latest: 70, standardDeviation: 5 } },
    true,
  );

  const sections = buildFamilyComparisonSections([memberOne, memberTwo], true);
  const efficiency = sections[0].rows.find(
    ({ metric }) => metric.key === "sleepEfficiency",
  );

  assert.deepEqual(
    efficiency.values.map(({ formattedValue, status }) => ({
      formattedValue,
      status: status?.label ?? null,
    })),
    [
      { formattedValue: "90%", status: "Favorable" },
      { formattedValue: "…", status: "Unfavorable" },
    ],
  );
  assert.equal(efficiency.difference.formattedValue, "…");
});

test("family comparison renders missing primary values without a status", () => {
  const sections = buildFamilyComparisonSections([
    profile("missing", "Missing", "var(--profile-sage)"),
  ], false);
  const efficiency = sections[0].rows.find(
    ({ metric }) => metric.key === "sleepEfficiency",
  );

  assert.deepEqual(
    {
      formattedValue: efficiency.values[0].formattedValue,
      status: efficiency.values[0].status,
    },
    { formattedValue: "—", status: null },
  );
});

test("family comparison omits differences and focus affordances for three profiles", (t) => {
  const profiles = [
    profile("member-one", "Alex", "var(--profile-ocean)", { sleepEfficiency: { average: 90, latest: 100, standardDeviation: 5 } }),
    profile("member-two", "Blair", "var(--profile-rose)", { sleepEfficiency: { average: 80, latest: 70, standardDeviation: 5 } }),
    profile("sam", "Sam", "var(--profile-sage)", { sleepEfficiency: { average: 85, latest: 85, standardDeviation: 5 } }),
  ];
  const sections = buildFamilyComparisonSections(profiles, false);
  assert.equal(sections.every(({ rows }) => rows.every(({ values }) => values.length === 3)), true);

  const renderer = create(React.createElement(FamilyComparison, {
    profiles,
    loading: false,
    selectedMetric: "totalSleepMinutes",
    onSelectMetric() {},
  }));
  t.after(() => act(() => renderer.unmount()));

  assert.equal(renderer.root.findAllByProps({ className: "family-comparison-difference" }).length, 0);
  const wrapper = renderer.root.findByProps({ className: "family-comparison-desktop" });
  assert.equal(wrapper.props.tabIndex, undefined);
  assert.equal(wrapper.props["aria-label"], undefined);
  assert.equal(wrapper.props["data-overflow"], undefined);
});

test("family comparison focuses and labels the four-profile overflow wrapper", (t) => {
  const profiles = [
    profile("member-one", "Alex", "var(--profile-ocean)"),
    profile("member-two", "Blair", "var(--profile-rose)"),
    profile("sam", "Sam", "var(--profile-sage)"),
    profile("alex", "Alex", "var(--profile-gold)"),
  ];
  const renderer = create(React.createElement(FamilyComparison, {
    profiles,
    loading: false,
    selectedMetric: "totalSleepMinutes",
    onSelectMetric() {},
  }));
  t.after(() => act(() => renderer.unmount()));

  const wrapper = renderer.root.findByProps({ className: "family-comparison-desktop" });
  assert.equal(wrapper.props.tabIndex, 0);
  assert.equal(wrapper.props["aria-label"], "Scrollable detailed family comparison");
  assert.equal(wrapper.props["data-overflow"], "true");
});

test("family category labels occupy the Metric column instead of spanning the table", (t) => {
  const availableProfiles = [
    profile("member-one", "Alex", "var(--profile-ocean)"),
    profile("member-two", "Blair", "var(--profile-rose)"),
    profile("sam", "Sam", "var(--profile-sage)"),
    profile("alex", "Alex", "var(--profile-gold)"),
  ];
  for (const { profileCount, continuationSpan } of [
    { profileCount: 1, continuationSpan: 1 },
    { profileCount: 2, continuationSpan: 3 },
    { profileCount: 4, continuationSpan: 4 },
  ]) {
    const renderer = create(React.createElement(FamilyComparison, {
      profiles: availableProfiles.slice(0, profileCount),
      loading: false,
      selectedMetric: "totalSleepMinutes",
      onSelectMetric() {},
    }));
    t.after(() => act(() => renderer.unmount()));

    const categoryRows = renderer.root.findAllByProps({
      className: "family-metric-group-row",
    });
    assert.equal(categoryRows.length, METRIC_GROUPS.length);
    for (const row of categoryRows) {
      const cells = row.findAll((node) => node.type === "th" || node.type === "td");
      assert.equal(cells.length, 2);
      assert.equal(cells[0].type, "th");
      assert.equal(cells[0].props.scope, "rowgroup");
      assert.equal(cells[0].props.colSpan, undefined);
      assert.equal(cells[1].type, "td");
      assert.equal(cells[1].props.colSpan, continuationSpan);
      assert.equal(cells[1].props["aria-hidden"], "true");
    }
  }
});
