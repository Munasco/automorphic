import { expect, it } from "vite-plus/test";
import { chartAlertLogCsv, type ChartAlertLogEntry } from "./chartAlertLogCsv";
const price: ChartAlertLogEntry = {
  kind: "price",
  id: "price-event",
  alertId: "price-alert",
  symbol: "NQ",
  name: "Breakout",
  message: "Wait for retest",
  condition: "crossing",
  target: 21000.25,
  price: 21000.5,
  triggeredAt: 1000,
  quoteAt: 900,
};
const drawing: ChartAlertLogEntry = {
  kind: "drawing",
  id: "drawing-event",
  alertId: "drawing-alert",
  drawingId: "line",
  symbol: "MGC",
  intervalKey: "minute:5",
  condition: "crossing",
  targetKind: "price",
  target: 3500.125,
  price: 3500.25,
  triggeredAt: 2000,
  sampleAt: 1900,
  barId: "bar",
  channelBoundary: "upper",
};
it("exports mixed event types in the supplied filtered order without changing history", () => {
  const input = [drawing, price];
  const original = structuredClone(input);
  const csv = chartAlertLogCsv(input);
  expect(csv.startsWith('\uFEFF"Triggered at (UTC)"')).toBe(true);
  expect(csv).toContain(
    '"1970-01-01T00:00:02.000Z","Drawing","MGC","","","crossing","Upper channel 3,500.125",3500.125,3500.25,"minute:5","drawing-alert","drawing-event"\r\n',
  );
  expect(csv.indexOf('"drawing-event"')).toBeLessThan(csv.indexOf('"price-event"'));
  expect(csv).toContain('"21000.25",21000.25,21000.5,"","price-alert","price-event"');
  expect(chartAlertLogCsv([price])).not.toContain("drawing-event");
  expect(input).toEqual(original);
  expect(chartAlertLogCsv([]).split("\r\n")).toHaveLength(2);
});
it("preserves multiline quoted text and protects formula-like text without converting negative prices", () => {
  const csv = chartAlertLogCsv([
    { ...price, name: "=SUM(1,2)", message: 'line 1,"quoted"\r\nline 2', target: -2, price: -1.25 },
  ]);
  expect(csv).toContain('"\'=SUM(1,2)"');
  expect(csv).toContain('"line 1,""quoted""\r\nline 2"');
  expect(csv).toContain(',"\'-2",-2,-1.25,');
  for (const name of ["+1", "-1", "@SUM(A1)", " \t=1"])
    expect(chartAlertLogCsv([{ ...price, name }])).toContain(`"'${name}"`);
});
it("keeps vertical chart-time targets out of numeric price columns", () => {
  const { target: _target, targetKind: _kind, ...base } = drawing;
  const tick: ChartAlertLogEntry = {
    ...base,
    kind: "drawing",
    targetKind: "time",
    targetTime: 1234.000001,
    barTime: 1234.000002,
    intervalKey: "tick:100",
  };
  expect(chartAlertLogCsv([tick])).toContain('"Vertical line","",3500.25,"tick:100"');
  expect(chartAlertLogCsv([tick])).not.toContain("1234.000001");
  const day: ChartAlertLogEntry = {
    ...tick,
    intervalKey: "day:1",
    targetTime: { year: 2026, month: 9, day: 15 },
  };
  expect(chartAlertLogCsv([day])).toContain('"Vertical line · 2026-09-15","",3500.25,"day:1"');
});
