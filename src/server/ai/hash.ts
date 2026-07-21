// ── Deterministic hashing (Module 6A) ──
//
// Web Crypto SHA-256 — works on Cloudflare Workers and Node 18+. Used for the
// resume file hash (reuse-by-hash), job snapshot hash, and the AI context
// input hash (cache key). Object hashing uses a stable, key-sorted serializer
// so equal inputs always hash equal.

export async function sha256Hex(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Deterministic JSON: object keys sorted recursively. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export async function hashObject(value: unknown): Promise<string> {
  return sha256Hex(stableStringify(value));
}
