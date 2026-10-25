/** Compact order symbols: direction chevrons and a ticket with a plus. */
export function ChartOrderIcon({ side }: { side?: "Buy" | "Sell" }) {
  return (
    <svg
      aria-hidden="true"
      className="size-4.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d={
          side === "Buy"
            ? "m7 14 5-5 5 5"
            : side === "Sell"
              ? "m7 10 5 5 5-5"
              : "M13 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M7 10l3-2 3 2m-3 4 3 2 3-2m3 2v6m-3-3h6"
        }
      />
    </svg>
  );
}
