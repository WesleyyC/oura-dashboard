import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import TestRenderer from "react-test-renderer";

import { useSettingsController } from "../../../features/profile-management/model/use-settings-controller.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const profile = {
  id: "profile-a",
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

async function flushAsync(turns = 8) {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

function ControllerProbe({ api, onRender }) {
  const controller = useSettingsController(undefined, api);
  onRender(controller);
  return null;
}

test("Settings refresh all forwards the device timezone for every profile", async (t) => {
  const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
  const originalError = console.error;
  Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptions() {
    return { ...originalResolvedOptions.call(this), timeZone: "Asia/Shanghai" };
  };
  console.error = (message, ...rest) => {
    if (String(message).includes("react-test-renderer is deprecated")) return;
    originalError(message, ...rest);
  };
  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
    Intl.DateTimeFormat.prototype.resolvedOptions = originalResolvedOptions;
    console.error = originalError;
  });
  const refreshCalls = [];
  const api = {
    async loadAccount() {
      return {
        configured: {
          ouraClientId: true,
          ouraClientSecret: true,
          tokenEncryptionKey: true,
        },
      };
    },
    async loadProfiles() {
      return { profiles: [profile, { ...profile, id: "profile-b" }] };
    },
    async refreshProfile(...args) {
      refreshCalls.push(args);
      return {
        profileId: args[0],
        status: "fresh",
        lastSucceededAt: profile.lastSucceededAt,
        safeErrorCode: null,
      };
    },
  };
  let controller;

  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(ControllerProbe, {
        api,
        onRender(value) {
          controller = value;
        },
      }),
    );
    await flushAsync();
  });
  await act(async () => {
    await controller.refreshAll();
    await flushAsync();
  });

  assert.deepEqual(refreshCalls, [
    ["profile-a", "Asia/Shanghai"],
    ["profile-b", "Asia/Shanghai"],
  ]);
});
