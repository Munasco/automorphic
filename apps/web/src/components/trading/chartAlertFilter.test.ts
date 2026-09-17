import { expect, it, vi } from "vite-plus/test";
import {
  CHART_ALERT_FILTER_KEY,
  CHART_ALERT_FILTER_OPTIONS,
  readChartAlertFilter,
  writeChartAlertFilter,
  type ChartAlertFilter,
} from "./chartAlertFilter";
function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}
it.each(CHART_ALERT_FILTER_OPTIONS)("persists %s and avoids duplicate writes", (status) => {
  const saved = storage('{"status":"Paused"}');
  writeChartAlertFilter(saved, status);
  expect(readChartAlertFilter(saved)).toBe(status);
  if (status !== "Paused")
    expect(saved.setItem).toHaveBeenCalledWith(CHART_ALERT_FILTER_KEY, JSON.stringify({ status }));
  saved.setItem.mockClear();
  writeChartAlertFilter(saved, status);
  expect(saved.setItem).not.toHaveBeenCalled();
});
it.each([null, "{", "null", "[]", '"Paused"', "{}", '{"status":false}', '{"status":"other"}'])(
  "defaults malformed %s without writing",
  (value) => {
    const saved = storage(value);
    expect(readChartAlertFilter(saved)).toBe("all");
    writeChartAlertFilter(saved, "all");
    writeChartAlertFilter(saved, "bad" as ChartAlertFilter);
    expect(saved.setItem).not.toHaveBeenCalled();
  },
);
it("keeps workspace choices separate and propagates failed writes", () => {
  const first = storage(),
    second = storage();
  writeChartAlertFilter(first, "Expired");
  writeChartAlertFilter(second, "Active");
  expect(readChartAlertFilter(first)).toBe("Expired");
  expect(readChartAlertFilter(second)).toBe("Active");
  expect(
    readChartAlertFilter({
      getItem() {
        throw Error("Unavailable");
      },
    }),
  ).toBe("all");
  expect(() =>
    writeChartAlertFilter(
      {
        getItem: () => null,
        setItem() {
          throw Error("Unavailable");
        },
      },
      "Paused",
    ),
  ).toThrow("Unavailable");
});
