type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
  }
}

/** Endpoint that lands these reports in the Worker log stream — see src/server/clientErrors.ts. */
const CLIENT_ERROR_ENDPOINT = "/api/client-error";

/**
 * Fire-and-forget POST of the crash to our own server, so it is observable on
 * this self-hosted deployment.
 *
 * `window.__lovableEvents` below is injected ONLY by the Lovable preview
 * environment; on the deployed Cloudflare Worker that optional call no-ops and
 * every client crash used to be discarded silently. This adds the missing
 * destination without changing what the user sees — both callers
 * (routes/__root.tsx's ErrorComponent and components/shared/ErrorBoundary)
 * still render their existing friendly fallback UI.
 *
 * Sends `pathname` only, never `location.href`: query strings here can carry
 * OAuth `code`/`state` and analysis deep-link params. No token, email, or
 * profile data is included.
 *
 * Every failure path is swallowed — a reporter that throws would break the
 * very error UI it is reporting from.
 */
function sendClientErrorReport(error: unknown, context: Record<string, unknown>) {
  try {
    const err = error instanceof Error ? error : undefined;
    const body = JSON.stringify({
      name: err?.name ?? "Error",
      message: err?.message ?? String(error),
      stack: err?.stack ?? "",
      pathname: window.location.pathname,
      boundary: typeof context.boundary === "string" ? context.boundary : "unknown",
      userAgent: navigator.userAgent,
    });

    // sendBeacon survives an immediate unload (the common case when a render
    // crash is followed by the user navigating away); fetch+keepalive is the
    // fallback where it is unavailable or refuses the payload.
    const blob = new Blob([body], { type: "application/json" });
    if (
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(CLIENT_ERROR_ENDPOINT, blob)
    ) {
      return;
    }
    void fetch(CLIENT_ERROR_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never surface a second error to the user.
  }
}

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );

  sendClientErrorReport(error, context);
}
