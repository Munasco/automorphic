import { describe, expect, it } from "@effect/vitest";
import { renderChartReport, type ChartReportInput } from "./chartReport.ts";

const bars = [
  { time: 100, open: 10, high: 13, low: 9, close: 12, volume: 50 },
  { time: 200, open: 12, high: 14, low: 8, close: 9, volume: 75 },
];
const input: ChartReportInput = {
  title: "Setup",
  summary: "Observed break",
  annotations: [{ time: 200, price: 8, label: "Low", detail: "Invalidation" }],
  levels: [],
};
const evidence = {
  symbol: "NQU6",
  interval: 5,
  unit: "minute",
  source: "Saved feed",
  datasetId: "dataset",
  updatedAt: 100000,
  generatedAt: 200000,
  totalBars: 2,
  offset: 0,
};

describe("saved chart reports", () => {
  it("escapes agent-authored content and cannot execute an injected script or SVG handler", () => {
    const attack = '<script>alert(1)</script><svg onload="alert(2)">';
    const html = renderChartReport(
      bars,
      {
        ...input,
        title: attack,
        annotations: [{ ...input.annotations[0]!, label: attack, detail: attack }],
        levels: [{ price: 11, label: attack }],
      },
      { ...evidence, symbol: attack },
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<svg onload=");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("default-src 'none'");
  });
  it("rejects marks outside the selected window instead of silently moving them to a different candle", () => {
    expect(() =>
      renderChartReport(
        bars,
        { ...input, annotations: [{ ...input.annotations[0]!, time: 150 }] },
        evidence,
      ),
    ).toThrow("match a candle");
    expect(() => renderChartReport(bars.slice(0, 1), input, evidence)).toThrow("match a candle");
  });
  it("rejects duplicate timestamps, invalid OHLC and nonfinite data", () => {
    for (const invalid of [
      [bars[0]!, bars[0]!],
      [{ ...bars[0]!, high: 8 }],
      [{ ...bars[0]!, close: Number.NaN }],
      [{ ...bars[0]!, time: 1e100 }],
    ])
      expect(() => renderChartReport(invalid, { ...input, annotations: [] }, evidence)).toThrow(
        "valid OHLCV",
      );
  });
  it("renders a flat single candle and zero volume without invalid geometry", () => {
    const html = renderChartReport(
      [{ time: 100, open: 0, high: 0, low: 0, close: 0, volume: 0 }],
      { ...input, annotations: [] },
      evidence,
    );
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain("1 of 2 saved candles");
  });
});
