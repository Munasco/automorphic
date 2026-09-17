import { useEffect, useState } from "react";

function prepareDocument(html: string, assetUrl: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  // Resolve sibling assets against the signed file URL, never the app route.
  const base = document.createElement("base");
  base.href = assetUrl;
  document.head.prepend(base);
  // Fragment links must stay in this srcdoc instead of navigating to the asset.
  for (const link of document.querySelectorAll('a[href^="#"]')) {
    link.setAttribute("href", `about:srcdoc${link.getAttribute("href")}`);
  }
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

/** Fetch through the app, then render in an opaque-origin sandbox. */
export function HtmlDocumentPreview({ src, title }: { src: string; title: string }) {
  const [result, setResult] = useState<{ key: string; document: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([src, attempt]);
  const current = result?.key === requestKey ? result : null;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(src, { signal: controller.signal, credentials: "omit", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load preview");
        const html = await response.text();
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, document: prepareDocument(html, src) });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key: requestKey, document: null });
      });
    return () => controller.abort();
  }, [src, requestKey]);

  if (current?.document === null) {
    return (
      <div
        role="alert"
        className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
      >
        <p>Unable to load this preview.</p>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-foreground hover:bg-accent"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Retry
        </button>
      </div>
    );
  }
  if (current === null) {
    return (
      <div
        role="status"
        className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
      >
        Loading preview…
      </div>
    );
  }
  return (
    <iframe
      title={title}
      srcDoc={current.document ?? undefined}
      className="min-h-0 w-full flex-1 border-0 bg-background"
      sandbox="allow-scripts allow-forms allow-popups allow-modals"
    />
  );
}
