import { createServerFn } from "@tanstack/react-start";
import type { AICreditStatus } from "@/features/ai/types";
import { requireUser } from "@/server/supabase";
import { AICreditService } from "@/server/ai/AICreditService";

// ── AI credit server function (Module 6A) ──
//
// This file lives OUTSIDE src/server/** on purpose: the project's Vite config
// blocks any client import whose path contains a "server" directory segment
// (importProtection.client.files: "**/server/**"). createServerFn entry points
// the CLIENT calls directly must be defined here — see src/server-functions/resume.ts
// for the full rationale.
//
// getAICredits exposes the caller's credit balance so the frontend can detect
// exhaustion / show an upgrade screen later. No AI generation ships in 6A —
// the AIService.runCapability engine is ready but not wired to a server
// function until 6B.

type CreditsInput = { accessToken: string };

export const getAICredits = createServerFn({ method: "POST" })
  .validator((data: CreditsInput) => data)
  .handler(async ({ data }): Promise<AICreditStatus> => {
    const { supabase } = await requireUser(data.accessToken);
    return new AICreditService(supabase).getStatus();
  });
