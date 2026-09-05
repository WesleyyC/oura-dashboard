import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import TestRenderer from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test("diagnostics make no automatic requests and history repair needs explicit confirmation", async (t) => {
  const { SyncDiagnostics } = await import("../../../features/oura-connection/components/SyncDiagnostics.tsx").catch(() => ({}));
  assert.equal(typeof SyncDiagnostics, "function");
  const calls = [];
  const api = {
    async load() { calls.push("load"); return { checkedAt: "2026-09-04T00:00:00.000Z", profiles: [] }; },
    async repair(profileId) { calls.push(profileId); return { profileId, status: "refreshed", safeErrorCode: null, lastSucceededAt: null }; },
  };
  let confirm = false;
  let renderer;
  const previous = console.error;
  console.error = (message, ...args) => { if (!String(message).includes("react-test-renderer")) previous(message, ...args); };
  t.after(() => { act(() => renderer?.unmount()); console.error = previous; });
  act(() => { renderer = TestRenderer.create(React.createElement(SyncDiagnostics, {
    profiles: [{ id: "profile-a", displayName: "Alex", status: "connected" }],
    api, confirmRepair: () => confirm,
  })); });
  assert.deepEqual(calls, []);
  const button = (name) => renderer.root.findAllByType("button").find((node) => node.children.join("") === name);
  await act(async () => { await button("Check sync status").props.onClick(); });
  assert.deepEqual(calls, ["load"]);
  await act(async () => { await button("Repair six-month history").props.onClick(); });
  assert.deepEqual(calls, ["load"]);
  confirm = true;
  await act(async () => { await button("Repair six-month history").props.onClick(); });
  assert.deepEqual(calls, ["load", "profile-a", "load"]);
});
