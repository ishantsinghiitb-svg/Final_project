import { beforeEach, describe, expect, it, vi } from "vitest";
import { FILE_LIMITS, RESUME_PARSE_TIMEOUT_MS } from "@/constants";
import type { ServerSupabase } from "@/server/supabase";

// ── Resume upload/parse protection (Module 13 · Phase 2 · A2) ──
//
// Covers the guards added in front of unpdf: the actual downloaded byte
// count (not whatever resume.file_size_bytes claims), the PDF magic header
// (not whatever mime_type the uploader declared), and a bounded timeout
// around the parse call itself. `parseResumeFile` is mocked — these tests
// are about the orchestration deciding whether to call it at all, not about
// PDF parsing itself (that's ResumeParser's own concern).

const parseResumeFile = vi.fn();
vi.mock("./ResumeParser", () => ({
  parseResumeFile: (...args: unknown[]) => parseResumeFile(...args),
}));

const { parseResumeForUser } = await import("./ResumeUpload");

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

function bytesOf(size: number, magic: Uint8Array | null): Uint8Array {
  const bytes = new Uint8Array(size);
  if (magic) bytes.set(magic, 0);
  return bytes;
}

type FakeResumeRow = {
  id: string;
  file_url: string | null;
  file_name: string;
  file_hash: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
};

function setup(resume: FakeResumeRow, downloadBytes: Uint8Array | null) {
  const updates: { table: string; values: Record<string, unknown> }[] = [];
  const upserts: { table: string; values: Record<string, unknown> }[] = [];

  const client = {
    from(table: string) {
      return {
        select() {
          const chain = {
            eq: () => chain,
            not: () => chain,
            limit: () => chain,
            maybeSingle: async () => {
              if (table === "resumes") return { data: resume, error: null };
              // resume_parsed reuse-by-hash lookup — no cached entry by default.
              return { data: null, error: null };
            },
          };
          return chain;
        },
        update(values: Record<string, unknown>) {
          updates.push({ table, values });
          return { eq: async () => ({ data: null, error: null }) };
        },
        upsert(values: Record<string, unknown>) {
          upserts.push({ table, values });
          return Promise.resolve({ error: null });
        },
      };
    },
    storage: {
      from() {
        return {
          download: async () => {
            if (!downloadBytes) return { data: null, error: { message: "not found" } };
            return { data: { arrayBuffer: async () => downloadBytes.buffer }, error: null };
          },
        };
      },
    },
  };

  return {
    sb: client as unknown as ServerSupabase,
    updates,
    upserts,
    lastResumeUpdate: () => [...updates].reverse().find((u) => u.table === "resumes")?.values,
  };
}

const USER = { id: "user-1" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("parseResumeForUser — server-side upload protection", () => {
  it("parses a valid PDF within the size limit", async () => {
    const bytes = bytesOf(1024, PDF_MAGIC);
    const { sb, upserts, lastResumeUpdate } = setup(
      {
        id: "resume-1",
        file_url: "user-1/resume-1.pdf",
        file_name: "resume.pdf",
        file_hash: null,
        file_size_bytes: bytes.byteLength,
        mime_type: "application/pdf",
      },
      bytes,
    );
    parseResumeFile.mockResolvedValue({
      parserVersion: "test-v1",
      rawText: "text",
      structured: {},
      health: { metrics: { pageCount: 1 } },
      parseConfidence: 0.9,
      charCount: 4,
      tokenEstimate: 1,
    });

    const result = await parseResumeForUser(sb, USER, "resume-1");

    expect(result.ok).toBe(true);
    expect(parseResumeFile).toHaveBeenCalledTimes(1);
    expect(lastResumeUpdate()).toMatchObject({ parse_status: "ready" });
    expect(upserts.some((u) => u.table === "resume_parsed")).toBe(true);
  });

  it("rejects a file over the size limit before calling the parser", async () => {
    const oversized = bytesOf(FILE_LIMITS.RESUME_MAX_BYTES + 1, PDF_MAGIC);
    const { sb, lastResumeUpdate } = setup(
      {
        id: "resume-1",
        file_url: "user-1/resume-1.pdf",
        file_name: "resume.pdf",
        file_hash: null,
        file_size_bytes: oversized.byteLength,
        mime_type: "application/pdf",
      },
      oversized,
    );

    const result = await parseResumeForUser(sb, USER, "resume-1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/too large/i);
    expect(parseResumeFile).not.toHaveBeenCalled();
    expect(lastResumeUpdate()).toMatchObject({ parse_status: "failed" });
  });

  it("rejects an unsupported MIME type before downloading is even parsed", async () => {
    const { sb } = setup(
      {
        id: "resume-1",
        file_url: "user-1/resume-1.docx",
        file_name: "resume.docx",
        file_hash: null,
        file_size_bytes: 1024,
        mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      null,
    );

    const result = await parseResumeForUser(sb, USER, "resume-1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unsupported_type");
    expect(parseResumeFile).not.toHaveBeenCalled();
  });

  it("rejects a file claiming to be a PDF whose bytes don't match the PDF signature", async () => {
    const fakeBytes = bytesOf(1024, null); // no %PDF- header
    const { sb, lastResumeUpdate } = setup(
      {
        id: "resume-1",
        file_url: "user-1/resume-1.pdf",
        file_name: "resume.pdf",
        file_hash: null,
        file_size_bytes: fakeBytes.byteLength,
        mime_type: "application/pdf",
      },
      fakeBytes,
    );

    const result = await parseResumeForUser(sb, USER, "resume-1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/valid pdf/i);
    expect(parseResumeFile).not.toHaveBeenCalled();
    expect(lastResumeUpdate()).toMatchObject({ parse_status: "failed" });
  });

  it("fails cleanly when the parser itself throws on malformed content", async () => {
    const bytes = bytesOf(1024, PDF_MAGIC);
    const { sb, lastResumeUpdate } = setup(
      {
        id: "resume-1",
        file_url: "user-1/resume-1.pdf",
        file_name: "resume.pdf",
        file_hash: null,
        file_size_bytes: bytes.byteLength,
        mime_type: "application/pdf",
      },
      bytes,
    );
    parseResumeFile.mockRejectedValue(new Error("Invalid PDF structure"));

    const result = await parseResumeForUser(sb, USER, "resume-1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Invalid PDF structure");
    expect(lastResumeUpdate()).toMatchObject({ parse_status: "failed" });
  });

  it("stops a parse that runs past the bounded timeout instead of hanging forever", async () => {
    vi.useFakeTimers();
    const bytes = bytesOf(1024, PDF_MAGIC);
    const { sb, lastResumeUpdate } = setup(
      {
        id: "resume-1",
        file_url: "user-1/resume-1.pdf",
        file_name: "resume.pdf",
        file_hash: null,
        file_size_bytes: bytes.byteLength,
        mime_type: "application/pdf",
      },
      bytes,
    );
    // A parse that never settles — simulates a pathological PDF.
    parseResumeFile.mockImplementation(() => new Promise(() => {}));

    const resultPromise = parseResumeForUser(sb, USER, "resume-1");
    await vi.advanceTimersByTimeAsync(RESUME_PARSE_TIMEOUT_MS);
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/took too long/i);
    expect(lastResumeUpdate()).toMatchObject({ parse_status: "failed" });
  });
});
