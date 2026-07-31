// ── Dictation text assembly (Module 7C) ──
//
// Speech recognition delivers an answer as a stream of fragments. Stitching
// them back into prose is a small function with an outsized effect on how
// dictation feels: get the seam wrong and every pause leaves a doubled space
// or two glued-together words in the candidate's answer.
//
// Lives outside the component so it can be tested directly — the component
// itself is all layout and browser wiring.

/**
 * Joins a dictated fragment onto the answer so far with exactly one space,
 * tolerating whitespace already present on either side.
 *
 * Shaped as `(base, addition)` so it can be used directly as a reduce
 * callback, which is how dictation actually accumulates.
 */
export function joinSpoken(base: string, addition: string): string {
  const left = base.replace(/\s+$/, "");
  const right = addition.replace(/^\s+/, "");
  if (!left) return right.trim();
  if (!right) return left;
  return `${left} ${right}`;
}
