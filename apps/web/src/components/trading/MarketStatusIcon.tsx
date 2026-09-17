// Open: solar:pulse-2-linear (CC BY 4.0). Closed: original colorful jail graphic.
// Attribution: apps/web/THIRD_PARTY_NOTICES.md.
export function MarketStatusIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {open ? (
        <>
          <path
            strokeLinecap="round"
            d="M2 15.0002H5C5.63383 15.0002 5.95074 15.0002 6.23374 15.1215C6.51673 15.2428 6.73529 15.4723 7.17241 15.9313L8.31402 17.13C8.69807 17.5332 8.8901 17.7348 9.12399 17.7191C9.35788 17.7035 9.52124 17.478 9.84796 17.027L13.4781 12.0163C13.8177 11.5476 13.9875 11.3132 14.2282 11.3022C14.4688 11.2911 14.6594 11.5089 15.0405 11.9445L16.8179 13.9758C17.2591 14.48 17.4797 14.7321 17.7751 14.8662C18.0705 15.0002 18.4056 15.0002 19.0756 15.0002H22"
          />
          <path d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z" />
        </>
      ) : (
        <g stroke="none">
          <rect x="2" y="2" width="20" height="20" rx="4" fill="#f87171" />
          <rect x="4" y="4" width="16" height="17" rx="2" fill="#7f1d1d" />
          <path d="M7 4h2v17H7zm4 0h2v17h-2zm4 0h2v17h-2z" fill="#fecaca" />
          <path d="M4 8h16v2H4zm0 7h16v2H4z" fill="#fca5a5" />
          <rect x="14" y="10" width="7" height="6" rx="1.5" fill="#ef4444" />
          <circle cx="17.5" cy="12.5" r="1" fill="#450a0a" />
          <path d="M17 12.5h1v2h-1z" fill="#450a0a" />
          <path d="M3 2h18v2H3z" fill="#fee2e2" />
        </g>
      )}
    </svg>
  );
}
