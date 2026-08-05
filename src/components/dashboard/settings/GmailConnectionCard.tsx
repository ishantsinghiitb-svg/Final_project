import { useEffect } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, ShieldCheck, FlaskConical, RotateCcw } from "lucide-react";
import { DashCard, Chip } from "@/components/dashboard/primitives";
import {
  useGmailConnection,
  useGmailConnectUrl,
  useDisconnectGmail,
  useSyncGmailNow,
  useUpdateGmailAutoSync,
  useRebuildGmailSuggestions,
} from "@/features/gmail/hooks";

const CALLBACK_MESSAGES: Record<string, { tone: "success" | "error"; text: string }> = {
  connected: { tone: "success", text: "Gmail connected." },
  access_denied: { tone: "error", text: "Gmail connection was cancelled." },
  invalid_state: { tone: "error", text: "That connection link expired — please try again." },
  token_exchange_failed: {
    tone: "error",
    text: "Couldn't complete the Gmail connection. Please try again.",
  },
  connection_failed: {
    tone: "error",
    text: "Something went wrong connecting Gmail. Please try again.",
  },
};

/** Reads the one-shot `?gmail=` redirect flag from the OAuth callback and cleans it out of the URL so a refresh doesn't re-toast. */
function useGmailCallbackToast() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("gmail");
    if (!outcome) return;

    const message = CALLBACK_MESSAGES[outcome];
    if (message) {
      if (message.tone === "success") toast.success(message.text);
      else toast.error(message.text);
    }

    params.delete("gmail");
    const next = params.toString();
    window.history.replaceState(null, "", next ? `?${next}` : window.location.pathname);
  }, []);
}

type StatusTone = "green" | "amber" | "rose" | "default" | "blue";
const statusLabel: Record<string, { label: string; tone: StatusTone }> = {
  connected: { label: "Connected", tone: "green" },
  syncing: { label: "Syncing…", tone: "blue" },
  disconnected: { label: "Not connected", tone: "default" },
  error: { label: "Sync error", tone: "amber" },
  needs_reauth: { label: "Needs reconnect", tone: "rose" },
};

export function GmailConnectionCard() {
  useGmailCallbackToast();

  const { data: connection, isLoading } = useGmailConnection();
  const connectUrl = useGmailConnectUrl();
  const disconnect = useDisconnectGmail();
  const syncNow = useSyncGmailNow();
  const updateAutoSync = useUpdateGmailAutoSync();

  const isConnected = Boolean(connection) && connection?.status !== "disconnected";
  const status = connection
    ? (statusLabel[connection.status] ?? statusLabel.disconnected)
    : statusLabel.disconnected;

  async function handleSyncNow() {
    const result = await syncNow.mutateAsync();
    if (result.status === "synced") {
      toast.success(
        result.suggestionsCreated > 0
          ? `Sync complete — ${result.suggestionsCreated} new update${result.suggestionsCreated === 1 ? "" : "s"} to review.`
          : "Sync complete — nothing new.",
      );
    } else if (result.status === "skipped" && result.reason === "needs_reauth") {
      toast.error("Gmail access was revoked — please reconnect.");
    } else if (result.status === "error") {
      toast.error(result.message);
    }
  }

  async function handleDisconnect() {
    const result = await disconnect.mutateAsync();
    if (result.ok) toast.success("Gmail disconnected.");
    else toast.error(result.message);
  }

  function handleConnect() {
    // Errors from getGmailConnectUrl (e.g. a missing server-only Google env
    // var) surface here — without this the button previously failed
    // completely silently, since createServerFn failures render as an HTML
    // 500 page (src/start.ts's errorMiddleware), not a message this mutation
    // can read back verbatim; the real cause is always in the server log.
    connectUrl.mutate(undefined, {
      onError: () => {
        toast.error(
          "Couldn't start the Gmail connection. Check that Gmail integration is configured (Google OAuth env vars) and try again.",
        );
      },
    });
  }

  return (
    <DashCard>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display font-semibold">Gmail</p>
          <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
            Detect recruiter emails automatically and suggest updates — nothing is ever created or
            changed without your review.
          </p>
        </div>
        {!isLoading && (
          <Chip tone={status.tone as "green" | "amber" | "rose" | "default"}>{status.label}</Chip>
        )}
      </div>

      {isConnected && connection ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-black/5 bg-black/[0.015] px-3 py-2.5 text-xs text-[oklch(0.45_0.02_265)]">
            <p>
              Connected account:{" "}
              <span className="font-medium text-[oklch(0.25_0.02_265)]">
                {connection.google_email}
              </span>
            </p>
            <p className="mt-1">
              Last synced:{" "}
              {connection.last_synced_at
                ? new Date(connection.last_synced_at).toLocaleString()
                : "Never yet"}
            </p>
            {connection.status === "error" && connection.last_sync_error && (
              <p className="mt-1 text-[#B45309]">Last sync error: {connection.last_sync_error}</p>
            )}
            {connection.status === "needs_reauth" && (
              <p className="mt-1 text-[#E11D48]">
                Gmail access was revoked or expired — reconnect to keep syncing.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-black/5 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Auto Sync</p>
              <p className="text-xs text-[oklch(0.5_0.02_265)]">
                Check for new recruiter emails when you open NextOffer.
              </p>
            </div>
            <AutoSyncToggle
              on={connection.auto_sync_enabled}
              disabled={updateAutoSync.isPending}
              onToggle={(next) => updateAutoSync.mutate(next)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSyncNow}
              disabled={syncNow.isPending || connection.status === "needs_reauth"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium hover:bg-black/[0.03] disabled:opacity-50"
            >
              {syncNow.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Sync Now
            </button>
            {connection.status === "needs_reauth" ? (
              <button
                onClick={handleConnect}
                disabled={connectUrl.isPending}
                className="rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Reconnect
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                disabled={disconnect.isPending}
                className="rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium text-[#E11D48] hover:bg-[#E11D48]/5 disabled:opacity-50"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connectUrl.isPending || isLoading}
          className="mt-4 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {connectUrl.isPending ? "Redirecting…" : "Connect"}
        </button>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-lg bg-black/[0.015] px-3 py-2.5 text-[11px] leading-relaxed text-[oklch(0.5_0.02_265)]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[oklch(0.55_0.02_265)]" />
        <p>
          Read-only access — NextOffer can never modify or delete anything in your Gmail. Only
          job/recruiting-related emails are scanned; nothing is stored except a short snippet and
          the fields needed to suggest an update. Disconnect any time.
        </p>
      </div>

      {isConnected && <RebuildSuggestionsDevTool />}
    </DashCard>
  );
}

/**
 * DEVELOPMENT-ONLY tool. Deletes this user's Gmail suggestions and rebuilds
 * them by re-running the current classifier over already-stored messages —
 * no Gmail API call, no change to the OAuth connection or sync checkpoint.
 *
 * `import.meta.env.DEV` is statically false in a production build, so this
 * whole component is dropped at build time rather than merely hidden. The
 * server function enforces the same rule independently — the UI check is for
 * tidiness, not security.
 */
function RebuildSuggestionsDevTool() {
  const rebuild = useRebuildGmailSuggestions();
  if (!import.meta.env.DEV) return null;

  async function handleRebuild() {
    const result = await rebuild.mutateAsync();
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const { messagesScanned, suggestionsDeleted, suggestionsCreated, warnings } = result.outcome;
    toast.success(
      `Rebuilt from ${messagesScanned} stored email${messagesScanned === 1 ? "" : "s"} — removed ${suggestionsDeleted}, created ${suggestionsCreated} suggestion${suggestionsCreated === 1 ? "" : "s"}.`,
      { duration: 6000 },
    );
    if (warnings.length > 0) {
      // Most often an unapplied migration rejecting a new category value —
      // worth showing verbatim rather than swallowing.
      toast.error(`${warnings.length} warning(s). First: ${warnings[0]}`, { duration: 10000 });
      console.warn("[Rebuild Gmail Suggestions] warnings:", warnings);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-[#F59E0B]/40 bg-[#F59E0B]/[0.04] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[#B45309]">
            <FlaskConical className="h-3.5 w-3.5" />
            Rebuild Gmail Suggestions
            <span className="rounded bg-[#B45309]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              Dev only
            </span>
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[oklch(0.45_0.02_265)]">
            Re-runs the current classifier over emails already stored locally and regenerates
            suggestions. Does not call Gmail, does not delete stored emails, and keeps your
            connection and sync position intact. Accuracy is lower than a real sync — only the
            subject and snippet are stored, so dates, attachments and recruiter names are usually
            unavailable.
          </p>
        </div>
        <button
          onClick={handleRebuild}
          disabled={rebuild.isPending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#B45309]/20 bg-white px-3 py-1.5 text-xs font-medium text-[#B45309] hover:bg-[#F59E0B]/10 disabled:opacity-50"
        >
          {rebuild.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          {rebuild.isPending ? "Rebuilding…" : "Rebuild"}
        </button>
      </div>
    </div>
  );
}

function AutoSyncToggle({
  on,
  disabled,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      onClick={() => onToggle(!on)}
      disabled={disabled}
      className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" : "bg-black/10"}`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}
