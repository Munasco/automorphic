import type { SVGProps } from "react";

/** Stacked-layer geometry matched to the TradingView Object tree control. */
export function ObjectTreeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" {...props} viewBox="8 8 28 28" fill="none">
      <path
        fill="currentColor"
        d="M21.34 12.13a1 1 0 0 1 .98 0l10.41 5.93a1 1 0 0 1 0 1.73l-10.4 5.93a1 1 0 0 1-.99 0L10.78 19.8a1 1 0 0 1 0-1.75l10.56-5.92Zm.49.87-10.56 5.93 10.56 5.93 10.4-5.93L21.84 13ZM33.5 24.86l-11.66 6.8L10 25l.5-.87 11.33 6.38L32.99 24l.5.87Z"
      />
    </svg>
  );
}
