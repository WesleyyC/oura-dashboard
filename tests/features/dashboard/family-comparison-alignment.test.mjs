import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function declarationBody(source, selector) {
  const match = source.match(
    new RegExp(`(?:^|\\n)${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, "s"),
  );
  assert.ok(match, `Missing CSS rule: ${selector}`);
  return match[1];
}

function declarationBodies(source, selector) {
  const matches = [
    ...source.matchAll(
      new RegExp(`(?:^|\\n)${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, "gs"),
    ),
  ];
  assert.notEqual(matches.length, 0, `Missing CSS rule: ${selector}`);
  return matches.map((match) => match[1]);
}

test("Family comparison scopes its desktop first-column alignment without changing mobile labels", async () => {
  const styles = await readFile(
    new URL("../../../app/globals.css", import.meta.url),
    "utf8",
  );

  const heading = declarationBody(
    styles,
    ".family-comparison-table thead th:first-child",
  );
  assert.match(heading, /padding-inline:\s*16px/i);
  assert.match(heading, /text-align:\s*center/i);

  const metricLabels = declarationBody(
    styles,
    ".family-comparison-table tbody tr:not(.family-metric-group-row) > th,\n.family-comparison-table .family-metric-button",
  );
  assert.match(metricLabels, /text-align:\s*right/i);

  const categoryBand = declarationBody(
    styles,
    ".family-comparison-table .family-metric-group-row > *",
  );
  assert.match(categoryBand, /background:\s*var\(--surface-soft\)/i);

  const categoryLabel = declarationBody(
    styles,
    ".family-comparison-table .family-metric-group-row > th",
  );
  assert.match(categoryLabel, /position:\s*static/i);
  assert.match(categoryLabel, /padding-inline:\s*16px/i);
  assert.match(categoryLabel, /text-align:\s*center/i);

  const categoryContinuation = declarationBody(
    styles,
    ".family-comparison-table .family-metric-group-row > td",
  );
  assert.match(categoryContinuation, /padding-inline:\s*0/i);

  const overflowFirstColumn = declarationBody(
    styles,
    ".family-comparison-desktop[data-overflow=\"true\"] .family-comparison-table thead th:first-child,\n.family-comparison-desktop[data-overflow=\"true\"] .family-comparison-table tbody tr:not(.family-metric-group-row) > th,\n.family-comparison-desktop[data-overflow=\"true\"] .family-comparison-table .family-metric-group-row > th",
  );
  assert.match(overflowFirstColumn, /position:\s*sticky/i);
  assert.match(overflowFirstColumn, /left:\s*0/i);

  const overflowCategoryLabels = declarationBodies(
    styles,
    ".family-comparison-desktop[data-overflow=\"true\"] .family-comparison-table .family-metric-group-row > th",
  );
  assert.equal(
    overflowCategoryLabels.some((body) => (
      /background:\s*var\(--surface-soft\)/i.test(body)
    )),
    true,
  );

  const mobileMetricLabels = declarationBody(styles, ".family-metric-button");
  assert.match(mobileMetricLabels, /text-align:\s*left/i);
});
