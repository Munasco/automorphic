import { createContext, useContext, type CSSProperties } from "react";

export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface OverlayBounds extends OverlayRect {
  right: number;
  bottom: number;
}
export interface OverlayLayout {
  measured: boolean;
  scale: number;
  bounds: OverlayBounds | null;
  popupStyle: CSSProperties;
  dialogStyle: CSSProperties;
  dialogViewportStyle: CSSProperties;
}
export const DEFAULT_OVERLAY_LAYOUT: OverlayLayout = {
  measured: false,
  scale: 1,
  bounds: null,
  popupStyle: {},
  dialogStyle: {},
  dialogViewportStyle: {},
};
export const OverlayLayoutContext = createContext<OverlayLayout>(DEFAULT_OVERLAY_LAYOUT);
export function useOverlayLayout(): OverlayLayout {
  return useContext(OverlayLayoutContext);
}

type StatefulStyle<State> =
  | CSSProperties
  | ((state: State) => CSSProperties | undefined)
  | undefined;
/** Apply container bounds after caller appearance; preserve callback styles and default behavior. */
export function mergeOverlayStyle<State>(
  style: StatefulStyle<State>,
  layoutStyle: CSSProperties,
): StatefulStyle<State> {
  if (Object.keys(layoutStyle).length === 0) return style;
  if (typeof style === "function") return (state) => ({ ...style(state), ...layoutStyle });
  return { ...style, ...layoutStyle };
}

/** Floating positioning stays in viewport pixels, independently of popup content zoom. */
export function overlayCollisionBoundary(layout: Pick<OverlayLayout, "measured" | "bounds">) {
  if (!layout.measured || !layout.bounds) return undefined;
  const { left, top, width, height } = layout.bounds;
  return { x: left, y: top, width, height };
}
