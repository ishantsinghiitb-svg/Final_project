import { createServerFn } from "@tanstack/react-start";
import { STORAGE_BUCKETS, PARSEABLE_RESUME_TYPES } from "@/constants";
import type { Json } from "@/types/database";
import type { ResumeHealth } from "@/features/ai/schemas";
import { RESUME_PARSER_VERSION } from "@/features/ai/constants";
import { requireUser, type ServerSupabase } from "@/server/supabase";
import { parseResumeFile } from "@/server/ai/ResumeParser";

// ── parseResume server function (Module 6A) ──
//
// This file lives OUTSIDE src/server/** on purpose: the project's Vite config
// (@lovable.dev/vite-tanstack-config) blocks any client import whose path
// contains a "server" directory segment (importProtection.client.files:
// "**/server/**"). createServerFn entry points that the CLIENT calls directly
// must therefore be defined here — the framework's own compiler still splits
// the .handler() closure (and everything it imports from src/server/**) into
// the server-only bundle; the client only ever receives an RPC stub.
//
// Runs on the Cloudflare Worker. Deterministic parse pipeline (no AI):
//   auth → load resume (RLS) → reuse-by-file-hash OR download+parse →
//   persist resume_parsed + resumes.parse_status.
// Identical file already parsed for this user → reuse (no re-parse).

type ParseResumeInput = { accessToken: string; resumeId: string };

type ParseResumeResult =
  | { ok: true; reused: boolean; parseStatus: "ready"; health: ResumeHealth }
  | { ok: false; code: string; parseStatus: "failed" | "pending"; message: string };

export const parseResume = createServerFn({ method: "POST" })
  .validator((data: ParseResumeInput) => data)
  .handler(async ({ data }): Promise<ParseResumeResult> => {
    const { supabase, user } = await requireUser(data.accessToken);

    const { data: resume, error } = await supabase
      .from("resumes")
      .select("id, file_url, file_name, file_hash, file_size_bytes, mime_type")
      .eq("id", data.resumeId)
      .maybeSingle();
    if (error) throw error;
    if (!resume) {
      return { ok: false, code: "not_found", parseStatus: "pending", message: "Resume not found." };
    }

    const mimeType = resume.mime_type ?? "application/pdf";
    if (!PARSEABLE_RESUME_TYPES.includes(mimeType)) {
      await supabase
        .from("resumes")
        .update({
          parse_status: "failed",
          parse_error: "Only PDF resumes are parsed in this release.",
        })
        .eq("id", resume.id);
      return {
        ok: false,
        code: "unsupported_type",
        parseStatus: "failed",
        message: "Only PDF resumes are parsed in this release.",
      };
    }

    // ── Reuse-by-hash: identical file already parsed for this user ──
    // Only reuse a parse produced by the CURRENT parser version — this makes
    // already-uploaded resumes self-heal (re-parse for real) the next time
    // this runs after a parser fix/improvement, instead of forever re-serving
    // a stale (possibly incorrect) cached analysis.
    if (resume.file_hash) {
      const { data: existing } = await supabase
        .from("resume_parsed")
        .select(
          "parser_version, raw_text, structured, health, parse_confidence, char_count, token_estimate",
        )
        .eq("user_id", user.id)
        .eq("resume_file_hash", resume.file_hash)
        .eq("parser_version", RESUME_PARSER_VERSION)
        .not("structured", "is", null)
        .limit(1)
        .maybeSingle();

      if (existing && existing.structured) {
        await supabase.from("resume_parsed").upsert(
          {
            resume_id: resume.id,
            user_id: user.id,
            resume_file_hash: resume.file_hash,
            parser_version: existing.parser_version,
            raw_text: existing.raw_text,
            structured: existing.structured,
            health: existing.health,
            parse_confidence: existing.parse_confidence,
            char_count: existing.char_count,
            token_estimate: existing.token_estimate,
          },
          { onConflict: "resume_id" },
        );
        const pageCount = readPageCount(existing.health);
        await markReady(supabase, resume.id, pageCount);
        return {
          ok: true,
          reused: true,
          parseStatus: "ready",
          health: existing.health as unknown as ResumeHealth,
        };
      }
    }

    // ── Download + parse ──
    await supabase
      .from("resumes")
      .update({ parse_status: "processing", parse_error: null })
      .eq("id", resume.id);

    try {
      if (!resume.file_url) throw new Error("Resume has no uploaded file to parse.");

      const { data: blob, error: dlErr } = await supabase.storage
        .from(STORAGE_BUCKETS.RESUMES)
        .download(resume.file_url);
      if (dlErr || !blob) throw dlErr ?? new Error("Failed to download resume file.");

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const result = await parseResumeFile({
        bytes,
        mimeType,
        fileSizeBytes: resume.file_size_bytes ?? bytes.byteLength,
      });

      await supabase.from("resume_parsed").upsert(
        {
          resume_id: resume.id,
          user_id: user.id,
          resume_file_hash: resume.file_hash ?? null,
          parser_version: result.parserVersion,
          raw_text: result.rawText,
          structured: result.structured as unknown as Json,
          health: result.health as unknown as Json,
          parse_confidence: result.parseConfidence,
          char_count: result.charCount,
          token_estimate: result.tokenEstimate,
        },
        { onConflict: "resume_id" },
      );

      await supabase
        .from("resumes")
        .update({
          parse_status: "ready",
          parse_error: null,
          page_count: result.health.metrics.pageCount,
          parsed_at: new Date().toISOString(),
        })
        .eq("id", resume.id);

      return { ok: true, reused: false, parseStatus: "ready", health: result.health };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("resumes")
        .update({ parse_status: "failed", parse_error: message })
        .eq("id", resume.id);
      return { ok: false, code: "parse_error", parseStatus: "failed", message };
    }
  });

function readPageCount(health: Json | null): number | null {
  if (health && typeof health === "object" && !Array.isArray(health)) {
    const metrics = (health as Record<string, unknown>).metrics;
    if (metrics && typeof metrics === "object") {
      const pc = (metrics as Record<string, unknown>).pageCount;
      if (typeof pc === "number") return pc;
    }
  }
  return null;
}

async function markReady(
  sb: ServerSupabase,
  resumeId: string,
  pageCount: number | null,
): Promise<void> {
  await sb
    .from("resumes")
    .update({
      parse_status: "ready",
      parse_error: null,
      page_count: pageCount,
      parsed_at: new Date().toISOString(),
    })
    .eq("id", resumeId);
}
