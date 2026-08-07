import { useEffect } from "react";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  ShieldCheck,
  FlaskConical,
  RotateCcw,
  Mail,
  CalendarDays,
} from "lucide-react";
import { DashCard, Chip } from "@/components/dashboard/primitives";
import {
  useGoogleConnection,
  useConnectGoogleProduct,
  useDisconnectGoogleProduct,
  useUpdateGoogleAutoSync,
  useSyncGoogleNow,
} from "@/features/google/hooks";
import { useRebuildGmailSuggestions } from "@/features/gmail/hooks";
import { useRebuildCalendarEvents } from "@/features/calendar/hooks";
import { combinedSyncOutcomeMessage } from "@/features/google/syncOutcome";
import type { GoogleProduct } from "@/repositories/GoogleConnectionRepository";
import type { GoogleProductStatus } from "@/features/gmail/types";

// ── GoogleConnectionCard (Module 9A/9B, sync unified in the Module 9 UX pass) ──
//
// One Google OAuth connection, two independently-connectable products —
// Gmail and Calendar share this one card (Q63: "Calendar should feel like a
// natural extension of Gmail Intelligence," not a second, bolted-on
// integration). Connect/Disconnect/Auto-Sync stay per-product (legitimate
// per-product settings); "Sync Now" is ONE combined button at the card's
// top level via useSyncGoogleNow — every sync button in the app calls that
// same hook, so there's no "which product am I syncing" decision left
// anywhere in the UI. Connecting one product never touches the other (see
// GoogleConnectionRepository.disconnectProduct's otherStillConnected logic —
// the shared refresh token is only revoked once both are disconnected).

const CALLBACK_MESSAGES: Record<string, { tone: "success" | "error"; text: string }> = {
  connected: { tone: "success", text: "Connected." },
  access_denied: { tone: "error", text: "Connection was cancelled." },
  invalid_state: { tone: "error", text: "That connection link expired — please try again." },
  token_exchange_failed: {
    tone: "error",
    text: "Couldn't complete the connection. Please try again.",
  },
  connection_failed: {
    tone: "error",
    text: "Something went wrong connecting. Please try again.",
  },
};

/** Reads the one-shot `?google=` redirect flag from the OAuth callback and cleans it out of the URL so a refresh doesn't re-toast. */
function useGoogleCallbackToast() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("google");
    if (!outcome) return;

    const message = CALLBACK_MESSAGES[outcome];
    if (message) {
      if (message.tone === "success") toast.success(message.text);
      else toast.error(message.text);
    }

    params.delete("google");
    const next = params.toString();
    window.history.replaceState(null, "", next ? `?${next}` : window.location.pathname);
  }, []);
}

type StatusTone = "green" | "amber" | "rose" | "default" | "blue";
const statusLabel: Record<GoogleProductStatus, { label: string; tone: StatusTone }> = {
  connected: { label: "Connected", tone: "green" },
  syncing: { label: "Syncing…", tone: "blue" },
  disconnected: { label: "Not connected", tone: "default" },
  error: { label: "Sync error", tone: "amber" },
  needs_reauth: { label: "Needs reconnect", tone: "rose" },
};

export function GoogleConnectionCard() {
  useGoogleCallbackToast();

  const { data: connection, isLoading } = useGoogleConnection();
  const { syncNow, isPending: syncPending } = useSyncGoogleNow();

  const anyConnected =
    Boolean(connection) &&
    (connection?.gmail_status !== "disconnected" || connection?.calendar_status !== "disconnected");
  const needsReauth =
    connection?.gmail_status === "needs_reauth" || connection?.calendar_status === "needs_reauth";

  async function handleSyncNow() {
    const { gmailResult, calendarResult } = await syncNow();
    const toastMsg = combinedSyncOutcomeMessage(gmailResult, calendarResult);
    if (toastMsg.tone === "success") toast.success(toastMsg.message);
    else toast.error(toastMsg.message);
  }

  return (
    <DashCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display font-semibold">Google</p>
          <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
            Detect recruiter emails and interview invites automatically — nothing is ever created or
            changed without your review.
          </p>
        </div>
        {anyConnected && (
          <button
            onClick={() => void handleSyncNow()}
            disabled={syncPending}
            title="Syncs every connected Google product together — the same action everywhere in NextOffer."
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium hover:bg-black/[0.03] disabled:opacity-50"
          >
            {syncPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Sync Now
          </button>
        )}
      </div>

      {needsReauth && (
        <p className="mt-2 text-xs text-[#E11D48]">
          Access was revoked or expired for one of your connections — reconnect below to keep
          syncing.
        </p>
      )}

      <div className="mt-4 divide-y divide-black/5">
        <ProductSection
          product="gmail"
          icon={Mail}
          title="Gmail"
          description="Scans job/recruiting-related emails only, stores a short snippet and the fields needed to suggest an update."
          connection={connection}
          isLoading={isLoading}
        />
        <ProductSection
          product="calendar"
          icon={CalendarDays}
          title="Calendar"
          description="Reads events that look like interviews — read-only, nothing is ever added, changed or removed from your calendar."
          connection={connection}
          isLoading={isLoading}
        />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg bg-black/[0.015] px-3 py-2.5 text-[11px] leading-relaxed text-[oklch(0.5_0.02_265)]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[oklch(0.55_0.02_265)]" />
        <p>
          Read-only access — NextOffer can never modify or delete anything in your Gmail or
          Calendar. Disconnect either one any time; disconnecting doesn't affect the other.
        </p>
      </div>
    </DashCard>
  );
}

type ConnectionData = ReturnType<typeof useGoogleConnection>["data"];

function ProductSection({
  product,
  icon: Icon,
  title,
  description,
  connection,
  isLoading,
}: {
  product: GoogleProduct;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  connection: ConnectionData;
  isLoading: boolean;
}) {
  const connectUrl = useConnectGoogleProduct();
  const disconnect = useDisconnectGoogleProduct();
  const updateAutoSync = useUpdateGoogleAutoSync(product);

  const status = product === "gmail" ? connection?.gmail_status : connection?.calendar_status;
  const autoSyncEnabled =
    product === "gmail"
      ? connection?.gmail_auto_sync_enabled
      : connection?.calendar_auto_sync_enabled;
  const lastSyncedAt =
    product === "gmail" ? connection?.gmail_last_synced_at : connection?.calendar_last_synced_at;
  const lastSyncError =
    product === "gmail" ? connection?.gmail_last_sync_error : connection?.calendar_last_sync_error;

  const isConnected = Boolean(status) && status !== "disconnected";
  const meta = status
    ? (statusLabel[status] ?? statusLabel.disconnected)
    : statusLabel.disconnected;

  async function handleDisconnect() {
    const result = await disconnect.mutateAsync(product);
    if (result.ok) toast.success(`${title} disconnected.`);
    else toast.error(result.message);
  }

  function handleConnect() {
    // Errors from getGoogleConnectUrl (e.g. a missing server-only Google env
    // var) surface here — without this the button previously failed
    // completely silently, since createServerFn failures render as an HTML
    // 500 page (src/start.ts's errorMiddleware), not a message this mutation
    // can read back verbatim; the real cause is always in the server log.
    connectUrl.mutate(product, {
      onError: () => {
        toast.error(
          `Couldn't start the ${title} connection. Check that Google integration is configured (Google OAuth env vars) and try again.`,
        );
      },
    });
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.45_0.02_265)]" />
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-0.5 text-xs text-[oklch(0.5_0.02_265)]">{description}</p>
          </div>
        </div>
        {!isLoading && <Chip tone={meta.tone}>{meta.label}</Chip>}
      </div>

      {isConnected && connection ? (
        <div className="mt-3 space-y-2.5 pl-6">
          <div className="rounded-lg border border-black/5 bg-black/[0.015] px-3 py-2 text-xs text-[oklch(0.45_0.02_265)]">
            <p>
              Connected account:{" "}
              <span className="font-medium text-[oklch(0.25_0.02_265)]">
                {connection.google_email}
              </span>
            </p>
            <p className="mt-1">
              Last synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "Never yet"}
            </p>
            {status === "error" && lastSyncError && (
              <p className="mt-1 text-[#B45309]">Last sync error: {lastSyncError}</p>
            )}
            {status === "needs_reauth" && (
              <p className="mt-1 text-[#E11D48]">
                Access was revoked or expired — reconnect to keep syncing.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-black/5 px-3 py-2">
            <div>
              <p className="text-xs font-medium">Auto Sync</p>
              <p className="text-[11px] text-[oklch(0.5_0.02_265)]">
                Check for updates when you open NextOffer.
              </p>
            </div>
            <AutoSyncToggle
              on={Boolean(autoSyncEnabled)}
              disabled={updateAutoSync.isPending}
              onToggle={(next) => updateAutoSync.mutate(next)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {status === "needs_reauth" ? (
              <button
                onClick={handleConnect}
                disabled={connectUrl.isPending}
                className="rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Reconnect
              </button>
            ) : (
              <button
                onClick={() => void handleDisconnect()}
                disabled={disconnect.isPending}
                className="rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium text-[#E11D48] hover:bg-[#E11D48]/5 disabled:opacity-50"
              >
                Disconnect
              </button>
            )}
          </div>

          {product === "gmail" ? <RebuildSuggestionsDevTool /> : <RebuildCalendarEventsDevTool />}
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connectUrl.isPending || isLoading}
          className="ml-6 mt-3 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {connectUrl.isPending ? "Redirecting…" : "Connect"}
        </button>
      )}
    </div>
  );
}

/**
 * DEVELOPMENT-ONLY tool. Deletes this user's Gmail-sourced suggestions and
 * rebuilds them by re-running the current classifier over already-stored
 * messages — no Gmail API call, no change to the OAuth connection or sync
 * checkpoint, never touches a calendar-sourced suggestion.
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
    <div className="rounded-lg border border-dashed border-[#F59E0B]/40 bg-[#F59E0B]/[0.04] px-3 py-2.5">
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
          onClick={() => void handleRebuild()}
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

/**
 * DEVELOPMENT-ONLY tool. Re-runs the current relevance/matching logic over
 * already-stored calendar_events — no Calendar API call, no change to the
 * OAuth connection or sync checkpoint. Mirrors RebuildSuggestionsDevTool's
 * shape and guard rationale exactly.
 */
function RebuildCalendarEventsDevTool() {
  const rebuild = useRebuildCalendarEvents();
  if (!import.meta.env.DEV) return null;

  async function handleRebuild() {
    const result = await rebuild.mutateAsync();
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const { eventsScanned, eventsReclassified, warnings } = result.outcome;
    toast.success(
      `Rescanned ${eventsScanned} stored event${eventsScanned === 1 ? "" : "s"} — updated ${eventsReclassified}.`,
      { duration: 6000 },
    );
    if (warnings.length > 0) {
      toast.error(`${warnings.length} warning(s). First: ${warnings[0]}`, { duration: 10000 });
      console.warn("[Rescan Calendar Events] warnings:", warnings);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-[#F59E0B]/40 bg-[#F59E0B]/[0.04] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[#B45309]">
            <FlaskConical className="h-3.5 w-3.5" />
            Rescan Calendar Events
            <span className="rounded bg-[#B45309]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              Dev only
            </span>
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[oklch(0.45_0.02_265)]">
            Re-runs the current relevance logic over events already stored locally. Does not call
            Calendar, does not delete stored events, and keeps your connection and sync position
            intact.
          </p>
        </div>
        <button
          onClick={() => void handleRebuild()}
          disabled={rebuild.isPending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#B45309]/20 bg-white px-3 py-1.5 text-xs font-medium text-[#B45309] hover:bg-[#F59E0B]/10 disabled:opacity-50"
        >
          {rebuild.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          {rebuild.isPending ? "Rescanning…" : "Rescan"}
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
