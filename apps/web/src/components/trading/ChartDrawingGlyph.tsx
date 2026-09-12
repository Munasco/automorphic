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
      {tool === "trend" ? (
        <>
          <path d="m5.5 18.5 13-13" />
          <circle cx="4" cy="20" r="2" />
          <circle cx="20" cy="4" r="2" />
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
      {tool === "channel" ? (
        <>
          <path d="M4 15 17 4M7 20 20 9M5.5 17.5 18.5 6.5" />
          <circle cx="4" cy="15" r="1.5" />
          <circle cx="17" cy="4" r="1.5" />
          <circle cx="7" cy="20" r="1.5" />
        </>
      ) : null}
      {tool === "rectangle" ? (
        <>
          <path d="M5 5h14v14H5z" />
          <path d="M3.5 3.5h3v3h-3zm14 14h3v3h-3z" fill="var(--color-background, #0b0d12)" />
        </>
      ) : null}
      {tool === "text" ? <path d="M5 7V4h14v3M12 4v17m-4 0h8" /> : null}
    </svg>
  );
}
