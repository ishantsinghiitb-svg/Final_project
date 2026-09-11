import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/server/supabase";
import { deleteAccount } from "@/server/account/AccountDeletionService";
import { accessToken as accessTokenSchema, validate } from "./validation";

// ── Account server functions (production audit B6) ──
//
// Lives outside src/server/** for the same reason every other file in this
// directory does (see gmail.ts's header): Vite's import-protection blocks
// the client from importing anything under "server", so the createServerFn
// entry point has to sit here even though the actual deletion logic (which
// needs GOOGLE/SUPABASE server-only secrets via createServiceSupabase) lives
// in src/server/account/AccountDeletionService.ts.

const DeleteAccountSchema = z.object({ accessToken: accessTokenSchema });

export type DeleteAccountResult = { ok: true } | { ok: false; message: string };

/**
 * Permanently deletes the CALLER'S OWN account — no target-user parameter
 * exists anywhere in this API, so there is no way to request deletion of
 * anyone else's data. `requireUser` resolves identity from the caller's own
 * session token; everything downstream acts on that id only.
 *
 * Reports `ok:false` (never `ok:true`) for any failure, partial or total —
 * deleteAccount() only resolves once Storage is fully swept AND the
 * auth.users row is gone, so there is no path where a real failure gets
 * reported back as success.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(DeleteAccountSchema, data))
  .handler(async ({ data }): Promise<DeleteAccountResult> => {
    const authed = await requireUser(data.accessToken);
    try {
      await deleteAccount(authed);
      return { ok: true };
    } catch (err) {
      console.error("Account deletion failed:", err instanceof Error ? err.message : err);
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Failed to delete account.",
      };
    }
  });
