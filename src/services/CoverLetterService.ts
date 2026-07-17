import type { CoverLetter } from "@/types";
import { CoverLetterRepository } from "@/repositories/CoverLetterRepository";
import { DocumentStorage } from "@/services/storage/DocumentStorage";

const coverLetterRepo = new CoverLetterRepository();
const documentStorage = new DocumentStorage();

/**
 * CoverLetterService
 *
 * Cover letters have no prior data model — this is a minimal, from-scratch
 * entity mirroring Resume at the smallest useful size (one row per version),
 * backed by the existing private `documents` storage bucket.
 */
export class CoverLetterService {
  async getCoverLetters(userId: string): Promise<CoverLetter[]> {
    return coverLetterRepo.findAllByUser(userId);
  }

  async getCoverLetter(id: string): Promise<CoverLetter | null> {
    return coverLetterRepo.findById(id);
  }

  async uploadCoverLetter(
    userId: string,
    name: string,
    file: File,
    versionNumber = 1,
  ): Promise<CoverLetter> {
    const coverLetter = await coverLetterRepo.create(userId, { name, version_number: versionNumber });
    const path = await documentStorage.upload(userId, coverLetter.id, file);
    return coverLetterRepo.updateFileUrl(coverLetter.id, path);
  }

  async deleteCoverLetter(id: string): Promise<void> {
    return coverLetterRepo.delete(id);
  }

  /** Signed download URL for a cover letter file — the documents bucket is private. */
  async getDownloadUrl(path: string): Promise<string> {
    return documentStorage.getSignedUrl(path);
  }
}

export const coverLetterService = new CoverLetterService();
