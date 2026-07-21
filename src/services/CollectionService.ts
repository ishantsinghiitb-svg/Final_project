import type { Collection, CollectionColor, CollectionWithStats, GlobalJob } from "@/types";
import { CollectionRepository } from "@/repositories/CollectionRepository";
import { jobService } from "@/services/JobService";

const collectionRepo = new CollectionRepository();

/**
 * CollectionService
 *
 * Owns Collections business logic (Module 5B). Composes CollectionRepository
 * (collections / collection_jobs) with the existing JobService (global_jobs)
 * to hydrate a collection's membership rows into full GlobalJob records —
 * neither repository reaches into the other's table directly.
 */
export class CollectionService {
  async getCollections(userId: string): Promise<CollectionWithStats[]> {
    return collectionRepo.findAllByUser(userId);
  }

  async getCollection(id: string): Promise<Collection | null> {
    return collectionRepo.findById(id);
  }

  async createCollection(
    userId: string,
    name: string,
    description?: string,
    color?: CollectionColor,
  ): Promise<Collection> {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Collection name is required.");
    return collectionRepo.create(userId, trimmedName, description?.trim() || undefined, color);
  }

  async updateCollection(
    id: string,
    fields: { name?: string; description?: string | null; color?: CollectionColor | null },
  ): Promise<Collection> {
    const trimmed = { ...fields };
    if (typeof trimmed.name === "string") {
      const name = trimmed.name.trim();
      if (!name) throw new Error("Collection name is required.");
      trimmed.name = name;
    }
    if (typeof trimmed.description === "string") {
      trimmed.description = trimmed.description.trim() || null;
    }
    return collectionRepo.update(id, trimmed);
  }

  async deleteCollection(id: string): Promise<void> {
    return collectionRepo.remove(id);
  }

  /**
   * Full GlobalJob rows for every job in a collection, in added-to-collection
   * order (most recent first). findByIds doesn't guarantee row order, so the
   * id order resolved in step 1 is restored after the batch fetch.
   */
  async getCollectionJobs(collectionId: string): Promise<GlobalJob[]> {
    const ids = await collectionRepo.findJobIdsInCollection(collectionId);
    if (ids.length === 0) return [];

    const jobs = await jobService.getJobsByIds(ids);
    const byId = new Map(jobs.map((j) => [j.id, j]));
    return ids.map((id) => byId.get(id)).filter((j): j is GlobalJob => j !== undefined);
  }

  async getCollectionIdsForJob(userId: string, jobId: string): Promise<string[]> {
    return collectionRepo.findCollectionIdsForJob(userId, jobId);
  }

  async addJobToCollection(userId: string, collectionId: string, jobId: string): Promise<void> {
    return collectionRepo.addJob(userId, collectionId, jobId);
  }

  async removeJobFromCollection(collectionId: string, jobId: string): Promise<void> {
    return collectionRepo.removeJob(collectionId, jobId);
  }
}

// Singleton — import `collectionService` everywhere instead of `new CollectionService()`
export const collectionService = new CollectionService();
