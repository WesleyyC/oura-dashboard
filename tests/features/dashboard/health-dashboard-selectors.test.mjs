import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import TestRenderer from "react-test-renderer";

import { DashboardScreen as HealthDashboard } from "../../../features/dashboard/components/DashboardScreen.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const profiles = [
  {
    id: "profile-member-one",
    slug: "member-one",
    displayName: "Alex",
    colorKey: "ocean",
    sortOrder: 0,
    status: "connected",
    updatedAt: "2026-08-01T12:00:00.000Z",
    lastSucceededAt: "2026-08-01T12:00:00.000Z",
    coverageStartDate: "2025-01-01",
    safeErrorCode: null,
  },
  {
    id: "profile-member-two",
    slug: "member-two",
    displayName: "Blair",
    colorKey: "berry",
    sortOrder: 1,
    status: "connected",
    updatedAt: "2026-08-01T12:00:00.000Z",
    lastSucceededAt: "2026-08-01T12:00:00.000Z",
    coverageStartDate: "2025-01-01",
    safeErrorCode: null,
  },
];

function jsonResponse(body) {
  return {
    ok: true,
    async json() {
      return body;
    },
  };
}

test("Person selection preserves the current URL while changing the view", async (t) => {
  const originalWindow = globalThis.window;
  const originalSelf = globalThis.self;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const historyCalls = [];
  const documentTarget = new EventTarget();
  Object.defineProperty(documentTarget, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  globalThis.document = documentTarget;
  globalThis.window = {
    location: {
      href: "https://health.example/dashboard?source=test&view=member-one#scores",
    },
    history: {
      replaceState(...args) {
        historyCalls.push(args);
      },
    },
    setInterval() {
      return 1;
    },
    clearInterval() {},
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
  globalThis.self = globalThis.window;
  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path === "/api/profiles") return jsonResponse({ profiles });
    const url = new URL(path, "https://health.example");
    const slug = url.searchParams.get("profile");
    const profile = profiles.find((item) => item.slug === slug);
    assert.ok(profile, `Unexpected profile request: ${slug}`);
    return jsonResponse({
      profile: {
        id: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
      },
      records: [],
      updatedAt: profile.lastSucceededAt,
    });
  };
  console.error = (message, ...rest) => {
    if (String(message).includes("react-test-renderer is deprecated")) return;
    originalError(message, ...rest);
  };

  let renderer;
  t.after(() => {
    if (renderer) act(() => renderer.unmount());
    console.error = originalError;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalSelf === undefined) delete globalThis.self;
    else globalThis.self = originalSelf;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  });

  await act(async () => {
    renderer = TestRenderer.create(React.createElement(HealthDashboard, {
      initialView: "member-one",
    }), {
      createNodeMock(node) {
        if (typeof node.type !== "string") return null;
        return {
          contains() {
            return false;
          },
          focus() {},
          scrollIntoView() {},
        };
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  const personTrigger = renderer.root.findByProps({ id: "person-trigger" });
  assert.equal(personTrigger.props.disabled, false);
  act(() => personTrigger.props.onClick());
  const familyOption = renderer.root.findByProps({
    role: "option",
    "data-value": "family",
  });
  act(() => familyOption.props.onClick());

  assert.equal(historyCalls.length, 1);
  assert.equal(
    historyCalls[0][2].href,
    "https://health.example/dashboard?source=test&view=family#scores",
  );
  assert.equal(renderer.root.findByProps({ id: "person-value" }).children.join(""), "Family");
});
