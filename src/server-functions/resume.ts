import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/server/supabase";
import { parseResumeForUser, type ParseResumeResult } from "@/server/ai/ResumeUpload";

// ── parseResume server function (Module 6A; logic extracted to
// src/server/ai/ResumeUpload.ts in Module 6C so the extension's
// /api/extension/parse-resume route can reuse the exact same implementation) ──
//
// This file lives OUTSIDE src/server/** on purpose: the project's Vite config
// (@lovable.dev/vite-tanstack-config) blocks any client import whose path
// contains a "server" directory segment (importProtection.client.files:
// "**/server/**"). createServerFn entry points that the CLIENT calls directly
// must therefore be defined here — the framework's own compiler still splits
// the .handler() closure (and everything it imports from src/server/**) into
// the server-only bundle; the client only ever receives an RPC stub.

type ParseResumeInput = { accessToken: string; resumeId: string };

export const parseResume = createServerFn({ method: "POST" })
  .validator((data: ParseResumeInput) => data)
  .handler(async ({ data }): Promise<ParseResumeResult> => {
    const { supabase, user } = await requireUser(data.accessToken);
    return parseResumeForUser(supabase, user, data.resumeId);
  });
