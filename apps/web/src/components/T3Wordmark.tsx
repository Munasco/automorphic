import type { SVGProps } from "react";

export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M50 5 89 27.5V72.5L50 95 11 72.5V27.5Z" />
      <path d="M50 15 80 32.5V67.5L50 85 20 67.5V32.5Z" opacity="0.7" />
      <path d="M50 25 71 37.5V62.5L50 75 29 62.5V37.5Z" opacity="0.4" />
      <path d="M50 5V25M89 27.5 71 37.5M89 72.5 71 62.5M50 95V75M11 72.5 29 62.5M11 27.5 29 37.5" />
      <path
        d="M50 25 71 62.5M71 37.5 29 62.5M71 62.5 29 37.5M50 75 29 37.5"
        opacity="0.4"
        strokeDasharray="2 2"
      />
      <circle cx="50" cy="50" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
