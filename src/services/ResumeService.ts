import type { Resume, ResumeVersion } from "@/types";
import { ResumeRepository } from "@/repositories/ResumeRepository";
import { ResumeStorage } from "@/services/storage/ResumeStorage";

const resumeRepo = new ResumeRepository();
const resumeStorage = new ResumeStorage();

/**
 * ResumeService
 *
 * Read access to the user's resumes for the Application Detail page's Resume
 * Association picker, plus a minimal upload path (there is no other write
 * path into `resumes` today — the standalone Resumes page is still mock data).
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

  /** Uploads a file to the resumes bucket and creates the matching resumes row. */
  async uploadResume(userId: string, name: string, file: File): Promise<Resume> {
    const resume = await resumeRepo.create(userId, { name });
    const path = await resumeStorage.upload(userId, resume.id, file);
    return resumeRepo.updateFileUrl(resume.id, path);
  }

  /** Signed download URL for a resume file — the bucket is private. */
  async getDownloadUrl(path: string): Promise<string> {
    return resumeStorage.getSignedUrl(path);
  }
}

export const resumeService = new ResumeService();
