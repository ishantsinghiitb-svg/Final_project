import type { ResumeHealth, StructuredResume } from "@/features/ai/schemas";
import { clampScore } from "@/features/ai/atsScore";

// ── Deterministic ATS checks (Module 6C · NOT an AI feature) ──
//
// The objective, parser-derived half of the ATS Compatibility score. Reuses the
// EXISTING deterministic Resume Health output + StructuredResume (Module 6A) —
// no parser logic is duplicated here. It produces the two deterministic score
// components (ATS Formatting, Section Completeness) and the formatting/structure
// risks an ATS would trip on, so the AI never has to reason about layout and can
// never invent a formatting score.
//
// Every signal here is a pure function of the parsed resume, so it is stable for
// a given resume version — the same property the cache key relies on.

export type AtsDeterministicComponent = { score: number; detail: string };

export type AtsDeterministicResult = {
  formatting: AtsDeterministicComponent;
  sectionCompleteness: AtsDeterministicComponent;
  /** Formatting / structure risks that could hurt ATS parsing (merged with the AI's content risks upstream). */
  risks: string[];
};

const MIN_MEANINGFUL_CHARS = 400;
const MAX_RECOMMENDED_PAGES = 2;

export function computeAtsDeterministic(
  structured: StructuredResume,
  health: ResumeHealth | null,
): AtsDeterministicResult {
  const parseConfidence = health?.metrics.parseConfidence ?? 0;
  const pageCount = health?.metrics.pageCount ?? null;
  const charCount = health?.metrics.charCount ?? structured.charCount;

  const has = (key: string) => structured.detectedSections.includes(key);
  const hasEmail = structured.contact.email != null;
  const hasPhone = structured.contact.phone != null;
  const hasLinks = structured.contact.links.length > 0;
  const hasSkills = structured.skills.length > 0 || has("skills");
  const hasSummary = structured.summary != null || has("summary");

  // ── Section Completeness (deterministic, 15% of final) ──
  // Rewards the presence of the standard, ATS-recognized sections. Standard
  // section *names* matter too: detection here only fires on recognized headings
  // (see ResumeParser SECTION_KEYWORDS), so a detected section is also a
  // standard-named one.
  const sectionParts: { present: boolean; points: number; label: string }[] = [
    { present: has("experience"), points: 30, label: "Work Experience" },
    { present: has("education"), points: 25, label: "Education" },
    { present: hasSkills, points: 25, label: "Skills" },
    { present: hasEmail, points: 15, label: "Contact email" },
    { present: hasSummary, points: 5, label: "Summary" },
  ];
  const sectionScore = clampScore(
    sectionParts.reduce((sum, p) => sum + (p.present ? p.points : 0), 0),
  );
  const missingSections = sectionParts.filter((p) => !p.present).map((p) => p.label);
  const sectionDetail =
    missingSections.length === 0
      ? "All standard, ATS-recognized sections were detected."
      : `Missing standard section${missingSections.length > 1 ? "s" : ""}: ${missingSections.join(", ")}.`;

  // ── ATS Formatting (deterministic, 20% of final) ──
  // Parse confidence is the strongest single ATS-parseability signal: multi-
  // column layouts, tables, text boxes, and image-based resumes all parse with
  // low confidence and few detected sections. Machine-readable contact details,
  // a sane page count, and adequate extractable text round it out.
  let formattingScore = Math.round(parseConfidence * 60);
  if (hasEmail) formattingScore += 12;
  if (hasPhone) formattingScore += 6;
  if (hasLinks) formattingScore += 6;
  if (pageCount == null) formattingScore += 7;
  else if (pageCount >= 1 && pageCount <= MAX_RECOMMENDED_PAGES) formattingScore += 10;
  else formattingScore += 4;
  if (charCount >= MIN_MEANINGFUL_CHARS) formattingScore += 6;
  formattingScore = clampScore(formattingScore);

  const formattingDetail =
    parseConfidence >= 0.75
      ? "Text extracted cleanly — the layout appears ATS-friendly (single-column, selectable text)."
      : parseConfidence >= 0.5
        ? "Mostly parseable, but some content may be hard for an ATS to read reliably."
        : "Low parse confidence — the layout may use columns, tables, or images that an ATS cannot read.";

  // ── Deterministic ATS risks (formatting / structure only) ──
  const risks: string[] = [];
  if (parseConfidence < 0.6) {
    risks.push(
      "Low parse confidence — a multi-column layout, tables, text boxes, or embedded images can stop ATS software from reading your resume. Use a single-column, text-based layout.",
    );
  }
  if (charCount < MIN_MEANINGFUL_CHARS) {
    risks.push(
      "Very little text was extracted — the file may be image-based or scanned, which an ATS cannot read. Export a text-based PDF.",
    );
  }
  if (pageCount != null && pageCount > MAX_RECOMMENDED_PAGES) {
    risks.push(
      `Resume is ${pageCount} pages — most ATS workflows and recruiters expect 1–2 pages.`,
    );
  }
  if (!hasEmail) {
    risks.push(
      "No machine-readable email detected in the header — an ATS may fail to capture your contact details.",
    );
  }
  if (!has("experience")) {
    risks.push(
      "No standard “Experience” section heading detected — an ATS relies on standard section titles to categorize your background.",
    );
  }
  if (!has("education")) {
    risks.push("No standard “Education” section heading detected.");
  }
  if (!hasSkills) {
    risks.push("No dedicated “Skills” section detected — ATS keyword scanners look for one.");
  }

  return {
    formatting: { score: formattingScore, detail: formattingDetail },
    sectionCompleteness: { score: sectionScore, detail: sectionDetail },
    risks,
  };
}
