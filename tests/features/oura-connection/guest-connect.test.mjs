import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import TestRenderer from "react-test-renderer";
import { GuestOuraConnect } from "../../../features/oura-connection/components/GuestOuraConnect.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("guest disclosure precedes authorization and remains usable under StrictMode", async (t) => {
  const original = { window: globalThis.window, fetch: globalThis.fetch, error: console.error };
  let renderer;
  const calls = [];
  globalThis.window = {
    location: { hash: "#invite=synthetic-capability", assign() {} },
    history: { replaceState() { globalThis.window.location.hash = ""; } },
  };
  console.error = (message, ...args) => { if (!String(message).includes("react-test-renderer")) original.error(message, ...args); };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), hash: window.location.hash });
    return Response.json({ displayName: "Alex", expiresAt: "2099-01-01T00:00:00.000Z" });
  };
  t.after(() => {
    act(() => renderer?.unmount());
    globalThis.window = original.window; globalThis.fetch = original.fetch; console.error = original.error;
  });
  await act(async () => { renderer = TestRenderer.create(React.createElement(React.StrictMode, null, React.createElement(GuestOuraConnect))); });
  assert.equal(renderer.root.findAllByType("button").length, 1);
  const copy = JSON.stringify(renderer.toJSON());
  assert.match(copy, /dashboard owner can view/);
  assert.match(copy, /Revoke access in your Oura account/);
  assert.match(copy, /cached data/);
  assert.match(copy, /six months/);
  assert.ok(calls.every(({ url, body, hash }) => url.endsWith("/inspect") && body.invite === "synthetic-capability" && hash === ""));
});
