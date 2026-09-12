import type { SVGProps } from "react";

// Tabler paths retrieved from the Iconify API. MIT license: apps/web/THIRD_PARTY_NOTICES.md.
// Stroke weight is adapted to match the compact chart controls; geometry is unchanged.
const PATHS = {
  crosshair:
    "M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2m8-16h2a2 2 0 0 1 2 2v2m-4 12h2a2 2 0 0 0 2-2v-2M9 12h6m-3-3v6",
  minus: "M5 12h14",
  line: "M4 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M16 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7.5 16.5l9-9",
  "arrow-back-up": "m9 14l-4-4l4-4 M5 10h11a4 4 0 1 1 0 8h-1",
  trash:
    "M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3",
  "zoom-in": "M3 10a7 7 0 1 0 14 0a7 7 0 1 0-14 0m4 0h6m-3-3v6m11 8l-6-6",
  "zoom-out": "M3 10a7 7 0 1 0 14 0a7 7 0 1 0-14 0m4 0h6m8 11l-6-6",
  maximize:
    "M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2m8-16h2a2 2 0 0 1 2 2v2m-4 12h2a2 2 0 0 0 2-2v-2",
  "arrow-bar-to-right": "M14 12H4m10 0l-4 4m4-4l-4-4m10-4v16",
  search: "M3 10a7 7 0 1 0 14 0a7 7 0 1 0-14 0m18 11l-6-6",
  "chevron-down": "m6 9l6 6l6-6",
  "chart-candle":
    "M4 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm2-3v2m0 5v9m4-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1zm2-11v10m0 5v1m4-14a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1zm2-2v1m0 6v9",
  "chart-bar":
    "M3 13a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm12-4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1zM9 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1zM4 20h14",
  "chart-area-line": "m4 19l4-6l4 2l4-5l4 4v5zm0-7l3-4l4 2l5-6l4 4",
  sum: "M18 16v2a1 1 0 0 1-1 1H6l6-7l-6-7h11a1 1 0 0 1 1 1v2",
  "adjustments-horizontal":
    "M12 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 6h8m4 0h4M6 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0m-2 0h2m4 0h10m-5 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 18h11m4 0h1",
  camera:
    "M5 7h1a2 2 0 0 0 2-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2 M9 13a3 3 0 1 0 6 0a3 3 0 0 0-6 0",
  "external-link": "M12 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6m-7 1l9-9m-5 0h5v5",
  minimize:
    "M15 19v-2a2 2 0 0 1 2-2h2M15 5v2a2 2 0 0 0 2 2h2M5 15h2a2 2 0 0 1 2 2v2M5 9h2a2 2 0 0 0 2-2V5",
} as const;

export type ChartIconName = keyof typeof PATHS;
export type ChartIconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: ChartIconName;
  size?: number | string;
};

export function ChartIcon({ name, size = 18, ...props }: ChartIconProps) {
  return (
    <svg
      width={size}
      height={size}
      aria-hidden={props["aria-label"] ? undefined : true}
      role={props["aria-label"] ? "img" : undefined}
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
