import type { ApplicationContact, ApplicationContactType } from "@/types";
import { ContactRepository } from "@/repositories/ContactRepository";

const contactRepo = new ContactRepository();

export class ContactService {
  async getContacts(applicationId: string): Promise<ApplicationContact[]> {
    return contactRepo.findByApplication(applicationId);
  }

  async createContact(
    userId: string,
    applicationId: string,
    input: {
      type: ApplicationContactType;
      name: string;
      email?: string | null;
      linkedin_url?: string | null;
      notes?: string | null;
    },
  ): Promise<ApplicationContact> {
    return contactRepo.create(userId, { application_id: applicationId, ...input });
  }

  async updateContact(
    id: string,
    updates: Partial<
      Pick<ApplicationContact, "type" | "name" | "email" | "linkedin_url" | "notes">
    >,
  ): Promise<ApplicationContact> {
    return contactRepo.update(id, updates);
  }

  async deleteContact(id: string): Promise<void> {
    return contactRepo.delete(id);
  }
}

export const contactService = new ContactService();
