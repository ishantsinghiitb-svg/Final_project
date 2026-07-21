import { extractText, getDocumentProxy } from "unpdf";
import {
  ResumeParseResultSchema,
  StructuredResumeSchema,
  type ResumeContact,
  type ResumeParseResult,
  type StructuredResume,
} from "@/features/ai/schemas";
import { RESUME_PARSER_VERSION } from "@/features/ai/constants";
import { generateResumeHealth } from "./ResumeHealth";

// ── Resume Parser (Module 6A · deterministic, independent of the AI engine) ──
//
//   PDF bytes → text (unpdf, Cloudflare-Worker friendly) → StructuredResume
//   → ResumeHealth. No AI. DOCX text extraction is deferred (6A parses PDF).
//
// ⚠️ Critical fix (post-6A refinement): `extractText(pdf, { mergePages: true })`
// collapses ALL whitespace — including every line break — into single spaces
// (`texts.join("\n").replace(/\s+/g, " ")`, see unpdf's source). That turned
// the entire resume into one giant "line", so the line-based section detector
// below could never find a heading short enough to match — sections/skills
// always came back empty regardless of content. Fixed by extracting per-page
// text WITHOUT merging (`mergePages` omitted/false preserves each page's
// internal line breaks) and joining pages ourselves with real newlines.

const SECTION_KEYWORDS: Record<string, string[]> = {
  summary: [
    "summary",
    "objective",
    "profile",
    "about me",
    "professional summary",
    "career summary",
  ],
  experience: [
    "experience",
    "work experience",
    "employment",
    "employment history",
    "professional experience",
    "work history",
    "relevant experience",
    "career history",
  ],
  education: ["education", "academic background", "educational background", "academics"],
  skills: [
    "skills",
    "technical skills",
    "core skills",
    "key skills",
    "core competencies",
    "technologies",
    "competencies",
    "skill set",
    "areas of expertise",
  ],
  projects: [
    "projects",
    "personal projects",
    "key projects",
    "selected projects",
    "academic projects",
  ],
  certifications: [
    "certifications",
    "certificates",
    "certification",
    "licenses",
    "licenses certifications",
  ],
  achievements: ["awards", "honors", "achievements", "accomplishments"],
  publications: ["publications"],
  languages: ["languages", "language proficiency"],
  volunteer: [
    "volunteer",
    "volunteering",
    "volunteer experience",
    "community",
    "community involvement",
  ],
};

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const GENERIC_URL_RE = /\b(?:https?:\/\/|www\.)[^\s,)\]]+/gi;
const LINKEDIN_RE =
  /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9\-_%]+\/?/i;
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9\-_]+\/?/i;
const NAME_STOPWORDS = /resume|curriculum vitae|\bcv\b/i;

export type ParseResumeInput = {
  bytes: Uint8Array;
  mimeType: string;
  fileSizeBytes: number | null;
};

export async function parseResumeFile(input: ParseResumeInput): Promise<ResumeParseResult> {
  if (input.mimeType !== "application/pdf") {
    throw new Error(
      `Unsupported file type for parsing: ${input.mimeType}. Only PDF is parsed in this release.`,
    );
  }

  const pdf = await getDocumentProxy(input.bytes);
  // Do NOT pass { mergePages: true } — see the note above. This returns one
  // string per page, each with real "\n" line breaks preserved.
  const { totalPages, text: pages } = await extractText(pdf);
  const rawText = pages.join("\n").replace(/\n{3,}/g, "\n\n");

  const structured = buildStructuredResume(rawText);
  const parseConfidence = computeConfidence(structured, rawText);

  const health = generateResumeHealth({
    structured,
    pageCount: totalPages ?? null,
    fileSizeBytes: input.fileSizeBytes,
    parseConfidence,
  });

  const result: ResumeParseResult = {
    parserVersion: RESUME_PARSER_VERSION,
    rawText,
    structured,
    health,
    parseConfidence,
    charCount: structured.charCount,
    tokenEstimate: Math.ceil(structured.charCount / 4),
  };

  // Validate our own deterministic output against the schema before persisting.
  return ResumeParseResultSchema.parse(result);
}

// ── Deterministic structure extraction ──

function buildStructuredResume(rawText: string): StructuredResume {
  const lines = rawText.split(/\r?\n/);
  const preamble: string[] = [];
  const sections: { heading: string; key: string; buffer: string[] }[] = [];
  let current: { heading: string; key: string; buffer: string[] } | null = null;

  for (const line of lines) {
    const key = detectHeading(line);
    if (key) {
      if (current) sections.push(current);
      current = { heading: line.trim(), key, buffer: [] };
    } else if (current) {
      current.buffer.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);

  const detectedSections = [...new Set(sections.map((s) => s.key))];
  const contact = extractContact(rawText, preamble);
  const summarySection = sections.find((s) => s.key === "summary");
  const skillsSection = sections.find((s) => s.key === "skills");

  const structured: StructuredResume = {
    contact,
    summary: summarySection ? cleanBlock(summarySection.buffer) || null : null,
    sections: sections.map((s) => ({ heading: s.heading, content: cleanBlock(s.buffer) })),
    skills: skillsSection ? extractSkills(skillsSection.buffer) : [],
    detectedSections,
    wordCount: rawText.split(/\s+/).filter(Boolean).length,
    charCount: rawText.length,
  };

  return StructuredResumeSchema.parse(structured);
}

/**
 * A heading line is short and, once stripped of punctuation/numbering/bullets,
 * either equals a known section keyword or starts with one (tolerating small
 * trailing decoration like "Skills & Tools" or "01. Work Experience").
 */
function detectHeading(line: string): string | null {
  const raw = line.trim();
  if (!raw || raw.length > 50) return null;

  const normalized = normalizeHeadingText(raw);
  if (!normalized) return null;

  for (const [key, keywords] of Object.entries(SECTION_KEYWORDS)) {
    if (keywords.some((keyword) => matchesHeading(normalized, keyword))) return key;
  }
  return null;
}

/** Lowercase, strip everything but letters (numbers/bullets/punctuation → space), collapse spaces. */
function normalizeHeadingText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function matchesHeading(normalized: string, keyword: string): boolean {
  if (normalized === keyword) return true;
  // Tolerate short trailing decoration only — "skills tools" matches "skills",
  // but a long sentence that merely contains the word does not.
  if (normalized.startsWith(`${keyword} `) && normalized.length - keyword.length <= 20) return true;
  return false;
}

function extractContact(rawText: string, preamble: string[]): ResumeContact {
  const preambleText = preamble.join("\n");

  const email = matchFirst(EMAIL_RE, preambleText) ?? matchFirst(EMAIL_RE, rawText);
  // Phone numbers are searched in the header block only — searching the whole
  // document risks matching unrelated digit runs (date ranges like
  // "2020-2023", employee/certification IDs) as a phone number.
  const phone = extractPhone(preambleText) ?? extractPhone(rawText);

  const linkedinRaw = matchFirst(LINKEDIN_RE, rawText);
  const githubRaw = matchFirst(GITHUB_RE, rawText);
  const linkedin = linkedinRaw ? normalizeUrl(linkedinRaw) : null;
  const github = githubRaw ? normalizeUrl(githubRaw) : null;

  const genericUrls = [...new Set((rawText.match(GENERIC_URL_RE) ?? []).map(cleanUrl))]
    .map(normalizeUrl)
    .filter((u) => !isLinkedinUrl(u) && !isGithubUrl(u));

  const portfolio = genericUrls[0] ?? null;
  const links = [
    ...new Set([linkedin, github, ...genericUrls].filter((u): u is string => Boolean(u))),
  ].slice(0, 10);

  const name = detectName(preamble);
  const location = detectLocation(preamble);

  return { name, email, phone, location, linkedin, github, portfolio, links };
}

function matchFirst(re: RegExp, text: string): string | null {
  return text.match(re)?.[0] ?? null;
}

function extractPhone(text: string): string | null {
  return text.match(PHONE_RE)?.[0]?.trim() ?? null;
}

function isLinkedinUrl(url: string): boolean {
  return /linkedin\.com/i.test(url);
}

function isGithubUrl(url: string): boolean {
  return /github\.com/i.test(url);
}

function cleanUrl(url: string): string {
  return url.replace(/[.,;:)\]]+$/g, "");
}

function normalizeUrl(url: string): string {
  const trimmed = cleanUrl(url);
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function detectName(preamble: string[]): string | null {
  for (const raw of preamble) {
    const line = raw.trim();
    if (!line || NAME_STOPWORDS.test(line)) continue;
    if (EMAIL_RE.test(line) || PHONE_RE.test(line) || /https?:|www\./i.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && /^[A-Za-z][A-Za-z.'-]*$/.test(words[0])) {
      return line;
    }
  }
  return null;
}

function detectLocation(preamble: string[]): string | null {
  for (const raw of preamble) {
    const m = raw.match(/\b([A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+)*),\s*([A-Z]{2}|[A-Z][a-z]+)\b/);
    if (m) return m[0];
  }
  return null;
}

function extractSkills(buffer: string[]): string[] {
  const joined = buffer.join("\n");
  const parts = joined
    .split(/[\n,•·|/]+/)
    .map((s) => s.replace(/^[\s\-–—*]+/, "").trim())
    .filter((s) => s.length >= 1 && s.length <= 40);
  return [...new Set(parts)].slice(0, 60);
}

function cleanBlock(buffer: string[]): string {
  return buffer
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();
}

function computeConfidence(structured: StructuredResume, rawText: string): number {
  let score = rawText.length >= 400 ? 0.45 : 0.15;
  score += Math.min(structured.detectedSections.length, 4) * 0.08;
  if (structured.contact.email) score += 0.1;
  if (structured.contact.phone) score += 0.05;
  if (structured.contact.name) score += 0.05;
  if (structured.skills.length > 0) score += 0.07;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}
