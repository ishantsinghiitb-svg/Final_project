import type { Resume, ResumeVersion } from "@/types";
import { ResumeRepository } from "@/repositories/ResumeRepository";
import { ResumeParsedRepository, type ResumeParsed } from "@/repositories/ResumeParsedRepository";
import { ResumeStorage } from "@/services/storage/ResumeStorage";

const resumeRepo = new ResumeRepository();
const resumeParsedRepo = new ResumeParsedRepository();
const resumeStorage = new ResumeStorage();

/**
 * ResumeService
 *
 * Module 3B read/upload path plus the Module 6A resume-management surface
 * (multiple resumes, default, rename, delete, metadata) and read access to the
 * deterministic parse output. Parsing itself is triggered server-side via
 * AIClient.parseResume — kept separate so the parser stays independent of any
 * data-layer concerns.
 */
export class ResumeService {
  async getResumes(userId: string): Promise<Resume[]> {
    return resumeRepo.findAllByUser(userId);
  }

  async getResume(id: string): Promise<Resume | null> {
    return resumeRepo.findById(id);
  }

  async getVersions(resumeId: string): Promise<ResumeVersion[]> {
    return resumeRepo.findVersions(resumeId);
  }

  async getParsed(resumeId: string): Promise<ResumeParsed | null> {
    return resumeParsedRepo.findByResumeId(resumeId);
  }

  /**
   * Uploads a resume: computes a deterministic file hash and checks for an
   * existing resume with the same hash for this user FIRST — if one exists,
   * it is reused as-is (no new row, no re-upload, no re-parse, existing
   * metadata untouched) and `isDuplicate: true` is returned so the caller can
   * inform the user. Otherwise creates the row with metadata, uploads the
   * file, and marks the first-ever resume as the default. Parsing is
   * triggered separately by the caller.
   */
  async uploadResume(
    userId: string,
    name: string,
    file: File,
  ): Promise<{ resume: Resume; isDuplicate: boolean }> {
    const fileHash = await this.hashFile(file);

    const existing = await resumeRepo.findByUserAndHash(userId, fileHash);
    if (existing) {
      return { resume: existing, isDuplicate: true };
    }

    const isFirst = (await resumeRepo.countByUser(userId)) === 0;

    const resume = await resumeRepo.create(userId, {
      name,
      file_name: file.name,
      file_hash: fileHash,
      file_size_bytes: file.size,
      mime_type: file.type,
      is_default: isFirst,
      parse_status: "pending",
    });

    const path = await resumeStorage.upload(userId, resume.id, file);
    const updated = await resumeRepo.updateFileUrl(resume.id, path);
    return { resume: updated, isDuplicate: false };
  }

  async renameResume(id: string, name: string): Promise<Resume> {
    return resumeRepo.rename(id, name);
  }

  async setDefault(resumeId: string): Promise<void> {
    return resumeRepo.setDefault(resumeId);
  }

  /** Deletes the file (best-effort), then the row (cascades resume_parsed). */
  async deleteResume(userId: string, resumeId: string): Promise<void> {
    await resumeStorage.delete(userId, resumeId);
    await resumeRepo.delete(resumeId);
  }

  /** Signed download URL for a resume file — the bucket is private. */
  async getDownloadUrl(path: string): Promise<string> {
    return resumeStorage.getSignedUrl(path);
  }

  private async hashFile(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

export const resumeService = new ResumeService();
