import type { ApplicationAttachment, ApplicationAttachmentKind } from "@/types";
import { AttachmentRepository } from "@/repositories/AttachmentRepository";
import { DocumentStorage } from "@/services/storage/DocumentStorage";

const attachmentRepo = new AttachmentRepository();
const documentStorage = new DocumentStorage();

/**
 * AttachmentService
 *
 * Uploads go through the existing private `documents` storage bucket
 * (DocumentStorage) — this service only adds the metadata row so attachments
 * can be listed per application (or per reminder, via the optional
 * reminder_id link — same table, same storage, no duplication) with a
 * friendly name/kind/size.
 */
export class AttachmentService {
  async getAttachments(applicationId: string): Promise<ApplicationAttachment[]> {
    return attachmentRepo.findByApplication(applicationId);
  }

  async getReminderAttachments(reminderId: string): Promise<ApplicationAttachment[]> {
    return attachmentRepo.findByReminder(reminderId);
  }

  async uploadAttachment(
    userId: string,
    applicationId: string,
    kind: ApplicationAttachmentKind,
    file: File,
    reminderId?: string,
  ): Promise<ApplicationAttachment> {
    const id = crypto.randomUUID();
    const path = await documentStorage.upload(userId, id, file);
    return attachmentRepo.create(userId, {
      id,
      application_id: applicationId,
      kind,
      name: file.name,
      file_path: path,
      size_bytes: file.size,
      mime_type: file.type || null,
      reminder_id: reminderId ?? null,
    });
  }

  /** Signed download URL — the documents bucket is private. */
  async getDownloadUrl(path: string): Promise<string> {
    return documentStorage.getSignedUrl(path);
  }

  async deleteAttachment(userId: string, id: string): Promise<void> {
    await attachmentRepo.delete(id);
    await documentStorage.delete(userId, id);
  }
}

export const attachmentService = new AttachmentService();
