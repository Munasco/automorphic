import type { IndicatorStyle } from "./indicatorDefinition";
import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  Time,
  Logical,
  UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "./chartIndicators";
import type { InitialBalanceRange } from "./initialBalance";
import {
  resolveInitialBalanceSettings,
  type InitialBalanceSettings,
} from "./initialBalanceSettings";

const HIGH = "#26a69a";
const LOW = "#ef5350";
const INTERNAL = "#9ca3af";
type InitialBalanceLevel = {
  price: number;
  label: string;
  color: string;
  dashed: boolean;
  width: number;
};

export function initialBalanceLevels(
  range: InitialBalanceRange,
  config: InitialBalanceSettings,
  styles: Record<string, IndicatorStyle> = {},
): InitialBalanceLevel[] {
  const settings = resolveInitialBalanceSettings(config);
  const size = range.high - range.low;
  const levels: InitialBalanceLevel[] = [
    { price: range.high, label: "IBH", color: HIGH, dashed: false, width: 2 },
    { price: range.low, label: "IBL", color: LOW, dashed: false, width: 2 },
  ];
  if (settings.showMidpoint)
    levels.push({
      price: range.low + size * 0.5,
      label: "50%",
      color: INTERNAL,
      dashed: true,
      width: 1,
    });
  if (settings.showQuarters)
    for (const ratio of [0.25, 0.75])
      levels.push({
        price: range.low + size * ratio,
        label: `${ratio * 100}%`,
        color: INTERNAL,
        dashed: true,
        width: 1,
      });
  if (settings.showExpansions)
    for (const ratio of [0.5, 1]) {
      levels.push({
        price: range.high + size * ratio,
        label: `+${ratio.toFixed(1)}x`,
        color: HIGH,
        dashed: true,
        width: 1,
      });
      levels.push({
        price: range.low - size * ratio,
        label: `-${ratio.toFixed(1)}x`,
        color: LOW,
        dashed: true,
        width: 1,
      });
    }
  return levels.map((level) => {
    const key = level.color === HIGH ? "high" : level.color === LOW ? "low" : "internal";
    return {
      ...level,
      color: styles[key]?.color ?? level.color,
      width: styles[key]?.lineWidth ?? level.width,
    };
  });
}

/** Project the session boundary in pixels without adding future bars to the chart's timeline. */
export function projectInitialBalanceTime(
  chart: IChartApi,
  bars: readonly Candle[],
  intervalMinutes: number,
  time: number,
): number | null {
  const scale = chart.timeScale();
  const direct = scale.timeToCoordinate(time as UTCTimestamp);
  if (direct !== null) return direct;
  if (!bars.length) return null;
  let left = 0;
  let right = bars.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (bars[middle]!.time < time) left = middle + 1;
    else right = middle;
  }
  const before = bars[left - 1];
  const after = bars[left];
  if (before && after) {
    const bx = scale.timeToCoordinate(before.time as UTCTimestamp);
    const ax = scale.timeToCoordinate(after.time as UTCTimestamp);
    return bx === null || ax === null
      ? null
      : bx + ((ax - bx) * (time - before.time)) / (after.time - before.time);
  }
  const nearest = before ?? after!;
  const x = scale.timeToCoordinate(nearest.time as UTCTimestamp);
  if (x === null || intervalMinutes <= 0) return null;
  const logical = scale.coordinateToLogical(x);
  return logical === null
    ? null
    : scale.logicalToCoordinate(
        (logical + (time - nearest.time) / (intervalMinutes * 60)) as Logical,
      );
}

export function initialBalanceGeometry(
  range: InitialBalanceRange,
  settings: InitialBalanceSettings,
  timeX: (time: number) => number | null,
  priceY: (price: number) => number | null,
  width: number,
  styles: Record<string, IndicatorStyle> = {},
) {
  if (range.status !== "developing" && range.status !== "complete") return null;
  const start = timeX(range.startTime);
  const end = timeX(range.sessionEndTime);
  const windowEnd = timeX(range.endTime);
  const high = priceY(range.high);
  const low = priceY(range.low);
  if (
    start === null ||
    end === null ||
    windowEnd === null ||
    high === null ||
    low === null ||
    end < 0 ||
    start > width
  )
    return null;
  return {
    box: resolveInitialBalanceSettings(settings).showBox
      ? { left: start, right: windowEnd, top: Math.min(high, low), bottom: Math.max(high, low) }
      : null,
    left: Math.max(0, start),
    right: Math.min(width - 4, end),
    levels: initialBalanceLevels(range, settings, styles).flatMap((level) => {
      const y = priceY(level.price);
      return y === null ? [] : [{ ...level, y }];
    }),
  };
}

/** One session owns its box and projected levels; removing its host series detaches the primitive. */
export function createInitialBalancePrimitive(chart: IChartApi, series: ISeriesApi<"Line">) {
  let state: {
    range: InitialBalanceRange;
    settings: InitialBalanceSettings;
    bars: readonly Candle[];
    interval: number;
    styles: Record<string, IndicatorStyle>;
  } | null = null;
  let requestUpdate = () => {};
  const geometry = () =>
    state &&
    initialBalanceGeometry(
      state.range,
      state.settings,
      (time) => projectInitialBalanceTime(chart, state!.bars, state!.interval, time),
      (price) => series.priceToCoordinate(price),
      chart.timeScale().width(),
      state.styles,
    );
  const renderer = (layer: "box" | "levels"): IPrimitivePaneRenderer => ({
    draw(target) {
      if (!state) return;
      const shape = geometry();
      if (!shape) return;
      const width = chart.timeScale().width();
      const height = series.getPane().getHeight();
      const showLabels = resolveInitialBalanceSettings(state.settings).showLabels;
      target.useMediaCoordinateSpace(({ context: ctx }) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.clip();
        if (layer === "box") {
          if (shape.box) {
            const box = shape.box;
            ctx.fillStyle = "#6b88a522";
            ctx.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
          }
        } else {
          ctx.font = `11px ${chart.options().layout.fontFamily}`;
          ctx.textBaseline = "middle";
          for (const level of shape.levels) {
            if (level.y < 0 || level.y > height) continue;
            ctx.strokeStyle = level.color;
            ctx.lineWidth = level.width;
            ctx.setLineDash(level.dashed ? [5, 4] : []);
            ctx.beginPath();
            ctx.moveTo(shape.left, level.y);
            ctx.lineTo(shape.right, level.y);
            ctx.stroke();
            if (!showLabels) continue;
            const label =
              level.label === "IBH" || level.label === "IBL"
                ? `${level.label} ${series.priceFormatter().format(level.price)}`
                : level.label;
            const labelWidth = ctx.measureText(label).width + 14;
            const labelLeft = Math.max(4, shape.right - labelWidth);
            const labelY = Math.max(10, Math.min(height - 10, level.y));
            ctx.setLineDash([]);
            ctx.fillStyle = level.color;
            ctx.beginPath();
            ctx.roundRect(labelLeft, labelY - 9, labelWidth, 18, 4);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(labelLeft, labelY - 4);
            ctx.lineTo(labelLeft - 4, level.y);
            ctx.lineTo(labelLeft, labelY + 4);
            ctx.fill();
            ctx.fillStyle = "#080b12";
            ctx.fillText(label, labelLeft + 7, labelY);
          }
        }
        ctx.restore();
      });
    },
  });
  const boxRenderer = renderer("box");
  const lineRenderer = renderer("levels");
  const primitive: ISeriesPrimitive<Time> = {
    attached: ({ requestUpdate: update }) => {
      requestUpdate = update;
    },
    detached: () => {
      requestUpdate = () => {};
    },
    paneViews: () => [
      { zOrder: () => "bottom", renderer: () => boxRenderer },
      { zOrder: () => "top", renderer: () => lineRenderer },
    ],
    autoscaleInfo(start, end) {
      if (!state || (state.range.status !== "complete" && state.range.status !== "developing"))
        return null;
      const scale = chart.timeScale();
      const sessionStart = projectInitialBalanceTime(
        chart,
        state.bars,
        state.interval,
        state.range.startTime,
      );
      const sessionEnd = projectInitialBalanceTime(
        chart,
        state.bars,
        state.interval,
        state.range.sessionEndTime,
      );
      const left = scale.logicalToCoordinate(start);
      const right = scale.logicalToCoordinate(end);
      if (
        sessionStart === null ||
        sessionEnd === null ||
        left === null ||
        right === null ||
        sessionEnd < left ||
        sessionStart > right
      )
        return null;
      const levels = initialBalanceLevels(state.range, state.settings, state.styles);
      return {
        priceRange: {
          minValue: Math.min(...levels.map((level) => level.price)),
          maxValue: Math.max(...levels.map((level) => level.price)),
        },
      };
    },
  };
  return {
    primitive,
    update(
      range: InitialBalanceRange,
      settings: InitialBalanceSettings,
      bars: readonly Candle[],
      interval: number,
      styles: Record<string, IndicatorStyle> = {},
    ) {
      state = { range, settings, bars, interval, styles };
      requestUpdate();
    },
  };
}
