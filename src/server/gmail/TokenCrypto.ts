// ── Google refresh-token encryption (Module 9A/9B) ──
//
// AES-256-GCM via Web Crypto — works on Cloudflare Workers and Node 18+, and
// matches this codebase's existing Web-Crypto precedent (src/server/ai/hash.ts)
// rather than Node's `crypto` module. This Supabase project has no pgsodium/
// pgcrypto/Vault extension enabled, so application-layer encryption is the
// only available mechanism for keeping the Google refresh token (shared by
// Gmail and Calendar — one connection, incrementally scoped) unreadable at
// rest — not a fallback, the intended design.
//
// A fresh random 96-bit nonce is generated per encryption and stored
// alongside the ciphertext (never reused — reusing a nonce with the same key
// breaks AES-GCM's confidentiality guarantee). The key is never read from env
// here; callers pass `serverEnv.googleTokenEncryptionKey` in explicitly, so
// this module stays a pure crypto utility with no config dependency.

import { base64Encode, base64Decode } from "./base64";

const AES_GCM = "AES-GCM";
const NONCE_LENGTH_BYTES = 12;

async function importKey(rawKeyBase64: string): Promise<CryptoKey> {
  const keyBytes = base64Decode(rawKeyBase64);
  return crypto.subtle.importKey("raw", keyBytes as unknown as ArrayBuffer, AES_GCM, false, [
    "encrypt",
    "decrypt",
  ]);
}

export type EncryptedToken = { ciphertext: string; nonce: string };

/** Encrypts `plaintext` (the Gmail refresh token) with a base64-encoded 256-bit key. */
export async function encryptToken(plaintext: string, keyBase64: string): Promise<EncryptedToken> {
  const key = await importKey(keyBase64);
  const nonceBytes = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH_BYTES));
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: AES_GCM, iv: nonceBytes as unknown as ArrayBuffer },
    key,
    plaintextBytes as unknown as ArrayBuffer,
  );
  return {
    ciphertext: base64Encode(new Uint8Array(cipherBuffer)),
    nonce: base64Encode(nonceBytes),
  };
}

/** Reverses {@link encryptToken}. Throws if the key or nonce is wrong (tamper/corruption). */
export async function decryptToken(encrypted: EncryptedToken, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64);
  const cipherBytes = base64Decode(encrypted.ciphertext);
  const nonceBytes = base64Decode(encrypted.nonce);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: AES_GCM, iv: nonceBytes as unknown as ArrayBuffer },
    key,
    cipherBytes as unknown as ArrayBuffer,
  );
  return new TextDecoder().decode(plainBuffer);
}
