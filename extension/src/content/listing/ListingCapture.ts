import { DuplicateResolver } from "../../core/dedup/DuplicateResolver";
import { JobNormalizer } from "../../core/normalization/JobNormalizer";
import type { ListingParser } from "../../core/parsers/ListingParser";
import { JobValidator } from "../../core/validation/JobValidator";
import { sendMessage } from "../../shared/messaging/bus";
import { MessageType } from "../../shared/messaging/types";
import type { AuthState, ExtensionResponse } from "../../shared/messaging/types";
import { debounceWithMaxWait } from "../util/debounce";

/** Small margin so a card is captured just as (or just before) it scrolls into view. */
const CARD_VISIBILITY_MARGIN = "200px";
const CARD_VISIBILITY_THRESHOLD = 0.01;
/** Coalesce the flurry of mutations infinite-scroll produces into one re-scan. */
const RESCAN_DEBOUNCE_MS = 400;
const RESCAN_MAX_WAIT_MS = 1500;

/**
 * Background, viewport-driven capture of a listing/search page's job cards.
 *
 * Runs ONLY on pages a `ListingParser.matches()` claims (Internshala search
 * pages today), and deliberately does the minimum work possible:
 *   • An IntersectionObserver parses each card exactly once, the moment it
 *     enters the viewport, then stops observing it — a page with hundreds of
 *     cards only ever parses the ones the user actually scrolls past.
 *   • A MutationObserver on the results container (not the whole page) picks up
 *     infinite-scroll's newly-appended cards; a debounce collapses its bursts.
 *   • Two dedup layers prevent repeat work: a `WeakSet` of already-observed
 *     card elements and a `Set` of already-synced posting keys.
 * When no new cards appear, both observers sit idle — no polling, no timers.
 *
 * Each captured card flows through the exact same
 * Normalizer → Validator → (background) DuplicateResolver → upsert pipeline as
 * a single detail-page capture, so the detail page later enriches the same
 * Global Job row (matched by `source`+`source_job_id`). No floating panel is
 * shown — this is bulk catalog capture, not a per-job affordance.
 */
export class ListingCapture {
  private readonly observed = new WeakSet<Element>();
  private readonly syncedKeys = new Set<string>();
  private io: IntersectionObserver | null = null;
  private mo: MutationObserver | null = null;
  private started = false;
  private stopped = false;

  constructor(private readonly parser: ListingParser) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // Syncing to global_jobs is auth-gated (SYNC_GLOBAL_JOB requires a signed-in
    // user), so there's nothing useful to do while signed out — stay fully idle
    // rather than observing cards we could never persist.
    const authed = await this.isAuthenticated();
    if (!authed || this.stopped) return;

    this.io = new IntersectionObserver((entries) => this.onIntersect(entries), {
      rootMargin: CARD_VISIBILITY_MARGIN,
      threshold: CARD_VISIBILITY_THRESHOLD,
    });

    const rescan = debounceWithMaxWait(
      () => this.observeNewCards(),
      RESCAN_DEBOUNCE_MS,
      RESCAN_MAX_WAIT_MS,
    );

    this.observeNewCards();

    const scrollRoot = document.getElementById("internship_list_container") ?? document.body;
    this.mo = new MutationObserver(() => rescan());
    this.mo.observe(scrollRoot, { childList: true, subtree: true });

    window.addEventListener("pagehide", this.stop, { once: true });
  }

  private observeNewCards(): void {
    if (this.stopped || !this.io) return;
    for (const card of this.parser.findCards(document)) {
      if (this.observed.has(card)) continue;
      this.observed.add(card);
      this.io.observe(card);
    }
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const card = entry.target;
      this.io?.unobserve(card); // parse each card exactly once
      void this.captureCard(card);
    }
  }

  private async captureCard(card: Element): Promise<void> {
    const raw = this.parser.parseCard(card, { document, url: location.href });
    if (!raw) return;

    const job = JobNormalizer.normalize(raw);
    // Skip cards that can't be persisted yet (e.g. no description snippet) — the
    // detail page will capture them later. Same rules the background enforces,
    // checked here to avoid hundreds of doomed round trips on a big list.
    if (!JobValidator.validate(job).valid) return;

    const key = DuplicateResolver.dedupKey(job);
    if (this.syncedKeys.has(key)) return;
    this.syncedKeys.add(key);

    try {
      await sendMessage({ type: MessageType.SYNC_GLOBAL_JOB, payload: job });
    } catch {
      // Transient (service worker warming up, etc.). The key stays marked so a
      // fast re-scroll doesn't spam retries; the next page load re-captures.
    }
  }

  private async isAuthenticated(): Promise<boolean> {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const res = (await sendMessage({
          type: MessageType.GET_AUTH_STATE,
        })) as ExtensionResponse<AuthState>;
        return res.ok && res.data.authenticated;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    return false;
  }

  private readonly stop = (): void => {
    this.stopped = true;
    this.io?.disconnect();
    this.io = null;
    this.mo?.disconnect();
    this.mo = null;
  };
}
