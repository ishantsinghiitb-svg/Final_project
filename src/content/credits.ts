import { aiCreditsConfig } from "@/config";
import { AI_CREDIT_COSTS } from "@/features/ai/constants";

/**
 * Everything user-facing about AI credits, derived from the SAME configuration
 * the server charges against (`aiCreditsConfig` and `AI_CREDIT_COSTS`) rather
 * than numbers typed into marketing copy. If the allowance or a capability's
 * cost changes, every surface that shows it changes with it.
 *
 * OfferLyst has no paid plans. When someone needs more than the free
 * allowance, the answer is to contact us, not a pricing page.
 */

/** Free credits granted to a new account. Configurable via VITE_AI_FREE_CREDITS. */
export const FREE_CREDITS = aiCreditsConfig.freeCredits;

/** Costs shown to users, in the order they appear in the product. */
export const CREDIT_COSTS: readonly { label: string; cost: number }[] = [
  { label: "Resume match against a job", cost: AI_CREDIT_COSTS.resume_match },
  { label: "ATS compatibility check", cost: AI_CREDIT_COSTS.ats_score },
  { label: "Resume optimization", cost: AI_CREDIT_COSTS.resume_optimizer },
  { label: "Cover letter draft", cost: AI_CREDIT_COSTS.cover_letter },
  { label: "Interview preparation", cost: AI_CREDIT_COSTS.interview_prep },
  { label: "Mock interview session", cost: AI_CREDIT_COSTS.mock_interview },
];

/** Capabilities that never charge. */
export const FREE_CAPABILITIES: readonly string[] = [
  "Analytics recommendations",
  "Gmail and Calendar review",
];

/** Headline used by the credits CTA in the dashboard and on the marketing site. */
export const CREDITS_CTA_TITLE = "Need more AI credits?";
