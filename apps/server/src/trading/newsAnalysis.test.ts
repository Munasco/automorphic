import { describe, expect, it, vi } from "vite-plus/test";
import { createNewsAnalyst, parseImpacts, type Headline, type Impact } from "./newsAnalysis.ts";
const headline = (id = "1", title = "Example headline"): Headline => ({
  id,
  title,
  publishedAt: "2026-09-11T20:00:00Z",
});
const impact: Impact = {
  status: "rated",
  direction: "bullish",
  strength: "weak",
  confidence: 0.6,
  reason: "The headline could support this instrument, but context is limited.",
};

describe("headline impact validation", () => {
  it("accepts only requested ids with coherent direction, strength and confidence", () => {
    const good = { id: "1", ...impact };
    const rows = [
      good,
      { ...good, id: "unknown" },
      { ...good, id: "2", direction: "neutral" },
      { ...good, id: "3", confidence: 5 },
      { ...good, id: "4", reason: "" },
    ];
    const results = parseImpacts(
      { items: rows },
      [1, 2, 3, 4].map((id) => headline(String(id))),
    );
    expect([...results.keys()]).toEqual(["1"]);
    expect(results.get("1")).toEqual(impact);
  });
  it("rejects malformed model output instead of creating a signal", () => {
    expect(() => parseImpacts({ items: "bullish" }, [headline()])).toThrow();
    expect(
      parseImpacts({ items: [null, { id: "1", ...impact, strength: "certain" }] }, [headline()])
        .size,
    ).toBe(0);
  });
});

describe("news analysis cache", () => {
  it("deduplicates in-flight calls, uses batches of twenty, and separates instruments", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const classify = vi.fn(async (items: readonly Headline[]) => {
      await gate;
      return new Map(items.map((item) => [item.id, impact]));
    });
    const analyst = createNewsAnalyst(classify);
    const items = Array.from({ length: 25 }, (_, index) => headline(String(index)));
    expect(analyst.annotate(items, "MGC", true).analysisStatus).toBe("pending");
    analyst.annotate(items, "MGC", true);
    expect(classify).toHaveBeenCalledTimes(1);
    release();
    await analyst.settled("MGC");
    expect(classify.mock.calls.map(([batch]) => batch.length)).toEqual([20, 5]);
    expect(
      analyst.annotate(items, "MGC", true).items.every((item) => item.analysis.status === "rated"),
    ).toBe(true);
    analyst.annotate(items.slice(0, 1), "NQ", true);
    await analyst.settled("NQ");
    expect(classify).toHaveBeenCalledTimes(3);
  });
  it("re-analyzes edited headlines and expired results", async () => {
    let clock = 0;
    const classify = vi.fn(
      async (items: readonly Headline[]) => new Map(items.map((item) => [item.id, impact])),
    );
    const analyst = createNewsAnalyst(classify, () => clock);
    analyst.annotate([headline()], "MGC", true);
    await analyst.settled("MGC");
    analyst.annotate([headline("1", "Changed headline")], "MGC", true);
    await analyst.settled("MGC");
    clock = 31 * 60_000;
    analyst.annotate([headline("1", "Changed headline")], "MGC", true);
    await analyst.settled("MGC");
    expect(classify).toHaveBeenCalledTimes(3);
  });
  it("does not call the provider without configuration, and backs off errors without fabricating ratings", async () => {
    let clock = 0;
    const classify = vi.fn(async () => {
      throw new Error("Provider unavailable");
    });
    const analyst = createNewsAnalyst(classify, () => clock);
    expect(analyst.annotate([headline()], "MGC", false).items[0]?.analysis.status).toBe("unrated");
    expect(classify).not.toHaveBeenCalled();
    analyst.annotate([headline()], "MGC", true);
    await analyst.settled("MGC");
    expect(analyst.annotate([headline()], "MGC", true).items[0]?.analysis.status).toBe("unrated");
    expect(classify).toHaveBeenCalledTimes(1);
    clock = 5 * 60_000 + 1;
    analyst.annotate([headline()], "MGC", true);
    await analyst.settled("MGC");
    expect(classify).toHaveBeenCalledTimes(2);
  });
});
