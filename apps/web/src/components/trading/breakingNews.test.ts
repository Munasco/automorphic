import { describe, expect, it } from "vite-plus/test";
import { BREAKING_WINDOW_MS, selectBreakingNews } from "./breakingNews";

const now = Date.parse("2026-09-11T14:00:00Z");
const item = (title: string, age: number, category = "News") => ({
  title,
  category,
  publishedAt: new Date(now - age).toISOString(),
});
describe("breaking news selection", () => {
  it("pins the newest publisher-marked item without depending on source order", () => {
    const older = item("Breaking: Rate decision", 120_000);
    const latest = item("Just in: Central bank statement", 20_000);
    expect(selectBreakingNews([older, latest], now)).toBe(latest);
  });
  it("accepts explicit breaking categories without a title prefix", () => {
    const headline = item("Central bank announces decision", 30_000, "Breaking News");
    expect(selectBreakingNews([headline], now)).toBe(headline);
  });
  it("expires at fifteen minutes and rejects invalid or future timestamps", () => {
    expect(
      selectBreakingNews(
        [
          item("Breaking: Old news", BREAKING_WINDOW_MS),
          item("Breaking: Future", -1),
          { title: "Breaking: Invalid", category: "News", publishedAt: "invalid" },
        ],
        now,
      ),
    ).toBeNull();
  });
  it("does not promote ordinary headlines or articles discussing breaking news", () => {
    expect(
      selectBreakingNews(
        [item("Gold surges after CPI", 1), item("How breaking news affects markets", 1)],
        now,
      ),
    ).toBeNull();
  });
});
