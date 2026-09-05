import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Fail closed: the fixture is never allowed to contact an API or external host.
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:5189" && !url.pathname.startsWith("/api/")) {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
      throw new Error("The synthetic dashboard attempted a non-fixture request");
    }
  });
});

async function expectSharedDate(page, expected) {
  await expect(page.getByRole("slider")).toHaveCount(4);
  const dates = await page.getByRole("slider").evaluateAll(elements =>
    elements.map(element => element.getAttribute("aria-valuetext").split(",")[0])
  );
  expect(dates).toHaveLength(4);
  expect(new Set(dates).size).toBe(1);
  if (expected) expect(dates[0]).toBe(expected);
}

async function selectOption(page, group, value) {
  const trigger = page.locator(`#${group}-trigger`);
  if (await trigger.isVisible()) await trigger.click();
  await page.locator(`#${group}-option-${value}`).click();
}

for (const view of ["alex", "family"]) {
  test(`${view}: pointer selection stays quiet and keyboard selection stays visible`, async ({ page, hasTouch }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/?view=${view}`);
    const sliders = page.getByRole("slider");
    await expect(sliders).toHaveCount(4);
    for (let index = 0; index < 4; index++) {
      const slider = sliders.nth(index);
      if (hasTouch) await slider.tap();
      else await slider.click();
      await expect(slider).toBeFocused();
      await expect(slider).toHaveCSS("outline-style", "none");
      // A centered click/tap must move off the initial latest date, not merely
      // leave four equally stale readouts synchronized.
      await expectSharedDate(page, "Jun 4");
      await slider.press("Home");
      await expect(slider).toHaveCSS("outline-style", "solid");
      await expectSharedDate(page, "Mar 4");
      await slider.press("End");
      await expectSharedDate(page, "Sep 4");
    }
    await sliders.first().press("Home");
    await sliders.first().press("Tab");
    await expect(sliders.nth(1)).toBeFocused();
    await expect(sliders.nth(1)).toHaveCSS("outline-style", "solid");
    expect(errors).toEqual([]);
  });

  test(`${view}: changing range and person resets the synchronized date`, async ({ page }) => {
    await page.goto(`/?view=${view}`);
    await page.getByRole("slider").first().press("Home");
    await expectSharedDate(page, "Mar 4");
    await selectOption(page, "range", "7d");
    await expectSharedDate(page, "Sep 4");
    await page.getByRole("slider").first().press("Home");
    await expectSharedDate(page, "Aug 29");
    await selectOption(page, "person", view === "family" ? "alex" : "family");
    await expectSharedDate(page, "Sep 4");
  });

  test(`${view}: axes align with their plots without narrow-screen overflow`, async ({ page }, testInfo) => {
    await page.goto(`/?view=${view}`);
    await expect(page.getByRole("slider")).toHaveCount(4);
    const geometry = await page.evaluate(() => {
      const charts = [...document.querySelectorAll('[role="slider"]')];
      return {
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
        axes: charts.map(chart => {
          const axis = chart.previousElementSibling;
          const guides = [...chart.querySelectorAll("line")].map(line => line.getBoundingClientRect().y);
          return [...axis.querySelectorAll("span")].map(label => {
            const box = label.getBoundingClientRect();
            return {
              gridOffset: Math.min(...guides.map(y => Math.abs(y - (box.y + box.height / 2)))),
              size: parseFloat(getComputedStyle(label).fontSize),
              lines: box.height / parseFloat(getComputedStyle(label).lineHeight),
            };
          });
        }),
        dates: [...document.querySelectorAll(".score-trend-date-axis, .chart-date-axis")]
          .map(axis => ({ count: axis.children.length, size: parseFloat(getComputedStyle(axis).fontSize) })),
      };
    });
    expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
    for (const labels of geometry.axes) {
      expect(labels.length).toBeGreaterThanOrEqual(2);
      for (const label of labels) {
        expect(label.gridOffset).toBeLessThan(1);
        expect(label.size).toBeGreaterThanOrEqual(12);
        expect(label.lines).toBeLessThan(1.1);
      }
    }
    for (const axis of geometry.dates) {
      expect(axis.count).toBe(3);
      expect(axis.size).toBeGreaterThanOrEqual(12);
    }
    const panel = page.locator(view === "family" ? ".family-score-panel" : ".score-trend-panel").first();
    for (const [name, region] of [["score-panel", panel], ["metric-panel", page.locator(".metric-explorer")]]) {
      const path = testInfo.outputPath(`${name}.png`);
      await region.screenshot({ path, animations: "disabled" });
      await testInfo.attach(name, { path, contentType: "image/png" });
    }
  });

  test(`${view}: empty, loading, and missing dates stay honest`, async ({ page }) => {
    for (const scenario of ["empty", "loading"]) {
      await page.goto(`/?view=${view}&scenario=${scenario}&range=7d`);
      const sliders = page.getByRole("slider");
      await expect(sliders).toHaveCount(4);
      for (const slider of await sliders.all()) {
        await expect(slider).toHaveAttribute("aria-disabled", "true");
        await expect(slider).toHaveAttribute("tabindex", "-1");
      }
      const message = page.locator(".metric-chart-plot .chart-message");
      await expect(message).toHaveText(scenario === "loading"
        ? "Loading this trend…" : "No measurements are available for this range.");
      const box = await message.boundingBox();
      const plot = await page.locator(".metric-chart-plot").boundingBox();
      expect(Math.abs(box.x + box.width / 2 - plot.x - plot.width / 2)).toBeLessThan(1);
      expect(Math.abs(box.y + box.height / 2 - plot.y - plot.height / 2)).toBeLessThan(1);
    }
    await page.goto(`/?view=${view}&scenario=gaps&range=7d`);
    const first = page.getByRole("slider").first();
    await first.press("Home");
    for (let index = 0; index < 3; index++) await first.press("ArrowRight");
    await expectSharedDate(page, "Sep 1");
    await expect(page.locator(".score-trend-marker, .chart-selection-marker")).toHaveCount(0);
    const pathCommands = await page.locator(".score-trend-series, .family-chart-series, .metric-chart-series")
      .evaluateAll(paths => paths.map(path => path.getAttribute("d").match(/M/g)?.length));
    expect(pathCommands.every(count => count === 2)).toBe(true);
  });
}

test("family: a loading member does not disable the loaded member", async ({ page }) => {
  await page.goto("/?view=family&scenario=partial&range=7d");
  const sliders = page.getByRole("slider");
  await expect(sliders).toHaveCount(4);
  for (const slider of await sliders.all()) {
    await expect(slider).toHaveAttribute("aria-disabled", "false");
    await expect(slider).toHaveAttribute("aria-valuetext", /Blair.*loading/);
  }
  await sliders.first().press("Home");
  await expectSharedDate(page, "Aug 29");
  await expect(page.locator('.chart-selection-marker[data-profile-id="fictional-1"]')).toHaveCount(0);
});
