import { useEffect, useState } from "react";
import { elapsedMs } from "../timer";
import type { MockInterviewSession } from "../types";

// ── useInterviewTimer (Module 7C) ──
//
// Ticks a re-render once a second while the session is active so the
// top-bar clock updates — but the DISPLAYED value is always recomputed from
// elapsedMs(session), never accumulated locally. Correct across refresh,
// pause/resume, and a backgrounded tab by construction (see timer.ts).

export function useInterviewTimer(
  session:
    Pick<MockInterviewSession, "status" | "elapsed_ms" | "last_resumed_at"> | null | undefined,
): number {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!session || session.status !== "active") return;
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
    // Deliberately keyed on status alone — restarting the interval on every
    // session refetch (elapsed_ms/last_resumed_at changing without a status
    // change) would be wasteful and isn't needed for correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status]);

  if (!session) return 0;
  return elapsedMs(session);
}
