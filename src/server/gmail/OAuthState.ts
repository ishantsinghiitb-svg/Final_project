// ── Stateless OAuth CSRF state (Module 9A/9B) ──
//
// The Google OAuth callback (src/routes/auth.google.callback.ts, née
// auth.gmail.callback.ts — one callback now serves both Gmail and Calendar
// consent, see the Module 9B plan §2) is a bare GET redirect from Google with
// no ambient session — this app's Supabase session is localStorage-based, not
// cookie-based, so the callback can't identify the user from the request
// itself. Instead of a server-side state table, the `state` query param IS
// the credential: it's an HMAC-signed, short-lived payload binding the state
// to the user who clicked "Connect." An attacker can't forge a valid state
// for someone else's user_id without the secret, which defeats classic
// OAuth-state CSRF without needing single-use tracking. Fully generic (no
// scope/product awareness needed) — unchanged by Module 9B.
//
// Keep GOOGLE_OAUTH_STATE_SECRET separate from the token-encryption key
// (src/server/gmail/TokenCrypto.ts) — signing and encryption are different
// purposes and should never share a secret.

import { base64Decode, base64UrlEncode, base64UrlDecode } from "./base64";

const STATE_TTL_MS = 10 * 60 * 1000;
const HMAC_ALGO = { name: "HMAC", hash: "SHA-256" };

type StatePayload = { userId: string; nonce: string; expiresAt: number };

async function importHmacKey(secretBase64: string): Promise<CryptoKey> {
  const keyBytes = base64Decode(secretBase64);
  return crypto.subtle.importKey("raw", keyBytes as unknown as ArrayBuffer, HMAC_ALGO, false, [
    "sign",
    "verify",
  ]);
}

/** Mints a short-lived (~10 min), HMAC-signed `state` value binding this connect attempt to `userId`. */
export async function createSignedState(userId: string, secretBase64: string): Promise<string> {
  const payload: StatePayload = {
    userId,
    nonce: crypto.randomUUID(),
    expiresAt: Date.now() + STATE_TTL_MS,
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await importHmacKey(secretBase64);
  const signature = await crypto.subtle.sign(
    HMAC_ALGO,
    key,
    payloadBytes as unknown as ArrayBuffer,
  );

  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Verifies a `state` value from the OAuth callback. Returns the bound
 * `userId` on success, or `null` for any failure (malformed, bad signature,
 * expired) — callers treat all of these identically (reject the callback).
 */
export async function verifySignedState(
  state: string,
  secretBase64: string,
): Promise<string | null> {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [payloadPart, signaturePart] = parts;

  let payloadBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    payloadBytes = base64UrlDecode(payloadPart);
    signatureBytes = base64UrlDecode(signaturePart);
  } catch {
    return null;
  }

  const key = await importHmacKey(secretBase64);
  const isValid = await crypto.subtle.verify(
    HMAC_ALGO,
    key,
    signatureBytes as unknown as ArrayBuffer,
    payloadBytes as unknown as ArrayBuffer,
  );
  if (!isValid) return null;

  let payload: StatePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as StatePayload;
  } catch {
    return null;
  }
  if (typeof payload.userId !== "string" || typeof payload.expiresAt !== "number") return null;
  if (Date.now() > payload.expiresAt) return null;

  return payload.userId;
}
