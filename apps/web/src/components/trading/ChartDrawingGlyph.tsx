import type { ChartDrawingTool } from "./useChartDrawings";

// Drawing geometry is represented directly so every tool remains recognizable at toolbar size.
export function ChartDrawingGlyph({ tool }: { tool: ChartDrawingTool }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-[22px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {tool === "cursor" ? <path d="M12 2v7m0 6v7M2 12h7m6 0h7" /> : null}
      {tool === "position-forecast" ? (
        <>
          <circle cx="18" cy="6" r="4" />
          <path d="m3 20 5-8 4 3 6-9m-4 1 4-1v4" />
        </>
      ) : null}
      {tool === "bars-pattern" ? (
        <>
          <path d="M5 8v12m-3-7h3m0 3h3M11 4v13m-3-8h3m0 3h3M17 7v13m-3-8h3m0 4h3" />
          <path d="M15 2h7v16" strokeDasharray="2 2" opacity=".5" />
        </>
      ) : null}
      {tool === "ghost-feed" ? (
        <>
          <path d="M5 12v9M12 7v12M19 2v12" strokeDasharray="2 2" />
          <rect x="3" y="14" width="4" height="5" strokeDasharray="2 2" />
          <rect x="10" y="10" width="4" height="6" strokeDasharray="2 2" />
          <rect x="17" y="5" width="4" height="4" strokeDasharray="2 2" />
        </>
      ) : null}
      {tool === "anchored-vwap" ? (
        <>
          <circle cx="4" cy="17" r="2" />
          <path d="M6 17c3 0 3-8 7-8s4 3 8-4" />
          <path d="M4 13V4" strokeDasharray="2 2" opacity=".5" />
        </>
      ) : null}
      {tool === "sector" ? (
        <>
          <path d="M5 19V4a15 15 0 0 1 15 15Z" fill="currentColor" fillOpacity=".12" />
          <circle cx="5" cy="19" r="1.5" />
        </>
      ) : null}
      {tool === "long-position" || tool === "short-position" ? (
        <>
          <rect x="5" y="3" width="14" height="18" rx="1" />
          <path d="M5 12h14" />
          <path
            d={tool === "long-position" ? "M12 10V5m-2 2 2-2 2 2" : "M12 14v5m-2-2 2 2 2-2"}
            strokeWidth="1.6"
          />
          <path d={tool === "long-position" ? "M8 16h8M8 18h8" : "M8 6h8M8 8h8"} opacity=".5" />
        </>
      ) : null}
      {tool === "price-range" ? (
        <>
          <path d="M4 4h16M4 20h16M12 5v14m-3-3 3 3 3-3M9 8l3-3 3 3" />
          <path d="M5 8v8M19 8v8" strokeDasharray="1 3" opacity=".5" />
        </>
      ) : null}
      {tool === "date-range" ? (
        <>
          <path d="M4 4v16M20 4v16M5 12h14m-3-3 3 3-3 3M8 9l-3 3 3 3" />
          <path d="M8 5h8M8 19h8" strokeDasharray="1 3" opacity=".5" />
        </>
      ) : null}
      {tool === "date-price-range" ? (
        <>
          <rect x="4" y="4" width="16" height="16" strokeDasharray="2 2" />
          <path d="M7 17 17 7M7 12v5h5M12 7h5v5" />
        </>
      ) : null}
      {tool === "regression-trend" ? (
        <>
          <path d="m3 16 18-8M3 21 21 13M3 11 21 3" />
          <path d="m4 17 3-4 3 2 3-6 3 2 4-5" strokeDasharray="2 2" />
        </>
      ) : null}
      {tool === "trend" ? (
        <>
          <path d="m5.5 18.5 13-13" />
          <circle cx="4" cy="20" r="2" />
          <circle cx="20" cy="4" r="2" />
        </>
      ) : null}
      {tool === "info-line" ? (
        <>
          <path d="m4 19 14-13" />
          <circle cx="4" cy="19" r="1.7" />
          <circle cx="18" cy="6" r="1.7" />
          <path d="M14 19h6m-3-5v5m0-8v.2" />
        </>
      ) : null}
      {tool === "extended-line" ? (
        <>
          <path d="M2 22 22 2" />
          <circle cx="8" cy="16" r="1.5" />
          <circle cx="16" cy="8" r="1.5" />
        </>
      ) : null}
      {tool === "trend-angle" ? (
        <>
          <path d="M3 20h19M3 20 20 4M11 20a8 8 0 0 0-2.4-5.7" />
          <circle cx="3" cy="20" r="1.5" />
          <circle cx="20" cy="4" r="1.5" />
        </>
      ) : null}
      {tool === "crossline" ? (
        <>
          <path d="M12 2v8m0 4v8M2 12h8m4 0h8" />
          <circle cx="12" cy="12" r="2" />
        </>
      ) : null}
      {tool === "ray" ? (
        <>
          <path d="m5.5 18.5 16-16" />
          <circle cx="4" cy="20" r="2" />
          <circle cx="14" cy="10" r="1.5" fill="var(--color-background, #0b0d12)" />
        </>
      ) : null}
      {tool === "horizontal" ? (
        <>
          <path d="M2 12h8m4 0h8" />
          <circle cx="12" cy="12" r="2" />
        </>
      ) : null}
      {tool === "horizontal-ray" ? (
        <>
          <path d="M6 12h16" />
          <circle cx="4" cy="12" r="2" />
        </>
      ) : null}
      {tool === "vertical" ? (
        <>
          <path d="M12 2v8m0 4v8" />
          <circle cx="12" cy="12" r="2" />
        </>
      ) : null}
      {tool === "fib" ? (
        <>
          <path d="M3 4h18M3 10h18M3 15h18M3 20h18" />
          <circle cx="6" cy="4" r="1.5" fill="var(--color-background, #0b0d12)" />
          <circle cx="18" cy="20" r="1.5" fill="var(--color-background, #0b0d12)" />
        </>
      ) : null}
      {tool === "fib-time-zone" ? (
        <>
          <path d="M3 3v18M7 3v18M11 3v18M17 3v18M22 3v18" />
          <path d="m3 16 4-7" strokeDasharray="2 2" />
        </>
      ) : null}
      {tool === "fib-trend-time" ? (
        <>
          <path d="M8 3v18M13 3v18M20 3v18" />
          <path d="m2 18 5-10 4 5" strokeDasharray="2 2" />
          <circle cx="2" cy="18" r="1" />
          <circle cx="7" cy="8" r="1" />
          <circle cx="11" cy="13" r="1" />
        </>
      ) : null}
      {tool === "fib-extension" ? (
        <>
          <path d="M2 19 8 10l5 4 8-11M3 8h18M3 4h18M10 13h11" />
          <circle cx="2" cy="19" r="1.5" />
          <circle cx="8" cy="10" r="1.5" />
          <circle cx="13" cy="14" r="1.5" />
        </>
      ) : null}
      {tool === "fib-channel" ? (
        <>
          <path d="m2 18 17-7M3 13l17-7M4 8l17-7M1 23l17-7" />
          <circle cx="3" cy="13" r="1.5" />
          <circle cx="20" cy="6" r="1.5" />
          <circle cx="2" cy="18" r="1.5" />
        </>
      ) : null}
      {["pitchfork", "schiff-pitchfork", "modified-schiff-pitchfork", "inside-pitchfork"].includes(
        tool,
      ) ? (
        <>
          <path d="m3 21 17-17M6 11l15-8M13 20l10-15M6 11l7 9" />
          <circle cx="3" cy="21" r="1.5" />
          <circle cx="6" cy="11" r="1.5" />
          <circle cx="13" cy="20" r="1.5" />
          {tool !== "pitchfork" ? (
            <path
              d={
                tool === "schiff-pitchfork"
                  ? "M3 21v-7h6"
                  : tool === "inside-pitchfork"
                    ? "m4 16 5-2 4 3"
                    : "m3 21 4-5 3 1"
              }
              strokeDasharray="2 2"
            />
          ) : null}
        </>
      ) : null}
      {tool === "channel" ? (
        <>
          <path d="M4 15 17 4M7 20 20 9M5.5 17.5 18.5 6.5" />
          <circle cx="4" cy="15" r="1.5" />
          <circle cx="17" cy="4" r="1.5" />
          <circle cx="7" cy="20" r="1.5" />
        </>
      ) : null}
      {tool === "flat-channel" ? (
        <>
          <path d="m3 14 18-9M3 20h18" />
          <circle cx="3" cy="14" r="1.5" />
          <circle cx="21" cy="5" r="1.5" />
          <circle cx="21" cy="20" r="1.5" />
        </>
      ) : null}
      {tool === "disjoint-channel" ? (
        <>
          <path d="m3 14 18-9M3 17l18 5" />
          <circle cx="3" cy="14" r="1.5" />
          <circle cx="21" cy="5" r="1.5" />
          <circle cx="21" cy="22" r="1.5" />
        </>
      ) : null}
      {tool === "rectangle" ? (
        <>
          <path d="M5 5h14v14H5z" />
          <path d="M3.5 3.5h3v3h-3zm14 14h3v3h-3z" fill="var(--color-background, #0b0d12)" />
        </>
      ) : null}
      {tool === "brush" ? (
        <path d="M3 20c4 1 7-1 7-4 0-2-2-3-4-2s-1 4-3 6m7-7 8-10 3 3-10 8M15 8l2 2" />
      ) : null}
      {tool === "highlighter" ? (
        <>
          <path d="m5 14 9-11 7 6-9 10zM5 14l-2 6 5 1 4-2M8 11l7 6" />
          <path d="M2 23h12" strokeWidth="2" />
        </>
      ) : null}
      {tool === "arrow-marker" ? <path d="m3 20 4-9 3 3L20 3l1 9-5-2L8 21z" /> : null}
      {tool === "arrow" ? (
        <>
          <path d="m5 19 14-14m-6 0h6v6" />
          <circle cx="4" cy="20" r="1.5" />
        </>
      ) : null}
      {tool === "arrow-up" ? <path d="m12 3 7 8h-4v10H9V11H5z" /> : null}
      {tool === "arrow-down" ? <path d="m12 21 7-8h-4V3H9v10H5z" /> : null}
      {tool === "rotated-rectangle" ? (
        <>
          <path d="m3 12 11-9 7 9-11 9z" />
          <circle cx="3" cy="12" r="1.5" />
          <circle cx="14" cy="3" r="1.5" />
          <circle cx="21" cy="12" r="1.5" />
        </>
      ) : null}
      {tool === "path" || tool === "polyline" ? (
        <>
          <path d="m3 18 6-11 6 8 6-11" />
          <circle cx="3" cy="18" r="1.5" />
          <circle cx="9" cy="7" r="1.5" />
          <circle cx="15" cy="15" r="1.5" />
          {tool === "path" ? <path d="M15 4h6v6" /> : <circle cx="21" cy="4" r="1.5" />}
        </>
      ) : null}
      {tool === "circle" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="8" r="1.5" />
        </>
      ) : null}
      {tool === "ellipse" ? (
        <>
          <ellipse cx="12" cy="12" rx="10" ry="6" />
          <circle cx="2" cy="12" r="1.5" />
          <circle cx="22" cy="12" r="1.5" />
        </>
      ) : null}
      {tool === "triangle" ? (
        <>
          <path d="m5 19 2-15 14 15z" />
          <circle cx="5" cy="19" r="1.5" />
          <circle cx="7" cy="4" r="1.5" />
          <circle cx="21" cy="19" r="1.5" />
        </>
      ) : null}
      {tool === "arc" ? (
        <>
          <path d="M3 20Q3 3 20 3" />
          <circle cx="3" cy="20" r="1.5" />
          <circle cx="20" cy="3" r="1.5" />
        </>
      ) : null}
      {tool === "curve" ? (
        <>
          <path d="M3 20Q5 2 21 5" />
          <circle cx="3" cy="20" r="1.5" />
          <circle cx="21" cy="5" r="1.5" />
        </>
      ) : null}
      {tool === "double-curve" ? (
        <>
          <path d="M3 20C21 22 2 2 21 4" />
          <circle cx="3" cy="20" r="1.5" />
          <circle cx="21" cy="4" r="1.5" />
        </>
      ) : null}
      {tool === "text" ? <path d="M5 7V4h14v3M12 4v17m-4 0h8" /> : null}
    </svg>
  );
}
