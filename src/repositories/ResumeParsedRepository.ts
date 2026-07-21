import type { z } from "zod";
import { supabase } from "@/lib/supabase";
import {
  ResumeHealthSchema,
  StructuredResumeSchema,
  type ResumeHealth,
  type StructuredResume,
} from "@/features/ai/schemas";

// ── ResumeParsedRepository (Module 6A) ──
// Read access to the deterministic parse output (structured resume + health).

export type ResumeParsed = {
  resumeId: string;
  parserVersion: string;
  structured: StructuredResume | null;
  health: ResumeHealth | null;
  parseConfidence: number | null;
  charCount: number | null;
  tokenEstimate: number | null;
  rawText: string | null;
  updatedAt: string;
};

function safeParse<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (value == null) return null;
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

export class ResumeParsedRepository {
  async findByResumeId(resumeId: string): Promise<ResumeParsed | null> {
    const { data, error } = await supabase
      .from("resume_parsed")
      .select(
        "resume_id, parser_version, structured, health, parse_confidence, char_count, token_estimate, raw_text, updated_at",
      )
      .eq("resume_id", resumeId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return {
      resumeId: data.resume_id,
      parserVersion: data.parser_version,
      structured: safeParse(StructuredResumeSchema, data.structured),
      health: safeParse(ResumeHealthSchema, data.health),
      parseConfidence: data.parse_confidence,
      charCount: data.char_count,
      tokenEstimate: data.token_estimate,
      rawText: data.raw_text,
      updatedAt: data.updated_at,
    };
  }
}
