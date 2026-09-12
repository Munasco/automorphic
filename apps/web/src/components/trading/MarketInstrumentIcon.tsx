import type { SVGProps } from "react";
import { INSTRUMENTS, type InstrumentRoot } from "./tradingInstruments";

// Market identity is shared by every expiry of the same instrument.
export function MarketInstrumentIcon({
  root,
  ...props
}: SVGProps<SVGSVGElement> & { root: InstrumentRoot }) {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" {...props}>
      {INSTRUMENTS[root].family === "gold" ? (
        <>
          <circle cx="18" cy="18" r="18" fill="#6b440c" />
          <path d="m14 8 7 0 3 8H11Z" fill="#fbbf24" />
          <path d="m14 8 7 0-1 3h-5Z" fill="#fef3c7" />
          <path d="m21 8 3 8h-4v-5Z" fill="#d99113" />
          <path d="M7 19h9l3 8H4Z" fill="#fbbf24" />
          <path d="M7 19h9l-1 3H8Z" fill="#fef3c7" />
          <path d="m16 19 3 8h-4v-5Z" fill="#d99113" />
          <path d="M22 19h7l3 8H19Z" fill="#fbbf24" />
          <path d="M22 19h7l-1 3h-5Z" fill="#fef3c7" />
          <path d="m29 19 3 8h-4v-5Z" fill="#d99113" />
        </>
      ) : (
        <>
          <circle cx="18" cy="18" r="18" fill="#2563eb" />
          <text
            x="18"
            y="18.5"
            dominantBaseline="middle"
            textAnchor="middle"
            fill="white"
            fontFamily="Inter, Arial, sans-serif"
            fontWeight="650"
            fontSize="15"
            letterSpacing="-0.6"
          >
            100
          </text>
        </>
      )}
    </svg>
  );
}
