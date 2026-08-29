import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import TestRenderer from "react-test-renderer";

import { DashboardSelector } from "../../shared/ui/DashboardSelector.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function create(element) {
  const focusCalls = [];
  const scrollCalls = [];
  const originalError = console.error;
  console.error = (message, ...rest) => {
    if (String(message).includes("react-test-renderer is deprecated")) return;
    originalError(message, ...rest);
  };
  try {
    let renderer;
    act(() => {
      renderer = TestRenderer.create(element, {
        createNodeMock(node) {
          if (typeof node.type !== "string") return null;
          return {
            contains() {
              return false;
            },
            focus(options) {
              focusCalls.push({
                id: node.props.id ?? null,
                role: node.props.role ?? null,
                options,
              });
            },
            scrollIntoView(options) {
              scrollCalls.push({
                id: node.props.id ?? null,
                options,
              });
            },
          };
        },
      });
    });
    return { renderer, focusCalls, scrollCalls };
  } finally {
    console.error = originalError;
  }
}

function selectorProps(overrides = {}) {
  return {
    id: "person",
    label: "Person",
    value: "member-one",
    options: [
      { value: "member-one", label: "Alex", color: "var(--profile-ocean)" },
      { value: "member-two", label: "Blair", color: "var(--profile-berry)" },
      { value: "family", label: "Family" },
    ],
    onChange() {},
    ...overrides,
  };
}

function keyEvent(key) {
  return {
    key,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

test("selector exposes its value and commits a pointer selection", (t) => {
  const changes = [];
  const { renderer, focusCalls } = create(React.createElement(
    DashboardSelector,
    selectorProps({ onChange: (value) => changes.push(value) }),
  ));
  t.after(() => act(() => renderer.unmount()));

  const trigger = renderer.root.findByProps({ "aria-haspopup": "listbox" });
  assert.equal(trigger.props.id, "person-trigger");
  assert.equal(trigger.props["aria-expanded"], false);
  assert.equal(trigger.props["aria-controls"], "person-listbox");
  assert.equal(trigger.props["aria-labelledby"], "person-label person-value");
  assert.equal(trigger.props.disabled, false);

  act(() => trigger.props.onClick());

  const listbox = renderer.root.findByProps({ role: "listbox" });
  assert.equal(listbox.props.id, "person-listbox");
  assert.equal(listbox.props["aria-label"], "Person");
  assert.equal(listbox.props["aria-activedescendant"], "person-option-member-one");
  assert.equal(focusCalls.at(-1).id, "person-listbox");

  const memberOne = renderer.root.findByProps({ role: "option", "data-value": "member-one" });
  assert.equal(memberOne.props["aria-selected"], true);
  assert.equal(memberOne.props["data-active"], "true");
  assert.equal(
    memberOne.findByProps({ className: "dashboard-selector-mark" }).props.style["--profile-color"],
    "var(--profile-ocean)",
  );
  assert.equal(memberOne.findAllByProps({ className: "dashboard-selector-check" }).length, 1);

  const memberTwo = renderer.root.findByProps({ role: "option", "data-value": "member-two" });
  act(() => memberTwo.props.onClick());

  assert.deepEqual(changes, ["member-two"]);
  assert.equal(
    renderer.root.findByProps({ "aria-haspopup": "listbox" }).props["aria-expanded"],
    false,
  );
  assert.equal(focusCalls.at(-1).id, "person-trigger");
});

test("closed selector keeps one option collection mounted for responsive presentation", (t) => {
  const { renderer } = create(React.createElement(
    DashboardSelector,
    selectorProps(),
  ));
  t.after(() => act(() => renderer.unmount()));

  assert.equal(renderer.root.findAllByProps({ role: "listbox" }).length, 1);
  assert.equal(
    renderer.root.findByProps({ className: "dashboard-selector" }).props["data-open"],
    "false",
  );
});

test("menu presentation keeps the popup trigger and description contract", (t) => {
  const { renderer } = create(React.createElement(
    DashboardSelector,
    selectorProps({
      presentation: "menu",
      descriptionId: "profile-color-help",
    }),
  ));
  t.after(() => act(() => renderer.unmount()));

  const root = renderer.root.findByProps({ className: "dashboard-selector" });
  const trigger = renderer.root.findByProps({ "aria-haspopup": "listbox" });
  const listbox = renderer.root.findByProps({ role: "listbox" });
  assert.equal(root.props["data-presentation"], "menu");
  assert.equal(trigger.props["aria-describedby"], "profile-color-help");
  assert.equal(listbox.props["aria-describedby"], "profile-color-help");
});

test("selector defaults to the existing adaptive presentation", (t) => {
  const { renderer } = create(React.createElement(
    DashboardSelector,
    selectorProps(),
  ));
  t.after(() => act(() => renderer.unmount()));

  assert.equal(
    renderer.root.findByProps({ className: "dashboard-selector" }).props[
      "data-presentation"
    ],
    "adaptive",
  );
});

test("selection from a closed inline listbox keeps focus off the hidden trigger", (t) => {
  const changes = [];
  const { renderer, focusCalls } = create(React.createElement(
    DashboardSelector,
    selectorProps({ onChange: (value) => changes.push(value) }),
  ));
  t.after(() => act(() => renderer.unmount()));

  const options = renderer.root.findAllByProps({ role: "option" });
  assert.equal(options.length, 3);
  const memberTwo = renderer.root.findByProps({ role: "option", "data-value": "member-two" });
  act(() => memberTwo.props.onClick());

  assert.deepEqual(changes, ["member-two"]);
  assert.deepEqual(focusCalls, []);
});

test("selector keyboard navigation moves through literal option boundaries", (t) => {
  const changes = [];
  const { renderer } = create(React.createElement(
    DashboardSelector,
    selectorProps({ onChange: (value) => changes.push(value) }),
  ));
  t.after(() => act(() => renderer.unmount()));

  const openEvent = keyEvent("ArrowDown");
  act(() => {
    renderer.root.findByProps({ "aria-haspopup": "listbox" }).props.onKeyDown(openEvent);
  });
  assert.equal(openEvent.defaultPrevented, true);

  const press = (key) => {
    const event = keyEvent(key);
    act(() => renderer.root.findByProps({ role: "listbox" }).props.onKeyDown(event));
    assert.equal(event.defaultPrevented, true);
  };

  press("ArrowDown");
  assert.equal(
    renderer.root.findByProps({ role: "listbox" }).props["aria-activedescendant"],
    "person-option-member-two",
  );
  press("End");
  assert.equal(
    renderer.root.findByProps({ role: "listbox" }).props["aria-activedescendant"],
    "person-option-family",
  );
  press("Home");
  assert.equal(
    renderer.root.findByProps({ role: "listbox" }).props["aria-activedescendant"],
    "person-option-member-one",
  );
  press("ArrowDown");
  press("Enter");

  assert.deepEqual(changes, ["member-two"]);
  assert.equal(
    renderer.root.findByProps({ className: "dashboard-selector" }).props["data-open"],
    "false",
  );
  assert.equal(renderer.root.findAllByProps({ role: "listbox" }).length, 1);
});

test("Space and ArrowUp open, navigate, and select without native controls", (t) => {
  const changes = [];
  const { renderer } = create(React.createElement(
    DashboardSelector,
    selectorProps({ value: "member-two", onChange: (value) => changes.push(value) }),
  ));
  t.after(() => act(() => renderer.unmount()));

  const arrowUp = keyEvent("ArrowUp");
  act(() => renderer.root.findByProps({ "aria-haspopup": "listbox" }).props.onKeyDown(arrowUp));
  assert.equal(arrowUp.defaultPrevented, true);
  assert.equal(
    renderer.root.findByProps({ role: "listbox" }).props["aria-activedescendant"],
    "person-option-member-two",
  );

  act(() => renderer.root.findByProps({ role: "listbox" }).props.onKeyDown(keyEvent("ArrowUp")));
  assert.equal(
    renderer.root.findByProps({ role: "listbox" }).props["aria-activedescendant"],
    "person-option-member-one",
  );
  const selectWithSpace = keyEvent(" ");
  act(() => renderer.root.findByProps({ role: "listbox" }).props.onKeyDown(selectWithSpace));
  assert.equal(selectWithSpace.defaultPrevented, true);
  assert.deepEqual(changes, ["member-one"]);

  const openWithSpace = keyEvent(" ");
  act(() => renderer.root.findByProps({ "aria-haspopup": "listbox" }).props.onKeyDown(openWithSpace));
  assert.equal(openWithSpace.defaultPrevented, true);
  assert.equal(
    renderer.root.findByProps({ className: "dashboard-selector" }).props["data-open"],
    "true",
  );
});

test("keyboard activation keeps the active option visible in a long list", (t) => {
  const options = Array.from({ length: 12 }, (_, index) => ({
    value: `person-${index + 1}`,
    label: `Person ${index + 1}`,
  }));
  const { renderer, scrollCalls } = create(React.createElement(
    DashboardSelector,
    selectorProps({ value: "person-8", options }),
  ));
  t.after(() => act(() => renderer.unmount()));

  act(() => renderer.root.findByProps({ "aria-haspopup": "listbox" }).props.onClick());
  assert.deepEqual(scrollCalls.at(-1), {
    id: "person-option-person-8",
    options: { block: "nearest" },
  });

  act(() => renderer.root.findByProps({ role: "listbox" }).props.onKeyDown(keyEvent("End")));
  assert.deepEqual(scrollCalls.at(-1), {
    id: "person-option-person-12",
    options: { block: "nearest" },
  });
});

test("Escape cancels the pending option and restores trigger focus", (t) => {
  const changes = [];
  const { renderer, focusCalls } = create(React.createElement(
    DashboardSelector,
    selectorProps({ onChange: (value) => changes.push(value) }),
  ));
  t.after(() => act(() => renderer.unmount()));

  act(() => renderer.root.findByProps({ "aria-haspopup": "listbox" }).props.onClick());
  act(() => renderer.root.findByProps({ role: "listbox" }).props.onKeyDown(keyEvent("ArrowDown")));
  act(() => renderer.root.findByProps({ role: "listbox" }).props.onKeyDown(keyEvent("Escape")));

  assert.deepEqual(changes, []);
  assert.equal(
    renderer.root.findByProps({ className: "dashboard-selector" }).props["data-open"],
    "false",
  );
  assert.equal(focusCalls.at(-1).id, "person-trigger");
});

test("disabled selectors ignore pointer and keyboard opening", (t) => {
  const changes = [];
  const { renderer } = create(React.createElement(
    DashboardSelector,
    selectorProps({ disabled: true, onChange: (value) => changes.push(value) }),
  ));
  t.after(() => act(() => renderer.unmount()));

  const trigger = renderer.root.findByProps({ "aria-haspopup": "listbox" });
  assert.equal(trigger.props.disabled, true);
  act(() => trigger.props.onClick());
  act(() => trigger.props.onKeyDown(keyEvent("Enter")));
  const listbox = renderer.root.findByProps({ role: "listbox" });
  assert.equal(listbox.props["aria-disabled"], true);
  assert.equal(listbox.props.tabIndex, -1);
  act(() => listbox.props.onKeyDown(keyEvent("End")));
  act(() => renderer.root.findByProps({ role: "option", "data-value": "member-two" }).props.onClick());
  assert.deepEqual(changes, []);
  assert.equal(
    renderer.root.findByProps({ className: "dashboard-selector" }).props["data-open"],
    "false",
  );
});

test("becoming disabled closes an open selector", (t) => {
  const { renderer } = create(React.createElement(
    DashboardSelector,
    selectorProps(),
  ));
  t.after(() => act(() => renderer.unmount()));

  act(() => renderer.root.findByProps({ "aria-haspopup": "listbox" }).props.onClick());
  assert.equal(
    renderer.root.findByProps({ className: "dashboard-selector" }).props["data-open"],
    "true",
  );

  act(() => renderer.update(React.createElement(
    DashboardSelector,
    selectorProps({ disabled: true }),
  )));
  assert.equal(renderer.root.findAllByProps({ role: "listbox" }).length, 1);
  assert.equal(
    renderer.root.findByProps({ className: "dashboard-selector" }).props["data-open"],
    "false",
  );
  assert.equal(renderer.root.findByProps({ role: "listbox" }).props["aria-disabled"], true);
  assert.equal(
    renderer.root.findByProps({ "aria-haspopup": "listbox" }).props["aria-expanded"],
    false,
  );
});

test("outside pointer and focus dismiss without changing the selection", (t) => {
  const originalDocument = globalThis.document;
  const documentTarget = new EventTarget();
  globalThis.document = documentTarget;
  const changes = [];
  const { renderer } = create(React.createElement(
    DashboardSelector,
    selectorProps({ onChange: (value) => changes.push(value) }),
  ));
  t.after(() => {
    act(() => renderer.unmount());
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  });

  act(() => renderer.root.findByProps({ "aria-haspopup": "listbox" }).props.onClick());
  act(() => documentTarget.dispatchEvent(new Event("pointerdown")));
  assert.equal(
    renderer.root.findByProps({ className: "dashboard-selector" }).props["data-open"],
    "false",
  );

  act(() => renderer.root.findByProps({ "aria-haspopup": "listbox" }).props.onClick());
  act(() => renderer.root.findByProps({ className: "dashboard-selector" }).props.onBlur({
    currentTarget: { contains: () => false },
    relatedTarget: {},
  }));
  assert.equal(
    renderer.root.findByProps({ className: "dashboard-selector" }).props["data-open"],
    "false",
  );
  assert.deepEqual(changes, []);
});

test("opening the second mounted selector dismisses the first", (t) => {
  const originalDocument = globalThis.document;
  const documentTarget = new EventTarget();
  globalThis.document = documentTarget;
  const { renderer } = create(React.createElement(
    "div",
    null,
    React.createElement(DashboardSelector, selectorProps()),
    React.createElement(DashboardSelector, {
      id: "range",
      label: "Range",
      value: "7d",
      options: [
        { value: "7d", label: "7 days" },
        { value: "30d", label: "30 days" },
      ],
      onChange() {},
    }),
  ));
  t.after(() => {
    act(() => renderer.unmount());
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  });

  const triggers = renderer.root.findAllByProps({ "aria-haspopup": "listbox" });
  act(() => triggers[0].props.onClick());
  assert.equal(renderer.root.findAllByProps({ "data-open": "true" }).length, 1);
  assert.equal(renderer.root.findAllByProps({ role: "listbox" }).length, 2);

  act(() => documentTarget.dispatchEvent(new Event("pointerdown")));
  act(() => triggers[1].props.onClick());
  const openSelectors = renderer.root.findAllByProps({ "data-open": "true" });
  assert.equal(openSelectors.length, 1);
  assert.equal(openSelectors[0].findByProps({ role: "listbox" }).props.id, "range-listbox");
});
