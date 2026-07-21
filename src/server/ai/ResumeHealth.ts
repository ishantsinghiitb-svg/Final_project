import type { ResumeHealth, ResumeHealthCheck, StructuredResume } from "@/features/ai/schemas";

// ── Resume Health (Module 6A · deterministic, NOT an AI feature) ──
//
// Generated immediately after parsing. Pure heuristics over the parsed output:
// presence of email/phone, page count, file size, expected sections, and a
// parse-confidence signal.

const MIN_MEANINGFUL_CHARS = 400;
const MAX_RECOMMENDED_PAGES = 2;
const MAX_RECOMMENDED_BYTES = 5 * 1024 * 1024;

type HealthInput = {
  structured: StructuredResume;
  pageCount: number | null;
  fileSizeBytes: number | null;
  parseConfidence: number;
};

export function generateResumeHealth(input: HealthInput): ResumeHealth {
  const { structured, pageCount, fileSizeBytes, parseConfidence } = input;
  const checks: ResumeHealthCheck[] = [];
  const missing: string[] = [];

  // Contact
  checks.push(
    boolCheck(
      "email",
      "Email address",
      structured.contact.email != null,
      "No email address detected",
    ),
  );
  if (structured.contact.email == null) missing.push("email");

  checks.push(
    warnCheck(
      "phone",
      "Phone number",
      structured.contact.phone != null,
      "No phone number detected",
    ),
  );
  if (structured.contact.phone == null) missing.push("phone");

  checks.push(
    warnCheck(
      "links",
      "Professional links",
      structured.contact.links.length > 0,
      "No LinkedIn / portfolio links detected",
    ),
  );

  // Sections
  const has = (key: string) => structured.detectedSections.includes(key);
  checks.push(sectionCheck("experience", "Work experience section", has("experience")));
  if (!has("experience")) missing.push("experience section");

  checks.push(sectionCheck("education", "Education section", has("education")));
  if (!has("education")) missing.push("education section");

  checks.push(
    warnCheck(
      "skills",
      "Skills section",
      structured.skills.length > 0 || has("skills"),
      "No skills section detected",
    ),
  );
  if (structured.skills.length === 0 && !has("skills")) missing.push("skills section");

  // Length / format
  checks.push(
    warnCheck(
      "length",
      "Resume length",
      structured.charCount >= MIN_MEANINGFUL_CHARS,
      structured.charCount < MIN_MEANINGFUL_CHARS ? "Very little text extracted" : null,
    ),
  );

  if (pageCount != null) {
    checks.push(
      warnCheck(
        "pages",
        "Page count",
        pageCount > 0 && pageCount <= MAX_RECOMMENDED_PAGES,
        pageCount > MAX_RECOMMENDED_PAGES ? `${pageCount} pages (2 recommended)` : null,
      ),
    );
  }

  if (fileSizeBytes != null) {
    checks.push(
      warnCheck(
        "filesize",
        "File size",
        fileSizeBytes <= MAX_RECOMMENDED_BYTES,
        fileSizeBytes > MAX_RECOMMENDED_BYTES ? "File is large" : null,
      ),
    );
  }

  checks.push(
    warnCheck(
      "confidence",
      "Parsing confidence",
      parseConfidence >= 0.6,
      parseConfidence < 0.6 ? "Low-confidence parse — file may be image-based or unusual" : null,
    ),
  );

  const score = computeScore(checks);
  const status: ResumeHealth["status"] = score >= 80 ? "good" : score >= 50 ? "warnings" : "poor";

  return {
    score,
    status,
    checks,
    missing,
    metrics: {
      pageCount,
      fileSizeBytes,
      wordCount: structured.wordCount,
      charCount: structured.charCount,
      parseConfidence,
    },
    generatedAt: new Date().toISOString(),
  };
}

function boolCheck(
  id: string,
  label: string,
  pass: boolean,
  failDetail: string,
): ResumeHealthCheck {
  return { id, label, status: pass ? "pass" : "fail", detail: pass ? null : failDetail };
}

function warnCheck(
  id: string,
  label: string,
  pass: boolean,
  warnDetail: string | null,
): ResumeHealthCheck {
  return { id, label, status: pass ? "pass" : "warn", detail: pass ? null : warnDetail };
}

function sectionCheck(id: string, label: string, pass: boolean): ResumeHealthCheck {
  return {
    id,
    label,
    status: pass ? "pass" : "warn",
    detail: pass ? null : `No ${label.toLowerCase()} detected`,
  };
}

function computeScore(checks: ResumeHealthCheck[]): number {
  if (checks.length === 0) return 0;
  const weight = (c: ResumeHealthCheck) =>
    c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0;
  const total = checks.reduce((sum, c) => sum + weight(c), 0);
  return Math.round((total / checks.length) * 100);
}
