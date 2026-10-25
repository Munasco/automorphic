import { filterChartAlertLog } from "./chartAlertLogFilter";
import { expect, it, vi } from "vite-plus/test";
import {
  CHART_ALERT_LOG_FILTER_KEY,
  CHART_ALERT_LOG_FILTER_OPTIONS,
  readChartAlertLogFilter,
  writeChartAlertLogFilter,
  type ChartAlertLogFilter,
} from "./chartAlertLogFilter";
function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}
it.each(CHART_ALERT_LOG_FILTER_OPTIONS)("persists %s and avoids duplicate writes", (kind) => {
  const saved = storage('{"kind":"drawing"}');
  writeChartAlertLogFilter(saved, kind);
  expect(readChartAlertLogFilter(saved)).toBe(kind);
  if (kind !== "drawing")
    expect(saved.setItem).toHaveBeenCalledWith(
      CHART_ALERT_LOG_FILTER_KEY,
      JSON.stringify({ kind }),
    );
  saved.setItem.mockClear();
  writeChartAlertLogFilter(saved, kind);
  expect(saved.setItem).not.toHaveBeenCalled();
});
it.each([null, "{", "null", "[]", '"drawing"', "{}", '{"kind":false}', '{"kind":"other"}'])(
  "defaults malformed %s without writing",
  (value) => {
    const saved = storage(value);
    expect(readChartAlertLogFilter(saved)).toBe("all");
    writeChartAlertLogFilter(saved, "all");
    writeChartAlertLogFilter(saved, "bad" as ChartAlertLogFilter);
    expect(saved.setItem).not.toHaveBeenCalled();
  },
);
it("keeps workspace choices separate and propagates failed writes", () => {
  const first = storage(),
    second = storage();
  writeChartAlertLogFilter(first, "drawing");
  writeChartAlertLogFilter(second, "price");
  expect(readChartAlertLogFilter(first)).toBe("drawing");
  expect(readChartAlertLogFilter(second)).toBe("price");
  expect(
    readChartAlertLogFilter({
      getItem() {
        throw Error("Unavailable");
      },
    }),
  ).toBe("all");
  expect(() =>
    writeChartAlertLogFilter(
      {
        getItem: () => null,
        setItem() {
          throw Error("Unavailable");
        },
      },
      "drawing",
    ),
  ).toThrow("Unavailable");
});

it("combines event type and search without matching type words in event names", () => {
  const events = [
    { id: "p", kind: "price" as const, searchText: "Drawing price signal NQ" },
    { id: "d", kind: "drawing" as const, searchText: "Drawing price signal NQ" },
    { id: "d2", kind: "drawing" as const, searchText: "Opening range ES" },
  ];
  const before = structuredClone(events);
  expect(filterChartAlertLog(events, "price", " DRAWING ").map((e) => e.id)).toEqual(["p"]);
  expect(filterChartAlertLog(events, "drawing", "PRICE").map((e) => e.id)).toEqual(["d"]);
  expect(filterChartAlertLog(events, "all", "nq").map((e) => e.id)).toEqual(["p", "d"]);
  expect(filterChartAlertLog(events, "price", "ES")).toEqual([]);
  expect(filterChartAlertLog(events, "all", "")).toEqual(events);
  expect(events).toEqual(before);
});
