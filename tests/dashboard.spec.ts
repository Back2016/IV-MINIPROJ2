import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
const rows = JSON.parse(readFileSync("src/data.json", "utf8")).records;
test("state colors use fixed mean-scale limits and mark uncapped extremes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#map svg")).toHaveAttribute(
    "data-color-limit",
    "20",
  );
  const ticks = await page.locator("#scatter .tick text").allTextContents();
  const californiaFill = await page
    .locator("#tile-CA rect")
    .getAttribute("fill");
  expect(californiaFill).not.toBe("rgb(247, 247, 247)");
  expect(californiaFill).not.toBe(
    await page.locator("#tile-CO rect").getAttribute("fill"),
  );
  await page.locator("#start").fill("1998");
  await page.locator("#start").blur();
  await page.locator("#end").fill("1998");
  await page.locator("#end").blur();
  await expect(page.locator("#map svg")).toHaveAttribute(
    "data-color-limit",
    "20",
  );
  await expect(page.locator("#tile-CA")).toHaveAttribute(
    "data-color-capped",
    "true",
  );
  await expect(page.locator("#tile-CA")).toContainText("+79*");
  await expect(page.locator("#tile-CA")).toHaveAttribute(
    "aria-label",
    /mean \+78\.7 %.*color capped at 20/,
  );
  expect(await page.locator("#tile-CA rect").getAttribute("fill")).toBe(
    "rgb(33, 102, 172)",
  );
  expect(await page.locator("#scatter .tick text").allTextContents()).toEqual(
    ticks,
  );
  await page.screenshot({
    path: "docs/screenshots/06-map-capped-colors.png",
    fullPage: true,
  });
  await page.locator("#metric").selectOption("temp");
  await expect(page.locator("#map svg")).toHaveAttribute(
    "data-color-limit",
    "2",
  );
  await expect(page.locator("#color-key")).toContainText("≤ -2°C");
  await page.locator("#reset").click();
  await expect(page.locator("#map svg")).toHaveAttribute(
    "data-color-limit",
    "20",
  );
});
mkdirSync("docs/screenshots", { recursive: true });
test("map explanation follows filters, individual records, metric and empty selection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#map-coverage")).toContainText(
    "44 distinct winters · 1982–2025 · 48 states · 44 winter(s) per shown state",
  );
  await expect(page.locator("#map-baseline")).toContainText(
    "−4% means 4% drier",
  );
  await page.locator("#phase").selectOption("El Niño");
  await expect(page.locator("#map-phases")).toHaveText(
    "Included phases: El Niño.",
  );
  await expect(page.locator("#map-coverage")).toContainText(
    "Some years in this span are not selected.",
  );
  await page.locator("#metric").selectOption("temp");
  await expect(page.locator("#map-explanation")).toContainText(
    "temperature anomaly",
  );
  await expect(page.locator("#map-baseline")).toContainText(
    "−1°C means 1°C cooler",
  );
  await page.locator("#region").selectOption("West");
  await page.locator("#state").selectOption("NY");
  await expect(page.locator("#map-coverage")).toContainText(
    "No selected records",
  );
  await expect(page.locator("#map-phases")).toHaveText(
    "Included phases: none.",
  );
});

test("record search, paging and draft multi-selection propagate to all views", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#record-search").fill("california 1998");
  await expect(page.locator("#record-results")).toContainText("1 matches");
  await page
    .getByRole("checkbox", {
      name: "Check California winter 1998",
      exact: true,
    })
    .focus();
  await page.keyboard.press("Space");
  await checkLinked(page, 2112); // Drafting must not change any chart.
  await page.locator("#record-search").fill("new york 1997");
  await page
    .getByRole("checkbox", { name: "Check New York winter 1997", exact: true })
    .check();
  await page.locator("#apply-records").click();
  await checkLinked(page, 2);
  await expect(page.locator("#map-coverage")).toContainText(
    "2 distinct winters · 1997–1998 · 2 states · 1 winter(s) per shown state",
  );
  await page.locator("#record-search").fill("");
  await page.locator("#record-scope").selectOption("selected");
  await expect(page.locator("#record-table input")).toHaveCount(2);
  await page.screenshot({
    path: "docs/screenshots/07-record-selection.png",
    fullPage: true,
  });
  await page.locator("#record-scope").selectOption("available");
  await page.locator("#uncheck-records").click();
  await page.locator("#record-search").fill("1998");
  await expect(page.locator("#record-results")).toContainText(
    "48 matches · 1–25 shown · page 1 of 2",
  );
  await page.locator("#record-next").click();
  await expect(page.locator("#record-results")).toContainText("26–48 shown");
  await page.locator("#check-matches").click(); // Includes matches outside this page.
  await expect(page.locator("#record-draft")).toContainText("48 checked");
  await page.locator("#apply-records").click();
  await checkLinked(page, 48);
  await page.locator("#record-search").fill("not-a-state");
  await expect(page.locator("#record-table")).toContainText("No matches");
  await expect(page.locator("#check-matches")).toBeDisabled();
  await checkLinked(page, 48);
  await page.locator("#reset").click();
  await expect(page.locator("#record-search")).toHaveValue("");
  await expect(page.locator("#apply-records")).toBeDisabled();
  await page.locator("#record-sort").selectOption("extreme");
  const largest = [...rows].sort(
    (a: any, b: any) => Math.abs(b.precip) - Math.abs(a.precip),
  )[0];
  await expect(page.locator("#record-table button").first()).toHaveAttribute(
    "data-id",
    largest.id,
  );
  await page.locator("#record-search").fill("west el nino");
  await expect(page.locator("#record-results")).toContainText(
    `${rows.filter((r: any) => r.region === "West" && r.phase === "El Niño").length} matches`,
  );
  await page.locator("#record-search").fill("West Virginia 1998");
  await expect(page.locator("#record-results")).toContainText("1 matches");
  await expect(page.locator("#record-table button")).toHaveAttribute(
    "data-id",
    "WV_1998",
  );
  await page.locator("#check-matches").click();
  await page.locator("#state").selectOption("CA");
  await expect(page.locator("#apply-records")).toBeDisabled();
  await checkLinked(page, 44);
  await page.locator("#record-search").fill("1998");
  await page.locator("#record-table button").click();
  await checkLinked(page, 1);
  await expect(page.locator("#map-coverage")).toContainText(
    "1 distinct winter · 1998 · 1 state",
  );
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
async function checkLinked(page: Page, count: number) {
  await expect(page.locator("main")).toHaveAttribute(
    "data-count",
    String(count),
  );
  await expect(page.locator('#scatter [data-selected="true"]')).toHaveCount(
    count,
  );
  for (const selector of ["#map [data-count]", "#comparison [data-count]"]) {
    const sum = await page
      .locator(selector)
      .evaluateAll((nodes) =>
        nodes.reduce((n, e) => n + Number(e.getAttribute("data-count")), 0),
      );
    expect(sum).toBe(count);
  }
}

test("peer regression: state context survives numeric selection, repeated dragging and group selection", async ({ page }) => {
  await page.goto("/");
  await page.locator("#tile-CA").click();
  await expect(page.locator("#state")).toHaveValue("CA");
  await page.locator("#metric").selectOption("temp");
  await page.getByRole("button", { name: "Set exact bounds" }).click();
  await expect(page.locator("#x0")).toBeVisible();
  for (const [id, value] of Object.entries({x0: "0", x1: "3", y0: "0", y1: "6"}))
    await page.locator(`#${id}`).fill(value);
  await page.locator("#brush-form button").click();
  const expected = rows.filter((r: any) => r.state === "CA" && r.oni >= 0 && r.oni <= 3 && r.temp >= 0 && r.temp <= 6);
  await checkLinked(page, expected.length);
  expect((await page.locator('#scatter [data-selected="true"]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-record')))).sort()).toEqual(expected.map((r:any) => r.id).sort());
  await expect(page.locator("#x0")).toHaveValue("0");
  await expect(page.locator("#y1")).toHaveValue("6");
  await expect(page.locator("#state-context")).toContainText("California");
  await page.screenshot({path: "docs/screenshots/round1-exact-state.png", fullPage:true});
  // Clear removes only the range, not the state filter or active metric.
  await page.locator("#clear").click();
  await checkLinked(page, 44);
  await expect(page.locator("#metric")).toHaveValue("temp");
  await page.locator("#scatter").scrollIntoViewIfNeeded();
  const b = (await page.locator("#scatter .overlay").boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.05);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.99, b.y + b.height * 0.49, {steps: 6});
  await page.mouse.up();
  const firstCount = Number(await page.locator("main").getAttribute("data-count"));
  expect(firstCount).toBeGreaterThan(0);
  expect(firstCount).toBeLessThanOrEqual(44);
  const rect = (await page.locator("#scatter .selection").boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 - 12, rect.y + rect.height / 2 + 5, {steps: 5});
  await page.mouse.up();
  const bounds = await Promise.all(["x0","x1","y0","y1"].map(id => page.locator(`#${id}`).inputValue().then(Number)));
  const dragged = rows.filter((r:any) => r.state === "CA" && r.oni >= bounds[0] && r.oni <= bounds[1] && r.temp >= bounds[2] && r.temp <= bounds[3]);
  await checkLinked(page, dragged.length);
  expect((await page.locator('#scatter [data-selected="true"]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-record')))).sort()).toEqual(dragged.map((r:any) => r.id).sort());
  await page.locator("#group-3-2").click();
  await checkLinked(page, 6);
  await page.locator("#tile-NY").click();
  await expect(page.locator("#state")).toHaveValue("NY");
  await checkLinked(page, 44);
  await page.locator("#all-states").click();
  await checkLinked(page, 2112);
  await expect(page.locator("#metric")).toHaveValue("temp");
  await page.locator("#reset").click();
  await expect(page.locator("#metric")).toHaveValue("precip");
  await expect(page.locator("#active-metric")).toHaveText("Viewing: Precipitation anomaly (%)");
});

test("peer regression: visible cohort means and metric labels follow group, state and empty ranges", async ({ page }) => {
  await page.goto("/");
  for (const metric of ["precip", "temp"] as const) {
    await page.locator("#metric").selectOption(metric);
    const label = metric === "temp" ? "Temperature" : "Precipitation";
    const unit = metric === "temp" ? "°C" : "%";
    await expect(page.locator("#active-metric")).toContainText(`${label} anomaly (${unit})`);
    await expect(page.locator("#comparison-title")).toContainText(`${label} anomaly`);
    await expect(page.locator("#map-title")).toContainText(label.toLowerCase());
    for (const band of [3,2]) {
      await page.locator(`#group-${band}-2`).click();
      const group = rows.filter((r:any) => r.phase === "El Niño" && r.band === band);
      const mean = group.reduce((s:number,r:any) => s + r[metric], 0) / group.length;
      const value = (mean >= 0 ? "+" : "−") + Math.abs(mean).toFixed(1);
      await expect(page.locator("#map-mean")).toContainText(`${value} ${unit}`);
      await expect(page.locator("#comparison-mean")).toContainText(`${value} ${unit}`);
      await checkLinked(page, group.length);
    }
  }
  await page.locator("#tile-CA").click();
  await expect(page.locator("#mean-scope")).toContainText("1 state · 44 records");
  await page.getByRole("button", { name: "Set exact bounds" }).click();
  await page.locator("#x0").fill("9");
  await page.locator("#x1").fill("10");
  await page.locator("#brush-form button").click();
  await expect(page.locator("#map-mean")).toContainText("— °C");
  await checkLinked(page, 0);
  await page.locator("#reset").click();
  await page.locator("#metric").selectOption("temp");
  await page.locator("#group-3-2").click();
  await page.screenshot({path: "docs/screenshots/round1-group-mean.png", fullPage:true});
});
test("all three views drive linked selection; keyboard, clear, filters and reset", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await checkLinked(page, 2112);
  await page.screenshot({
    path: "docs/screenshots/01-overview.png",
    fullPage: true,
  });
  await page.locator("#tile-CA").click();
  await checkLinked(page, 44);
  await page.locator("#tile-NY").focus();
  await page.keyboard.press("Enter");
  await checkLinked(page, 44);
  await expect(page.locator("#state-context")).toContainText("New York");
  await expect(page.locator("#tile-NY")).toBeFocused();
  await page.locator("#all-states").click();
  await page.locator("#group-3-2").click();
  await checkLinked(
    page,
    rows.filter((r: any) => r.band === 3 && r.phase === "El Niño").length,
  );
  await page.screenshot({
    path: "docs/screenshots/02-group-selection.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Set exact bounds" }).click();
  await page.getByRole("button", { name: "Select range", exact: true }).click();
  await checkLinked(
    page,
    rows.filter(
      (r: any) => r.oni >= 1 && r.oni <= 2.5 && r.precip >= 0 && r.precip <= 70,
    ).length,
  );
  await page.screenshot({
    path: "docs/screenshots/03-brush-selection.png",
    fullPage: true,
  });
  await page.locator("#state").selectOption("CA");
  await checkLinked(page, 44);
  await expect(page.locator("#selection-label")).toContainText("All filtered");
  await page.locator("#metric").selectOption("temp");
  await checkLinked(page, 44);
  await expect(page.locator("#scatter")).toContainText(
    "Temperature anomaly (°C)",
  );
  await page.locator("#tile-CA").click();
  await page.locator("#clear").click();
  await checkLinked(page, 44);
  await page.locator("#reset").click();
  await checkLinked(page, 2112);
  expect(errors).toEqual([]);
});
test("mouse brushing, empty cohort and fixed axes", async ({ page }) => {
  await page.goto("/");
  const bounds = await page.locator("#scatter .overlay").boundingBox();
  expect(bounds).toBeTruthy();
  const b = bounds!;
  await page.mouse.move(b.x + b.width * 0.55, b.y + b.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.5, {
    steps: 6,
  });
  await page.mouse.up();
  const n = Number(await page.locator("main").getAttribute("data-count"));
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(2112);
  await checkLinked(page, n);
  const ticks = await page.locator("#scatter .tick text").allTextContents();
  await page.getByRole("button", { name: "Set exact bounds" }).click();
  await page.locator("#x0").fill("9");
  await page.locator("#x1").fill("10");
  await page.getByRole("button", { name: "Select range", exact: true }).click();
  await checkLinked(page, 0);
  await expect(page.locator("#empty")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(await page.locator("#scatter .tick text").allTextContents()).toEqual(
    ticks,
  );
  await page.locator("#clear").click();
  await checkLinked(page, 2112);
  await page.locator("#region").selectOption("West");
  await page.locator("#state").selectOption("NY");
  await checkLinked(page, 0);
  await expect(page.locator("#empty")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/04-empty-state.png",
    fullPage: true,
  });
});
test("color-vision snapshots and responsive layout", async ({ page }) => {
  await page.goto("/");
  await page.locator("#metric").selectOption("temp");
  const client = await page.context().newCDPSession(page);
  for (const type of [
    "achromatopsia",
    "protanopia",
    "deuteranopia",
    "tritanopia",
  ] as const) {
    await client.send("Emulation.setEmulatedVisionDeficiency", { type });
    await page.screenshot({
      path: `docs/screenshots/vision-${type}.png`,
      fullPage: true,
    });
  }
  await client.send("Emulation.setEmulatedVisionDeficiency", { type: "none" });
  await page.locator("#phase").selectOption("El Niño");
  await page.setViewportSize({ width: 800, height: 1000 });
  await expect(page.locator("#map svg")).toBeVisible();
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/05-narrow-layout.png",
    fullPage: true,
  });
});


test("pop-outs keep supporting information off the dashboard and restore keyboard focus", async ({ page }) => {
  await page.goto("/");
  for (const [button, title] of [
    ["Map details", "Read the state map"],
    ["Plot guide", "Read the scatterplot"],
    ["Chart details", "Read the ENSO comparison"],
    ["Set exact bounds", "Set exact bounds"],
    ["Data & methods", "Data, methods & interpretation"],
  ]) {
    const trigger = page.getByRole("button", { name: button, exact: true });
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog).toBeHidden();
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  await page.getByRole("button", { name: "Set exact bounds" }).click();
  await page.locator("#x0").fill("3");
  await page.getByRole("button", { name: "Select range" }).click();
  await expect(page.locator("#bounds-error")).toBeVisible();
  await checkLinked(page, 2112);
  await page.locator("#brush-details").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#brush-details")).toBeHidden();
  await expect(page.locator("#scatter .axis-title").first()).toHaveCSS("font-size", "16px");
  await expect(page.locator("#comparison .chart-axis .tick text").first()).toHaveCSS("font-size", "14px");
});


test("desktop layout fits the window and geographic mode shares linked state summaries", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 660 });
  await page.goto("/");
  await expect(page.locator(".badge")).toHaveText("v0.1.5");
  const geometry = await page.evaluate(() => {
    const rect = (id: string) => document.querySelector(id)!.getBoundingClientRect().toJSON();
    return {
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      map: rect(".map-panel"),
      table: rect(".records-panel"),
      scroll: rect("#record-scroll"),
      scatter: rect(".scatter-panel"),
      comparison: rect(".comparison-panel"),
    };
  });
  expect(geometry.scrollHeight).toBeLessThanOrEqual(660);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(1000);
  expect(geometry.table.y).toBeGreaterThan(geometry.map.bottom);
  expect(geometry.table.x).toBe(geometry.map.x);
  expect(geometry.scroll.height).toBeGreaterThan(60);
  expect(geometry.scatter.y).toBe(geometry.map.y);
  expect(geometry.comparison.bottom).toBeLessThanOrEqual(660);
  await expect(page.locator("#record-search")).toBeVisible();
  await page.locator("#record-search").fill("California 1998");
  await expect(page.locator("#record-results")).toContainText("1 matches");
  await page.locator("#record-table button").click();
  await checkLinked(page, 1);
  const fill = await page.locator("#tile-CA rect").getAttribute("fill");
  await page.getByLabel("Map style").selectOption("geographic");
  await expect(page.locator('#map svg[data-map-style="geographic"] path.state-shape')).toHaveCount(48);
  await expect(page.locator("#tile-CA path")).toHaveAttribute("fill", fill!);
  await expect(page.locator("#tile-CA path")).toHaveAttribute("d", /^M/);
  await checkLinked(page, 1);
  await page.locator("#tile-CA").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#state")).toHaveValue("CA");
  await checkLinked(page, 44);
  await page.getByLabel("Map style").selectOption("tiles");
  await expect(page.locator('#map svg[data-map-style="tiles"] rect.state-shape')).toHaveCount(48);
  await checkLinked(page, 44);
  await page.locator("#reset").click();
  await page.getByLabel("Map style").selectOption("geographic");
  await page.screenshot({ path: "docs/screenshots/desktop-geographic.png" });
});
