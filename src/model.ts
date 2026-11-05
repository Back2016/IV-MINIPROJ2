export type Phase = "La Niña" | "Neutral" | "El Niño";
export type Metric = "precip" | "temp";
export type RecordRow = {
  id: string;
  state: string;
  region: string;
  winter: number;
  oni: number;
  phase: string;
  band: number;
  precip: number | null;
  temp: number | null;
  precipInches: number | null;
  tempC: number | null;
};
export type Filters = {
  start: number;
  end: number;
  region: string;
  phase: string;
  state: string;
};
export type Selection =
  | null
  | { kind: "state"; state: string }
  | { kind: "group"; phase: string; band: number }
  | { kind: "brush"; x0: number; x1: number; y0: number; y1: number }
  | { kind: "record"; id: string }
  | { kind: "records"; ids: string[] };
export const defaults: Filters = {
  start: 1982,
  end: 2025,
  region: "All",
  phase: "All",
  state: "All",
};
export const phases: Phase[] = ["La Niña", "Neutral", "El Niño"];
export const bands = ["<0.5", "0.5–<1.0", "1.0–<1.5", "≥1.5"];
export function filterRecords(rows: RecordRow[], f: Filters, metric: Metric) {
  return rows.filter(
    (r) =>
      r.winter >= f.start &&
      r.winter <= f.end &&
      (f.region === "All" || r.region === f.region) &&
      (f.phase === "All" || r.phase === f.phase) &&
      (f.state === "All" || r.state === f.state) &&
      r[metric] !== null &&
      Number.isFinite(r[metric]),
  );
}
export function selectRecords(rows: RecordRow[], s: Selection, metric: Metric) {
  if (!s) return rows;
  if (s.kind === "records") {
    const ids = new Set(s.ids);
    return rows.filter((r) => ids.has(r.id));
  }
  return rows.filter((r) => {
    if (s.kind === "state") return r.state === s.state;
    if (s.kind === "group") return r.phase === s.phase && r.band === s.band;
    if (s.kind === "record") return r.id === s.id;
    const value = r[metric];
    return (
      value !== null &&
      r.oni >= s.x0 &&
      r.oni <= s.x1 &&
      value >= s.y0 &&
      value <= s.y1
    );
  });
}
export function summary(rows: RecordRow[], metric: Metric) {
  const values = rows
    .map((r) => r[metric])
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const n = values.length;
  if (!n) return { n: 0, winters: 0, mean: null, q1: null, q3: null };
  const quantile = (p: number) => {
    const i = (n - 1) * p,
      lo = Math.floor(i);
    return values[lo] + (values[Math.ceil(i)] - values[lo]) * (i - lo);
  };
  return {
    n,
    winters: new Set(rows.map((r) => r.winter)).size,
    mean: values.reduce((a, b) => a + b, 0) / n,
    q1: quantile(0.25),
    q3: quantile(0.75),
  };
}
export function domain(rows: RecordRow[], metric: Metric): [number, number] {
  const step = metric === "precip" ? 20 : 1;
  const bound = Math.max(
    step,
    Math.ceil(Math.max(...rows.map((r) => Math.abs(r[metric] ?? 0))) / step) *
      step,
  );
  return [-bound, bound];
}
