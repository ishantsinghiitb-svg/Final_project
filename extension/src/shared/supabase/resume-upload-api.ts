import { getSupabaseClient } from "./client";

/**
 * Direct resume upload from the extension (Module 6C). Storage + row insert
 * are plain client-side Supabase calls (RLS-scoped) — mirrors
 * `ResumeService.uploadResume` / `ResumeStorage.upload` on the dashboard
 * exactly (same bucket, same `<userId>/<resumeId>.<ext>` path convention,
 * same content-hash dedup), just re-implemented here rather than imported
 * across the bundle boundary. Parsing itself needs the server (PDF text
 * extraction) — see `extensionApiClient.parseResumeDirect`, called by the
 * background handler right after this resolves.
 */

const RESUMES_BUCKET = "resumes";

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type UploadedResume = { id: string; name: string; isDefault: boolean };

export async function uploadResumeFile(
  userId: string,
  file: { name: string; mimeType: string; bytes: ArrayBuffer },
): Promise<{ resume: UploadedResume; isNew: boolean }> {
  const sb = getSupabaseClient();
  const fileHash = await sha256Hex(file.bytes);

  // Reuse-by-hash — identical to the dashboard's duplicate-upload check.
  const { data: existing, error: findErr } = await sb
    .from("resumes")
    .select("id, name, is_default")
    .eq("user_id", userId)
    .eq("file_hash", fileHash)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) {
    return {
      resume: {
        id: existing.id as string,
        name: (existing.name as string | null) ?? "Resume",
        isDefault: Boolean(existing.is_default),
      },
      isNew: false,
    };
  }

  const { count, error: countErr } = await sb
    .from("resumes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countErr) throw countErr;
  const isFirstResume = (count ?? 0) === 0;

  const displayName = file.name.replace(/\.pdf$/i, "") || "Resume";
  const { data: inserted, error: insertErr } = await sb
    .from("resumes")
    .insert({
      user_id: userId,
      name: displayName,
      file_name: file.name,
      file_hash: fileHash,
      file_size_bytes: file.bytes.byteLength,
      mime_type: file.mimeType,
      is_default: isFirstResume,
      parse_status: "pending",
    })
    .select("id, name, is_default")
    .single();
  if (insertErr) throw insertErr;

  const path = `${userId}/${inserted.id}.pdf`;
  const blob = new Blob([file.bytes], { type: file.mimeType });
  const { error: uploadErr } = await sb.storage
    .from(RESUMES_BUCKET)
    .upload(path, blob, { upsert: true });
  if (uploadErr) throw uploadErr;

  const { error: updateErr } = await sb
    .from("resumes")
    .update({ file_url: path })
    .eq("id", inserted.id);
  if (updateErr) throw updateErr;

  return {
    resume: {
      id: inserted.id as string,
      name: inserted.name as string,
      isDefault: Boolean(inserted.is_default),
    },
    isNew: true,
  };
}
