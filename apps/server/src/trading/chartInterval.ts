export type ChartIntervalUnit = "minute" | "second" | "tick";
export class ChartIntervalError extends Error {}

const sizes: Record<ChartIntervalUnit, readonly number[]> = {
  minute: [1, 2, 3, 5, 10, 15, 30, 45, 60, 120, 180, 240],
  second: [1, 5, 10, 15, 30, 45],
  tick: [1, 10, 100, 1000],
};

export function resolveChartInterval(value: number, unit = "minute") {
  if (unit !== "minute" && unit !== "second" && unit !== "tick") {
    throw new ChartIntervalError("Choose a minute, second or tick chart interval.");
  }
  if (!sizes[unit].includes(value)) {
    throw new ChartIntervalError(`Choose a supported ${unit} interval: ${sizes[unit].join(", ")}.`);
  }
  // Seconds and aggregated count bars use vendor OHLC. One tick uses raw trade IDs.
  // https://community.tradovate.com/t/how-can-i-sub-a-secondbar-chart/4379
  return {
    interval: value,
    intervalUnit: unit,
    intervalKey: `${unit}:${value}`,
    chartDescription: {
      underlyingType: unit === "minute" ? "MinuteBar" : "Tick",
      elementSize: value,
      elementSizeUnit: unit === "second" ? "Seconds" : "UnderlyingUnits",
    },
  };
}
