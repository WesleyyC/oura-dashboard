import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import TestRenderer from "react-test-renderer";

import { ProfileColorPicker } from "../../../features/profile-management/components/ProfileColorPicker.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

function props(overrides = {}) {
  return {
    profileId: "profile-a",
    displayName: "Alex",
    colorKey: "ocean",
    saving: false,
    disabled: false,
    onChange() {},
    ...overrides,
  };
}

test("profile color picker uses the shared compact menu with six named choices", (t) => {
  const changes = [];
  const renderer = create(React.createElement(
    ProfileColorPicker,
    props({ onChange: (colorKey) => changes.push(colorKey) }),
  ));
  t.after(() => act(() => renderer.unmount()));

  const root = renderer.root.findByProps({ className: "dashboard-selector" });
  const trigger = renderer.root.findByProps({ "aria-haspopup": "listbox" });
  const listbox = renderer.root.findByProps({ role: "listbox" });
  const options = renderer.root.findAllByProps({ role: "option" });
  assert.equal(root.props["data-presentation"], "menu");
  assert.equal(trigger.props["aria-describedby"], "profile-color-description-profile-a");
  assert.equal(listbox.props["aria-describedby"], "profile-color-description-profile-a");
  assert.equal(options.length, 6);
  assert.deepEqual(options.map(({ props: option }) => option.children[1].props.children), [
    "Ocean blue",
    "Berry",
    "Meadow green",
    "Sunset amber",
    "Iris violet",
    "Lagoon teal",
  ]);
  assert.equal(
    options.find(({ props: option }) => option["data-value"] === "ocean").props["aria-selected"],
    true,
  );
  assert.equal(renderer.root.findAllByProps({ className: "dashboard-selector-mark" }).length, 7);

  act(() => {
    trigger.props.onClick();
  });
  act(() => {
    options.find(({ props: option }) => option["data-value"] === "berry").props.onClick();
  });
  assert.deepEqual(changes, ["berry"]);
  assert.equal(
    renderer.root.findByProps({ "data-value": "ocean" }).props["aria-selected"],
    true,
  );
});

test("profile color picker exposes a disabled saving state", (t) => {
  const renderer = create(React.createElement(
    ProfileColorPicker,
    props({ saving: true }),
  ));
  t.after(() => act(() => renderer.unmount()));

  assert.equal(renderer.root.findByProps({ "aria-haspopup": "listbox" }).props.disabled, true);
  assert.equal(
    renderer.root.findByProps({ role: "listbox" }).props["aria-disabled"],
    true,
  );
  assert.equal(
    renderer.root.findByProps({ role: "status" }).children.join(""),
    "Saving color…",
  );
});
