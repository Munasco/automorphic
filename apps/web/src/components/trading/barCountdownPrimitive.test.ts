import { expect, it, vi } from "vite-plus/test";
import type { ISeriesApi, SeriesType, SeriesAttachedParameter, Time } from "lightweight-charts";
import { createBarCountdownPrimitive } from "./barCountdownPrimitive";

function fixture() {
  let y: number | null = 100;
  const series = {
    priceToCoordinate: () => y,
    getPane: () => ({ getHeight: () => 300 }),
  } as unknown as ISeriesApi<SeriesType>;
  const plugin = createBarCountdownPrimitive(series, () => 12);
  const requestUpdate = vi.fn();
  plugin.primitive.attached!({ requestUpdate } as unknown as SeriesAttachedParameter<Time>);
  return {
    ...plugin,
    requestUpdate,
    move: (next: number | null) => {
      y = next;
    },
  };
}

it("follows price-scale movement, stays below the price label and flips above at the pane edge", () => {
  const f = fixture();
  f.update("04:59", 21000, true);
  const view = f.primitive.priceAxisViews!()[0]!;
  expect(view.fixedCoordinate!()).toBe(120);
  f.move(290);
  expect(view.fixedCoordinate!()).toBe(270);
  f.update("04:59", 21000, false);
  expect(view.fixedCoordinate!()).toBe(288);
  f.move(-5);
  expect(view.visible!()).toBe(false);
  f.move(null);
  expect(view.visible!()).toBe(false);
  f.move(150);
  expect(view.visible!()).toBe(true);
  expect(view.fixedCoordinate!()).toBe(150);
});

it("redraws only changed visible countdown state and removes the label immediately on disable", () => {
  const f = fixture();
  f.update(null, 21000, true);
  expect(f.requestUpdate).not.toHaveBeenCalled();
  f.update("04:59", 21000, true);
  f.update("04:59", 21000, true);
  expect(f.requestUpdate).toHaveBeenCalledTimes(1);
  f.update("04:58", 21000, true);
  expect(f.primitive.priceAxisViews!()[0]!.text()).toBe("04:58");
  f.update(null, 21000, true);
  expect(f.primitive.priceAxisViews!()).toEqual([]);
  expect(f.requestUpdate).toHaveBeenCalledTimes(3);
  f.update(null, 22000, false);
  expect(f.requestUpdate).toHaveBeenCalledTimes(3);
  f.primitive.detached!();
  f.update("04:00", 21000, true);
  expect(f.requestUpdate).toHaveBeenCalledTimes(3);
});
