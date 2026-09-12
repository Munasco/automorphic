import type { SVGProps } from "react";

const paths = {
  alarm: "M4.5 3 1.5 6M19.5 3l3 3M12 7v6H8M21 13a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  "alarm-add": "M5 3 1.5 6.5M18.5 3 22 6.5M11 8v5H7.5M13 21a8.5 8.5 0 1 1 7-9M19 15v8M15 19h8",
  plus: "M12 3v18M3 12h18",
  sort: "M6 4v16M2 16l4 4 4-4M13 5h9M13 11h6M13 17h3",
  more: "M3 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M10.5 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M18 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0",
  pause: "M8 5v14M16 5v14",
  play: "m7 4 13 8-13 8Z",
} as const;

export function AlertIcon({
  name,
  size = 22,
  ...props
}: Omit<SVGProps<SVGSVGElement>, "name"> & { name: keyof typeof paths; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="square"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
