import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import TestRenderer from "react-test-renderer";
import { IndividualHealthView } from "../../../features/dashboard/components/IndividualHealthView.tsx";
import { FamilyHealthView } from "../../../features/dashboard/components/FamilyHealthView.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function syntheticRecords() {
  return Array.from({ length: 180 }, (_, index) => {
    const date = new Date("2026-03-09T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      readinessScore: 80 + index % 10,
      sleepScore: 75 + index % 10,
      activityScore: 70 + index % 10,
      totalSleepMinutes: 420 + index % 40,
    };
  });
}

const records = syntheticRecords();

function dashboard(view, data = records) {
  const props = {
    range: "6m", today: "2026-09-04", loading: false, error: null, onRetry() {},
  };
  return view === "individual"
    ? React.createElement(IndividualHealthView, {
        ...props, profileId: "sample-one", displayName: "Alex",
        colorKey: "ocean", records: data,
      })
    : React.createElement(FamilyHealthView, {
        ...props,
        profiles: ["Alex", "Blair"].map((name, index) => ({
          profile: {
            id: `sample-${index}`, slug: name.toLowerCase(), displayName: name,
            colorKey: index ? "berry" : "ocean",
          },
          records: data, loading: false, error: null,
        })),
      });
}

function create(element) {
  let renderer;
  act(() => { renderer = TestRenderer.create(element); });
  return renderer;
}

function staticChartElements(root) {
  return root.findAll(node => node.type === "svg" || (node.type === "table" && node.props.className === "visually-hidden"));
}

for (const view of ["individual", "family"]) {
  test(`${view} date selection reuses static SVGs and accessible data tables`, (t) => {
    const renderer = create(dashboard(view));
    t.after(() => act(() => renderer.unmount()));
    const before = staticChartElements(renderer.root).map(node => node.props.children);
    const start = performance.now();
    act(() => renderer.root.findAllByProps({role:"slider"})[0].props.onKeyDown({key:"Home",preventDefault(){}}));
    t.diagnostic(`six-month selection render: ${(performance.now()-start).toFixed(2)} ms`);
    const after = staticChartElements(renderer.root).map(node => node.props.children);
    assert.equal(after.length, before.length);
    after.forEach((children,index) => assert.ok(children === before[index], "Selecting a date should update readouts, not rebuild static chart data"));
    const dates = renderer.root.findAllByProps({role:"slider"}).map(node => node.props["aria-valuetext"].split(",")[0]);
    assert.equal(new Set(dates).size,1);
    assert.equal(dates[0],"Mar 9");
  });

  test(`${view} static charts and tables still update when records change`, (t) => {
    const renderer = create(dashboard(view));
    t.after(() => act(() => renderer.unmount()));
    const before = staticChartElements(renderer.root).map(node => node.props.children);
    const oldPaths = renderer.root.findAllByType("path").map(node => node.props.d);
    const changedRecords = records.map((record, index) => index === records.length - 1
      ? { ...record, readinessScore: 20, sleepScore: 20, activityScore: 20, totalSleepMinutes: 100 }
      : record);
    act(() => renderer.update(dashboard(view, changedRecords)));
    const after = staticChartElements(renderer.root).map(node => node.props.children);
    assert.equal(after.length, before.length);
    after.forEach((children, index) => assert.ok(children !== before[index]));
    const newPaths = renderer.root.findAllByType("path").map(node => node.props.d);
    assert.notDeepEqual(newPaths, oldPaths);
    const expectedScore = Math.round(changedRecords.slice(-7).reduce((sum, row) => sum + row.readinessScore, 0) / 7);
    assert.match(renderer.root.findAllByProps({ role: "slider" })[0].props["aria-valuetext"], new RegExp(`Readiness ${expectedScore}`));
  });
}

test("pointer and keyboard chart focus retain distinct feedback", (t) => {
  const renderer = create(dashboard("individual"));
  t.after(() => act(() => renderer.unmount()));
  const slider=() => renderer.root.findAllByProps({role:"slider"})[0];
  let focused=false;
  act(() => slider().props.onPointerDown({button:0,pointerType:"mouse",clientX:100,currentTarget:{focus(){focused=true;},getBoundingClientRect(){return {left:0,width:600};}}}));
  assert.equal(focused,true);
  assert.equal(slider().props["data-chart-input"],"pointer");
  act(() => slider().props.onKeyDown({key:"ArrowRight",preventDefault(){}}));
  assert.equal(slider().props["data-chart-input"],"keyboard");
  act(() => slider().props.onBlur());
  assert.equal(slider().props["data-chart-input"],undefined);
});

test("chart focus styles distinguish pointer selection from keyboard navigation", () => {
  const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\[data-chart-input="pointer"\]:focus\s*\{\s*outline: none;/);
  assert.match(css, /\[data-chart-input="keyboard"\]:focus\s*\{\s*outline: 3px solid/);
  assert.match(css, /\.chart-message\s*\{[^}]*inset: 0;/);
});

test("family tick labels are positioned on their grid lines, including endpoints", (t) => {
  const renderer = create(dashboard("family"));
  t.after(() => act(() => renderer.unmount()));
  for (const panel of renderer.root.findAllByProps({ className: "family-score-panel" })) {
    const labels = panel.findByProps({ className: "family-y-axis" }).findAllByType("span");
    const guides = panel.findAllByProps({ className: "family-chart-guide" });
    for (const label of labels) {
      const y = parseFloat(label.props.style.top) / 100 * 220;
      assert.ok(guides.some(guide => Math.abs(guide.props.y1 - y) < 0.001));
    }
    assert.equal(labels[0].props.style.top, "0%");
    assert.equal(labels.at(-1).props.style.top, "100%");
  }
});
