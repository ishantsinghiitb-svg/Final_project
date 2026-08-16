import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { aiErrorCopy, creditsReassurance } from "@/features/ai/errorMessages";
import { NeedMoreCreditsLink } from "./NeedMoreCredits";

// ── AI error notice (Module 6G) ──
//
// The one error surface for every AI feature. Takes the structured result
// `code` — never a raw server message — and renders the mapped headline, the
// what-to-do line, the confirmed "no credit was used" reassurance, and a retry
// button when retrying could actually help.
//
// The out-of-credits case is not really an error, so it gets the upgrade link
// instead of a retry button: retrying would fail identically and waste a click.

export function AIErrorNotice({
  code,
  creditsRefunded,
  onRetry,
  retryLabel = "Try again",
  retrying = false,
  className,
  compact = false,
}: {
  /** Structured result code from the AI envelope. `undefined` → generic copy. */
  code: string | undefined;
  /** From the AI envelope. Only `true` produces the reassurance line. */
  creditsRefunded?: boolean;
  /** Omit to hide the retry button even for retryable codes. */
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  className?: string;
  /** Drops the body line — for rows and other tight spots. */
  compact?: boolean;
}) {
  const copy = aiErrorCopy(code);
  const reassurance = creditsReassurance(creditsRefunded);
  const outOfCredits = code === "ai_limit_reached";
  const showRetry = Boolean(onRetry) && copy.retryable;

  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border px-3.5 py-3",
        outOfCredits
          ? "border-[#F59E0B]/25 bg-[#F59E0B]/[0.06]"
          : "border-[#F43F5E]/20 bg-[#F43F5E]/[0.05]",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            outOfCredits ? "text-[#B45309]" : "text-[#E11D48]",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[oklch(0.25_0.02_265)]">{copy.title}</p>

          {!compact && (
            <p className="mt-0.5 text-xs leading-relaxed text-[oklch(0.45_0.02_265)]">
              {copy.body}
              {reassurance && (
                <>
                  {" "}
                  <span className="font-medium text-[oklch(0.35_0.02_265)]">{reassurance}</span>
                </>
              )}
            </p>
          )}

          {(showRetry || outOfCredits) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {showRetry && (
                <button
                  onClick={onRetry}
                  disabled={retrying}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-[oklch(0.3_0.02_265)] transition-colors hover:bg-black/[0.03] disabled:opacity-60"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} />
                  {retryLabel}
                </button>
              )}
              {outOfCredits && <NeedMoreCreditsLink variant="primary" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
