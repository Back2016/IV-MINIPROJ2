import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  defaults,
  domain,
  filterRecords,
  selectRecords,
  summary,
  type RecordRow,
} from "../src/model";
const data = JSON.parse(
  readFileSync(new URL("../src/data.json", import.meta.url), "utf8"),
);
const rows: RecordRow[] = data.records;
test("observed dataset: unique 48 × 44 keys and complete winter baselines", () => {
  assert.equal(rows.length, 2112);
  assert.equal(new Set(rows.map((r) => r.id)).size, 2112);
  for (const state of data.states)
    for (const metric of ["precip", "temp"] as const) {
      const baseline = rows.filter(
        (r) => r.state === state.code && r.winter >= 1991 && r.winter <= 2020,
      );
      assert.equal(baseline.length, 30);
      assert.ok(Math.abs(summary(baseline, metric).mean!) < 0.00001);
    }
});
test("state, group and numeric selections yield the independently expected IDs", () => {
  assert.equal(
    selectRecords(rows, { kind: "state", state: "CA" }, "precip").length,
    44,
  );
  const filtered = filterRecords(
    rows,
    { ...defaults, start: 1998, end: 1998, region: "West" },
    "precip",
  );
  assert.equal(filtered.length, 11);
  assert.deepEqual(
    selectRecords(
      filtered,
      { kind: "group", phase: "El Niño", band: 3 },
      "precip",
    ),
    filtered,
  );
  const chosen = selectRecords(
    rows,
    { kind: "brush", x0: 1, x1: 2.5, y0: 0, y1: 70 },
    "precip",
  );
  assert.deepEqual(
    chosen.map((r) => r.id),
    rows
      .filter(
        (r) => r.oni >= 1 && r.oni <= 2.5 && r.precip! >= 0 && r.precip! <= 70,
      )
      .map((r) => r.id),
  );
});
test("missing metric exclusion is independent; empty results do not report zero means", () => {
  const copy = { ...rows[0], precip: null, temp: 2 };
  assert.equal(filterRecords([copy], defaults, "precip").length, 0);
  assert.equal(filterRecords([copy], defaults, "temp").length, 1);
  assert.equal(summary([], "precip").mean, null);
  assert.equal(
    selectRecords(
      rows,
      { kind: "brush", x0: 9, x1: 10, y0: 0, y1: 10 },
      "precip",
    ).length,
    0,
  );
});

test("multi-record selection deduplicates IDs and respects available filters", () => {
  const ca = rows.find((r) => r.state === "CA" && r.winter === 1998)!;
  const ny = rows.find((r) => r.state === "NY" && r.winter === 1997)!;
  const selection = {
    kind: "records" as const,
    ids: [ca.id, ny.id, ca.id, "unknown"],
  };
  assert.equal(selectRecords(rows, selection, "precip").length, 2);
  const filtered = filterRecords(rows, { ...defaults, state: "CA" }, "precip");
  assert.deepEqual(selectRecords(filtered, selection, "precip"), [ca]);
  assert.deepEqual(
    selectRecords(rows, { kind: "records", ids: [] }, "temp"),
    [],
  );
});
test("IQR is interpolated spread and winter counts avoid pseudoreplication", () => {
  const sample = [0, 10, 20, 30].map((v) => ({ ...rows[0], precip: v }));
  assert.deepEqual(summary(sample, "precip"), {
    n: 4,
    winters: 1,
    mean: 15,
    q1: 7.5,
    q3: 22.5,
  });
});
test("fixed metric domains include every observed anomaly", () => {
  for (const metric of ["precip", "temp"] as const) {
    const [lo, hi] = domain(rows, metric);
    assert.ok(
      rows.every(
        (r) => r[metric] !== null && r[metric]! >= lo && r[metric]! <= hi,
      ),
    );
  }
  assert.notDeepEqual(domain(rows, "precip"), domain(rows, "temp"));
});
