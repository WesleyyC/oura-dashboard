import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import TestRenderer from "react-test-renderer";

import { SettingsContent } from "../../../features/profile-management/components/SettingsScreen.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.self = globalThis;

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

function profile(overrides = {}) {
  return {
    id: "profile-a",
    slug: "member-one",
    displayName: "Alex",
    colorKey: "ocean",
    sortOrder: 0,
    status: "connected",
    updatedAt: "2026-08-02T12:00:00.000Z",
    lastSucceededAt: null,
    coverageStartDate: null,
    safeErrorCode: null,
    ...overrides,
  };
}

function controller(overrides = {}) {
  return {
    configured: null,
    profiles: [],
    newDisplayName: "",
    deleteConfirmation: "",
    loading: false,
    busyAction: null,
    notice: null,
    deleted: false,
    handoff: null,
    setupReady: true,
    setNewDisplayName() {},
    setDeleteConfirmation() {},
    addProfile() {},
    addProfileHandoff() {},
    async checkHandoff() {},
    async cancelHandoff() {},
    closeHandoff() {},
    async renameProfile() {},
    async updateProfileColor() {},
    async moveProfile() {},
    async removeProfile() {},
    async refreshAll() {},
    async deleteAccount() {},
    startReconnect() {},
    startReconnectHandoff() {},
    ...overrides,
  };
}

function addPersonButton(root) {
  return root.findByProps({ "aria-controls": "add-person-panel" });
}

test("add-person flow waits for loading and auto-opens an empty dashboard", (t) => {
  const renderer = create(React.createElement(
    SettingsContent,
    { controller: controller({ loading: true }) },
  ));
  t.after(() => act(() => renderer.unmount()));

  assert.equal(addPersonButton(renderer.root).props["aria-expanded"], false);
  assert.equal(renderer.root.findAllByProps({ id: "add-person-panel" }).length, 0);

  act(() => {
    renderer.update(React.createElement(
      SettingsContent,
      { controller: controller({ loading: false }) },
    ));
  });

  assert.equal(addPersonButton(renderer.root).props["aria-expanded"], true);
  assert.equal(addPersonButton(renderer.root).children.join(""), "Cancel");
  assert.equal(renderer.root.findAllByProps({ id: "add-person-panel" }).length, 1);
  assert.equal(renderer.root.findAllByProps({ className: "setup-empty" }).length, 0);
});

test("populated settings keeps Add person inline and preserves typed input on cancel", (t) => {
  const setNameCalls = [];
  const value = controller({
    profiles: [profile()],
    newDisplayName: "Blair",
    setNewDisplayName: (next) => setNameCalls.push(next),
  });
  const renderer = create(React.createElement(SettingsContent, { controller: value }));
  t.after(() => act(() => renderer.unmount()));

  assert.equal(addPersonButton(renderer.root).props["aria-expanded"], false);
  assert.equal(addPersonButton(renderer.root).children.join(""), "Add person");
  assert.equal(renderer.root.findAllByProps({ id: "add-person-panel" }).length, 0);

  act(() => addPersonButton(renderer.root).props.onClick());
  assert.equal(addPersonButton(renderer.root).props["aria-expanded"], true);
  assert.equal(
    renderer.root.findByProps({ id: "family-member-name" }).props.value,
    "Blair",
  );

  act(() => addPersonButton(renderer.root).props.onClick());
  assert.equal(renderer.root.findAllByProps({ id: "add-person-panel" }).length, 0);
  assert.deepEqual(setNameCalls, []);
});

test("settings orders people first, demotes backend state, and hides deletion controls", (t) => {
  const renderer = create(React.createElement(
    SettingsContent,
    { controller: controller({ profiles: [profile()] }) },
  ));
  t.after(() => act(() => renderer.unmount()));

  assert.deepEqual(
    renderer.root.findAllByType("section").map(({ props }) => props["aria-labelledby"]),
    ["connected-people", "oura-connection", "dashboard-account"],
  );
  assert.equal(renderer.root.findByProps({ className: "text-link settings-back-link" }).props.href, "/");
  assert.equal(
    renderer.root
      .findByProps({ className: "system-status" })
      .findByProps({ "data-state": "connected" })
      .children.join(""),
    "Ready",
  );

  const recovery = renderer.root.findByProps({ className: "account-disclosure sync-diagnostics" });
  assert.equal(recovery.props.open, undefined);
  assert.equal(recovery.findByType("summary").children.join(""), "Sync diagnostics and recovery");
  const details = renderer.root.findByProps({ className: "account-disclosure" });
  assert.equal(details.props.open, undefined);
  assert.equal(details.props.className, "account-disclosure");
  assert.equal(details.findByType("summary").children.join(""), "Delete dashboard data");
  assert.equal(details.findAllByProps({ id: "delete-confirmation" }).length, 1);
});

test("system setup help appears only when the backend needs attention", (t) => {
  const renderer = create(React.createElement(
    SettingsContent,
    { controller: controller({ setupReady: false }) },
  ));
  t.after(() => act(() => renderer.unmount()));

  assert.equal(renderer.root.findByProps({ "data-state": "attention" }).children.join(""), "Setup required");
  assert.equal(
    renderer.root.findAll(({ children }) => children.join("") === "App credentials are managed in Sites Settings.").length,
    1,
  );

  act(() => {
    renderer.update(React.createElement(
      SettingsContent,
      { controller: controller({ setupReady: true }) },
    ));
  });
  assert.equal(
    renderer.root.findAll(({ children }) => children.join("") === "App credentials are managed in Sites Settings.").length,
    0,
  );
});
