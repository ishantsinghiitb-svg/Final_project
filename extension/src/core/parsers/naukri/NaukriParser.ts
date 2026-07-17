import { BaseParser } from "../BaseParser";
import type { NormalizedJob, ParserContext } from "../types";

/** Placeholder — not implemented in Module 2D. Registered so the factory has a slot to fill in later. */
export class NaukriParser extends BaseParser {
  tryParse(_context: ParserContext): NormalizedJob | null {
    return null;
  }
}
