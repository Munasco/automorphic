import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

import {
  DEFAULT_OVERLAY_LAYOUT as empty,
  OverlayLayoutContext,
  type OverlayRect,
  type OverlayBounds,
  type OverlayLayout,
} from "../ui/overlay-layout";
export { useOverlayLayout as useChartOverlayLayout } from "../ui/overlay-layout";
export type ChartOverlayRect = OverlayRect;
export type ChartOverlayBounds = OverlayBounds;
export type ChartOverlayLayout = OverlayLayout;

const validRect = (rect: ChartOverlayRect) =>
  [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
  rect.width > 0 &&
  rect.height > 0;

/** Bounds and positioning stay in viewport pixels; only popup content receives zoom.
 * The inverse size limits keep scaled content inside the chart without shrinking it twice.
 */
export function calculateChartOverlayLayout(
  container: ChartOverlayRect,
  viewport: ChartOverlayRect,
): ChartOverlayLayout {
  if (!validRect(container) || !validRect(viewport)) return empty;
  let left = Math.max(container.left, viewport.left);
  let top = Math.max(container.top, viewport.top);
  let right = Math.min(container.left + container.width, viewport.left + viewport.width);
  let bottom = Math.min(container.top + container.height, viewport.top + viewport.height);
  // A moved-offscreen chart must not leave an already-open dialog unreachable.
  if (right <= left || bottom <= top) {
    left = viewport.left;
    top = viewport.top;
    right = viewport.left + viewport.width;
    bottom = viewport.top + viewport.height;
  }
  const insetX = Math.min(8, (right - left) / 4);
  const insetY = Math.min(8, (bottom - top) / 4);
  left += insetX;
  top += insetY;
  right -= insetX;
  bottom -= insetY;
  const bounds = { left, top, right, bottom, width: right - left, height: bottom - top };
  const scale =
    Math.round(Math.max(0.85, Math.min(1, container.width / 900, container.height / 650)) * 1000) /
    1000;
  const popupStyle: CSSProperties = {
    zoom: scale,
    maxWidth: bounds.width / scale,
    maxHeight: bounds.height / scale,
  };
  return {
    measured: true,
    scale,
    bounds,
    popupStyle,
    dialogStyle: { ...popupStyle, overflowY: "auto" },
    dialogViewportStyle: {
      position: "fixed",
      inset: "auto",
      left,
      top,
      width: bounds.width,
      height: bounds.height,
      padding: 0,
      gridTemplateRows: "1fr auto 1fr",
      justifyItems: "center",
    },
  };
}

/** Wrap the chart and its sibling controls together; React portals retain this context.
 * Supply an element for conditionally mounted containers, or a stable ref for mounted panels.
 */
export function ChartOverlayLayoutProvider({
  container,
  containerRef,
  children,
}: {
  container?: HTMLElement | null;
  containerRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const [layout, setLayout] = useState<ChartOverlayLayout>(empty);
  useLayoutEffect(() => {
    const element = container ?? containerRef?.current;
    if (!element) {
      setLayout(empty);
      return;
    }
    let frame: number | undefined;
    const measure = () => {
      frame = undefined;
      const visual = window.visualViewport;
      const next = calculateChartOverlayLayout(element.getBoundingClientRect(), {
        left: visual?.offsetLeft ?? 0,
        top: visual?.offsetTop ?? 0,
        width: visual?.width ?? window.innerWidth,
        height: visual?.height ?? window.innerHeight,
      });
      setLayout((current) =>
        current.measured === next.measured &&
        current.scale === next.scale &&
        current.bounds?.left === next.bounds?.left &&
        current.bounds?.top === next.bounds?.top &&
        current.bounds?.width === next.bounds?.width &&
        current.bounds?.height === next.bounds?.height
          ? current
          : next,
      );
    };
    const schedule = () => {
      if (frame === undefined) frame = requestAnimationFrame(measure);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(element);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    measure();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [container, containerRef]);
  return <OverlayLayoutContext.Provider value={layout}>{children}</OverlayLayoutContext.Provider>;
}
