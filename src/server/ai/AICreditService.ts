import { aiCreditsConfig } from "@/config";
import type { AICapability } from "@/features/ai/constants";
import type { AICreditStatus } from "@/features/ai/types";
import type { ServerSupabase } from "@/server/supabase";

// ── AI Credit Service (Module 6A · MVP, no subscriptions) ──
//
// Wraps the SECURITY DEFINER RPCs. `getStatus` idempotently ensures the user's
// usage row exists (seeded with the config free allowance). `consume` atomically
// charges credits and NEVER throws on exhaustion — it returns { ok: false } so
// the AI Service can produce a structured "feature locked" envelope.

function toStatus(row: {
  plan: string;
  credits_total: number;
  credits_used: number;
  credits_remaining: number;
}): AICreditStatus {
  const remaining = row.credits_remaining;
  return {
    plan: row.plan,
    creditsTotal: row.credits_total,
    creditsUsed: row.credits_used,
    creditsRemaining: remaining,
    featureLocked: remaining <= 0,
    upgradeRequired: remaining <= 0,
  };
}

export class AICreditService {
  constructor(private readonly sb: ServerSupabase) {}

  async getStatus(): Promise<AICreditStatus> {
    const { data, error } = await this.sb.rpc("ensure_ai_usage", {
      p_credits_total: aiCreditsConfig.freeCredits,
    });
    if (error) throw error;
    return toStatus(data);
  }

  async consume(
    capability: AICapability,
    cost: number,
  ): Promise<{ ok: boolean; status: AICreditStatus }> {
    const { data, error } = await this.sb.rpc("consume_ai_credit", {
      p_capability: capability,
      p_cost: cost,
      p_credits_total: aiCreditsConfig.freeCredits,
    });
    if (error) throw error;

    const result = data as {
      ok: boolean;
      plan: string;
      credits_total: number;
      credits_used: number;
      credits_remaining: number;
    };

    return { ok: result.ok, status: toStatus(result) };
  }

  /**
   * Compensating action for `consume` — used when a charged generation
   * ultimately fails (provider/validation error) so the user isn't billed for
   * nothing. Symmetric RPC; never lets credits_used go below 0.
   */
  async refund(capability: AICapability, cost: number): Promise<AICreditStatus> {
    const { data, error } = await this.sb.rpc("refund_ai_credit", {
      p_capability: capability,
      p_cost: cost,
    });
    if (error) throw error;
    return toStatus(
      data as {
        plan: string;
        credits_total: number;
        credits_used: number;
        credits_remaining: number;
      },
    );
  }
}
