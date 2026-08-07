import {
  GoogleConnectionRepository,
  type GoogleProduct,
} from "@/repositories/GoogleConnectionRepository";
import type { GoogleConnection } from "@/features/gmail/types";

const connectionRepo = new GoogleConnectionRepository();

// ── GoogleService (Module 9A/9B) ──
//
// Client-facing connection status/toggle for the one shared Google OAuth
// connection — mirrors ApplicationService's thin-wrapper-over-repository
// shape. Reading connection status and toggling auto-sync don't need a
// server-only secret, so they're called directly from the client (ambient
// RLS-scoped Supabase client), exactly like every other read/toggle in this
// app. Connect-URL generation, disconnect (best-effort token revoke) and
// sync-now all DO need a server-only secret or the Google API itself, and go
// through src/server-functions/gmail.ts instead — see its own header.
export class GoogleService {
  async getConnection(userId: string): Promise<GoogleConnection | null> {
    return connectionRepo.findConnectionByUser(userId);
  }

  async updateAutoSync(
    userId: string,
    product: GoogleProduct,
    enabled: boolean,
  ): Promise<GoogleConnection> {
    return connectionRepo.updateAutoSync(userId, product, enabled);
  }
}

export const googleService = new GoogleService();
