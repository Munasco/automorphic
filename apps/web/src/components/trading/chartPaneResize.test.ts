import { expect, it, vi } from "vite-plus/test";
import type { IChartApi } from "lightweight-charts";
import { trackChartPaneResize } from "./chartPaneResize";
function fixture() {
  const document = Object.assign(new EventTarget(), { defaultView: new EventTarget() });
  const host = Object.assign(new EventTarget(), { ownerDocument: document });
  let elements = [{}, {}];
  let sizes = { $price: 3, rsi: 1 };
  let current = true;
  const save = vi.fn();
  const chart = {
    chartElement: () => host,
    panes: () => elements.map((element) => ({ getHTMLElement: () => element })),
  } as unknown as IChartApi;
  const dispose = trackChartPaneResize(
    chart,
    () => ({ ...sizes }),
    save,
    () => current,
  );
  const send = (target: EventTarget, type: string, fields: object = {}) =>
    target.dispatchEvent(Object.assign(new Event(type), fields));
  return {
    document,
    host,
    save,
    dispose,
    send,
    resize: () => {
      sizes = { $price: 2, rsi: 2 };
    },
    switchWorkspace: () => {
      current = false;
    },
    rebuild: () => {
      elements = [{}, {}];
    },
  };
}
it("saves once after a resize, never during movement or normal chart gestures", () => {
  const f = fixture();
  f.send(f.host, "mousedown", { button: 0 });
  f.send(f.document, "mouseup", { button: 0 });
  expect(f.save).not.toHaveBeenCalled();
  f.send(f.host, "mousedown", { button: 0 });
  f.resize();
  f.send(f.document, "mousemove");
  expect(f.save).not.toHaveBeenCalled();
  f.send(f.document, "mouseup", { button: 0 });
  f.send(f.document, "mouseup", { button: 0 });
  expect(f.save).toHaveBeenCalledExactlyOnceWith({ $price: 2, rsi: 2 });
  f.dispose();
});
it.each(["workspace", "panes", "cancel", "dispose"])(
  "discards pending changes after %s changes",
  (kind) => {
    const f = fixture();
    f.send(f.host, "mousedown", { button: 0 });
    f.resize();
    if (kind === "workspace") f.switchWorkspace();
    if (kind === "panes") f.rebuild();
    if (kind === "cancel") f.send(f.document, "touchcancel");
    if (kind === "dispose") f.dispose();
    f.send(f.document, "mouseup", { button: 0 });
    expect(f.save).not.toHaveBeenCalled();
    f.dispose();
  },
);
it("tracks one touch through release outside the chart and ignores unrelated releases", () => {
  const f = fixture();
  f.send(f.host, "touchstart", { touches: [{ identifier: 7 }] });
  f.resize();
  f.send(f.document, "touchend", { changedTouches: [{ identifier: 8 }] });
  f.send(f.document, "mouseup", { button: 0 });
  expect(f.save).not.toHaveBeenCalled();
  f.send(f.document, "touchend", { changedTouches: [{ identifier: 7 }] });
  expect(f.save).toHaveBeenCalledExactlyOnceWith({ $price: 2, rsi: 2 });
  f.dispose();
});
