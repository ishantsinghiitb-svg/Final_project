import { Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw, Sparkles } from "lucide-react";
import { aiErrorCopy } from "@/features/ai/errorMessages";

// ── ConcludingScreen (Module 7C) ──
//
// Shown between the interview ending (by the candidate or the AI) and the
// report being ready — honest about what's happening, never a promise the
// result is a second away, since a real report generation call takes
// meaningful time.

export function ConcludingScreen({
  hasError,
  attemptsExhausted,
  interviewId,
  onRetry,
}: {
  hasError: boolean;
  /** True once the server's retry cap is hit — retrying again would fail identically. */
  attemptsExhausted: boolean;
  /** This screen sits on a chrome-less full-screen route (no top bar, no back link) — the
   *  exit path below is the only way out once attemptsExhausted makes retrying pointless. */
  interviewId: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="relative grid h-12 w-12 place-items-center">
        <span className="absolute inset-0 rounded-full bg-gradient-to-br from-[#2563EB]/30 to-[#7C3AED]/40 animate-ai-breathe" />
        <Sparkles className="relative h-5 w-5 text-white" />
      </div>
      {hasError && attemptsExhausted ? (
        <>
          <p className="font-display text-lg font-semibold text-white">
            {aiErrorCopy("report_attempts_exhausted").title}
          </p>
          <p className="max-w-sm text-sm text-white/50">
            {aiErrorCopy("report_attempts_exhausted").body} Your full transcript is safe and isn't
            going anywhere.
          </p>
          <Link
            to="/dashboard/interviews/$interviewId"
            params={{ interviewId }}
            className="mt-2 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" /> Back to interview details
          </Link>
        </>
      ) : hasError ? (
        <>
          <p className="font-display text-lg font-semibold text-white">
            We hit a snag putting your report together
          </p>
          <p className="max-w-sm text-sm text-white/50">
            Your full transcript is safe. Let's try generating the report again.
          </p>
          <button
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </>
      ) : (
        <>
          <p className="font-display text-lg font-semibold text-white">Interview completed.</p>
          <p className="max-w-sm text-sm text-white/50">
            Generating your personalized interview report — this usually takes a few moments.
          </p>
        </>
      )}
    </div>
  );
}
