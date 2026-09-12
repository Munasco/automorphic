import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  dismissThreadErrorBannerForSession,
  getThreadErrorBannerKey,
  hasRecoveredProviderProcessError,
  isThreadErrorBannerDismissedForSession,
  shouldShowThreadErrorBanner,
  ThreadErrorBanner,
} from "./ThreadErrorBanner";

describe("ThreadErrorBanner", () => {
  it("stays hidden after its current error is dismissed", () => {
    const bannerKey = getThreadErrorBannerKey("env:thread-a", "Aborted");
    dismissThreadErrorBannerForSession(bannerKey);

    expect(
      shouldShowThreadErrorBanner(
        "env:thread-a",
        "Aborted",
        isThreadErrorBannerDismissedForSession(bannerKey),
      ),
    ).toBe(false);
  });

  it("reappears when a new error arrives on the same thread", () => {
    dismissThreadErrorBannerForSession(getThreadErrorBannerKey("env:thread-b", "Turn failed"));
    const newErrorKey = getThreadErrorBannerKey("env:thread-b", "Provider crashed");

    expect(isThreadErrorBannerDismissedForSession(newErrorKey)).toBe(false);
    expect(
      shouldShowThreadErrorBanner(
        "env:thread-b",
        "Provider crashed",
        isThreadErrorBannerDismissedForSession(newErrorKey),
      ),
    ).toBe(true);
  });

  it("scopes dismissals to the thread that dismissed them", () => {
    dismissThreadErrorBannerForSession(getThreadErrorBannerKey("env:thread-c", "Aborted"));
    const otherThreadKey = getThreadErrorBannerKey("env:other-thread", "Aborted");

    expect(isThreadErrorBannerDismissedForSession(otherThreadKey)).toBe(false);
    expect(
      shouldShowThreadErrorBanner(
        "env:other-thread",
        "Aborted",
        isThreadErrorBannerDismissedForSession(otherThreadKey),
      ),
    ).toBe(true);
  });

  it("keeps a dismissal across visiting threads with no error", () => {
    const bannerKey = getThreadErrorBannerKey("env:thread-d", "Aborted");
    dismissThreadErrorBannerForSession(bannerKey);

    expect(shouldShowThreadErrorBanner("env:thread-d", null, false)).toBe(false);
    expect(isThreadErrorBannerDismissedForSession(bannerKey)).toBe(true);
    expect(
      shouldShowThreadErrorBanner(
        "env:thread-d",
        "Aborted",
        isThreadErrorBannerDismissedForSession(bannerKey),
      ),
    ).toBe(false);
  });

  it("never shows a null error", () => {
    expect(shouldShowThreadErrorBanner("env:thread-e", null, false)).toBe(false);
  });
  it("aligns the warning and dismiss icons with the first line of a multi-line error", () => {
    const markup = renderToStaticMarkup(
      <ThreadErrorBanner
        error={"The first error line\ncontinues on a second line"}
        onDismiss={() => {}}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-label="Dismiss error"');
    expect(markup).not.toContain("controlAlignment");
    expect(markup).toContain("flex gap-2 items-start");
    expect(markup).toContain("min-h-7 pt-1 sm:min-h-6 sm:pt-0.5");
    expect(markup).toContain("h-lh w-4");
    expect(markup).toContain("h-lh self-start");
  });
});

describe("provider process error recovery", () => {
  const error = {
    message: "Provider adapter process error (codex): spawn failed",
    at: Date.parse("2026-09-12T03:05:40Z"),
  };
  const healthy = {
    session: { status: "ready", lastError: null },
    latestTurn: { state: "completed", completedAt: "2026-09-12T03:05:48Z" },
  };
  it("clears a launch error only after a later successful turn is confirmed", () => {
    expect(hasRecoveredProviderProcessError(error, healthy)).toBe(true);
    expect(hasRecoveredProviderProcessError(error, { ...healthy, latestTurn: null })).toBe(false);
    expect(
      hasRecoveredProviderProcessError(error, {
        ...healthy,
        latestTurn: { state: "running", completedAt: null },
      }),
    ).toBe(false);
  });
  it("retains newer failures and active server errors", () => {
    expect(
      hasRecoveredProviderProcessError(
        { ...error, at: Date.parse("2026-09-12T03:05:49Z") },
        healthy,
      ),
    ).toBe(false);
    expect(
      hasRecoveredProviderProcessError(error, {
        ...healthy,
        session: { status: "error", lastError: "provider exited" },
      }),
    ).toBe(false);
    expect(
      hasRecoveredProviderProcessError(error, {
        ...healthy,
        session: { status: "ready", lastError: "provider exited" },
      }),
    ).toBe(false);
    expect(
      hasRecoveredProviderProcessError(error, {
        ...healthy,
        latestTurn: { ...healthy.latestTurn, state: "error" },
      }),
    ).toBe(false);
  });
  it("does not dismiss other operation errors or infer recovery from invalid timestamps", () => {
    expect(
      hasRecoveredProviderProcessError(
        { ...error, message: "Failed to upload attachment" },
        healthy,
      ),
    ).toBe(false);
    expect(
      hasRecoveredProviderProcessError(error, {
        ...healthy,
        latestTurn: { ...healthy.latestTurn, completedAt: "invalid" },
      }),
    ).toBe(false);
  });
});
