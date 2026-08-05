// ── Base64 / base64url helpers (Module 9A) ──
//
// Shared by TokenCrypto.ts (standard base64, DB storage), OAuthState.ts
// (base64url, URL query param), and GmailApiClient.ts (base64url, Gmail's
// own body-part encoding) — three independent call sites is the point past
// which a shared helper beats copy-pasting the same ~10 lines a third time.

export function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return base64Encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const padLength = (4 - (value.length % 4)) % 4;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  return base64Decode(padded);
}
