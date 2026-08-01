import type { RecommendationDraftItem } from "./schema";
import type { RecommendationCandidate, RecommendationCandidateType } from "./types";

// ── AI Recommendations — prompt + guardrail (Module 8B) ──
//
// The AI's ONLY job is to phrase 2-3 sentence explanations for candidates
// the backend has ALREADY chosen and verified (see candidates.ts). This file
// (a) builds the prompt that hands it those exact facts/entities and forbids
// anything else, and (b) validates the AI's response against the same
// whitelist afterward — the validation half is what actually makes this
// safe, since a prompt instruction alone is never a guarantee against a
// model inventing or misremembering a number or a name.

function factsBlock(candidate: RecommendationCandidate): string {
  return Object.entries(candidate.facts)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

export function buildRecommendationsPrompt(candidates: RecommendationCandidate[]): {
  system: string;
  user: string;
} {
  const system = `You write short, plain-English "what to do next" recommendations for a job search platform, based ONLY on the verified data given to you.

Rules — follow every one exactly:
- For each candidate you are given a fixed set of numbers ("Facts") and names ("Entities"). You may state ONLY those exact numbers and those exact names, spelled exactly as given. Never round, combine, or paraphrase a number or a name.
- Never calculate, estimate, average, or derive any number that was not given to you directly. Never state a percentage, count, or score that is not one of the given facts.
- Never invent, guess, or substitute a different resume, competency, goal, or company name than the ones given as entities. If a candidate has no entities, do not name anyone or anything specific.
- Never introduce any information not present in the facts and entities you were given.
- Do not say "our AI thinks", "we predict", or "we estimate". Instead write plainly, e.g. "Based on your activity..." or "From your recent applications...".
- Avoid buzzwords and hype. Use simple, direct, plain language.
- "title": a short label, a few words.
- "explanation": 2-3 sentences that state the real numbers/names naturally.
- "action": one concrete, specific next step, written as an instruction.
- Return exactly one item per candidate below, in the same order, each with the matching "type".`;

  const user = candidates
    .map((c, i) => {
      const entities = c.entities.length
        ? c.entities.join(", ")
        : "none — do not name anyone or anything specific";
      return `Candidate ${i + 1} — type: ${c.type}
Facts (the ONLY numbers you may state):
${factsBlock(c)}
Entities (the ONLY names you may state): ${entities}`;
    })
    .join("\n\n");

  return { system, user };
}

// ── Guardrail: numbers ──

const NUMBER_PATTERN = /\d+(?:\.\d+)?%?/g;

export function extractNumbers(text: string): string[] {
  return text.match(NUMBER_PATTERN) ?? [];
}

function allowedNumberStrings(candidate: RecommendationCandidate): Set<string> {
  const allowed = new Set<string>();
  for (const value of Object.values(candidate.facts)) {
    const n = String(value);
    allowed.add(n);
    allowed.add(`${n}%`);
  }
  return allowed;
}

export function numbersAreValid(text: string, candidate: RecommendationCandidate): boolean {
  const allowed = allowedNumberStrings(candidate);
  return extractNumbers(text).every((n) => allowed.has(n));
}

// ── Guardrail: entities ──
//
// Built once per request from EVERY name that exists anywhere in the user's
// own data (every resume name, every mock-interview competency label they've
// actually been scored on, every goal label, every interview company name) —
// not just the names belonging to the 3 candidates shown this round. Each
// name is tagged with which candidate(s) actually own it. A name from
// outside a candidate's own whitelist appearing in that candidate's AI text
// is rejected whether it's a real name that belongs to something else (cross-
// contamination) or a name that exists nowhere in the pool at all (invented).

export type EntityOwnership = Map<string, Set<RecommendationCandidateType>>;

export function buildEntityOwnership(
  candidates: RecommendationCandidate[],
  allKnownEntities: string[],
): EntityOwnership {
  const ownership: EntityOwnership = new Map();
  for (const entity of allKnownEntities) {
    if (!ownership.has(entity)) ownership.set(entity, new Set());
  }
  for (const c of candidates) {
    for (const entity of c.entities) {
      const owners = ownership.get(entity) ?? new Set<RecommendationCandidateType>();
      owners.add(c.type);
      ownership.set(entity, owners);
    }
  }
  return ownership;
}

export function entitiesAreValid(
  text: string,
  candidate: RecommendationCandidate,
  ownership: EntityOwnership,
): boolean {
  // Every entity this candidate was told to use must appear verbatim — a
  // silent paraphrase/substitution is exactly what this guards against.
  for (const entity of candidate.entities) {
    if (!text.includes(entity)) return false;
  }
  // No name belonging to a different candidate — or a real name that exists
  // in the account but isn't part of any candidate this round — may appear.
  for (const [entity, owners] of ownership) {
    if (owners.has(candidate.type)) continue;
    if (text.includes(entity)) return false;
  }
  return true;
}

// ── Combined validation ──

export function validateRecommendationItem(
  item: RecommendationDraftItem,
  candidate: RecommendationCandidate,
  ownership: EntityOwnership,
): boolean {
  if (item.type !== candidate.type) return false;
  if (!item.title.trim() || !item.explanation.trim() || !item.action.trim()) return false;

  const text = `${item.title} ${item.explanation} ${item.action}`;
  if (!numbersAreValid(text, candidate)) return false;
  if (!entitiesAreValid(text, candidate, ownership)) return false;
  return true;
}
