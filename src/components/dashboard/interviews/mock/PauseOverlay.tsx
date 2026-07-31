import { Play } from "lucide-react";

// ── PauseOverlay (Module 7C) ──
//
// Deliberately hides the current question while paused — otherwise pause
// would just be "unlimited thinking time with the question still visible",
// undermining the point of pausing being a real break, not a stalling tactic.

export function PauseOverlay({
  elapsedDisplay,
  onResume,
  isResuming,
}: {
  elapsedDisplay: string;
  onResume: () => void;
  isResuming: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-display text-lg font-semibold text-white">Interview paused</p>
      <p className="text-sm text-white/50">
        Elapsed so far: <span className="font-mono text-white/70">{elapsedDisplay}</span>. Take your
        time — nothing here is timed against you while paused.
      </p>
      <button
        onClick={onResume}
        disabled={isResuming}
        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px disabled:opacity-60"
      >
        <Play className="h-4 w-4" /> Resume interview
      </button>
    </div>
  );
}
