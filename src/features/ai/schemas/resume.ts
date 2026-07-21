import { z } from "zod";

// ── StructuredResume ──
//
// The deterministic output of the Resume Parser (PDF → text → structure). Also
// the canonical shape every future AI capability consumes as `ResumeContext`.
// Produced WITHOUT any AI in Module 6A (regex/heuristic extraction); AI-based
// enrichment can layer on later behind the same schema + a bumped
// parser_version — nothing downstream changes.

export const ResumeContactSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  // Optional (not just nullable): added after the initial 6A release, so
  // resume_parsed rows written by the earlier parser won't have these keys at
  // all. Optional lets those legacy rows still validate — they just show no
  // linkedin/github/portfolio until the resume is reparsed — instead of the
  // whole `structured` blob failing validation and hiding name/email/skills too.
  linkedin: z.string().nullable().optional(),
  github: z.string().nullable().optional(),
  portfolio: z.string().nullable().optional(), // personal site (first non-linkedin, non-github link)
  links: z.array(z.string()), // every detected link (including linkedin/github/portfolio) — catch-all
});

export const ResumeSectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
});

export const StructuredResumeSchema = z.object({
  contact: ResumeContactSchema,
  summary: z.string().nullable(),
  sections: z.array(ResumeSectionSchema),
  skills: z.array(z.string()),
  detectedSections: z.array(z.string()), // normalized section keys found
  wordCount: z.number(),
  charCount: z.number(),
});

export type ResumeContact = z.infer<typeof ResumeContactSchema>;
export type ResumeSection = z.infer<typeof ResumeSectionSchema>;
export type StructuredResume = z.infer<typeof StructuredResumeSchema>;

// ── ResumeHealth ──
//
// A deterministic quality report generated immediately after parsing. NOT an
// AI feature — pure heuristics (presence of email/phone, page count, file
// size, expected sections, parse confidence).

export const ResumeHealthCheckStatus = z.enum(["pass", "warn", "fail"]);

export const ResumeHealthCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: ResumeHealthCheckStatus,
  detail: z.string().nullable(),
});

export const ResumeHealthSchema = z.object({
  score: z.number(), // 0–100 heuristic
  status: z.enum(["good", "warnings", "poor"]),
  checks: z.array(ResumeHealthCheckSchema),
  missing: z.array(z.string()), // human-readable missing items
  metrics: z.object({
    pageCount: z.number().nullable(),
    fileSizeBytes: z.number().nullable(),
    wordCount: z.number(),
    charCount: z.number(),
    parseConfidence: z.number(), // 0–1
  }),
  generatedAt: z.string(),
});

export type ResumeHealthCheck = z.infer<typeof ResumeHealthCheckSchema>;
export type ResumeHealth = z.infer<typeof ResumeHealthSchema>;

// Full parser output persisted to resume_parsed.
export const ResumeParseResultSchema = z.object({
  parserVersion: z.string(),
  rawText: z.string(),
  structured: StructuredResumeSchema,
  health: ResumeHealthSchema,
  parseConfidence: z.number(),
  charCount: z.number(),
  tokenEstimate: z.number(),
});

export type ResumeParseResult = z.infer<typeof ResumeParseResultSchema>;
