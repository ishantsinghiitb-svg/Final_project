import { supabase } from "@/lib/supabase";
import type { Collection, CollectionColor, CollectionWithStats } from "@/types";

const COLLECTION_COLUMNS = "id, user_id, name, description, color, created_at, updated_at";

export class CollectionRepository {
  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * All of a user's collections, most-recently-updated first, enriched with
   * job_count and top_sources. Two queries total regardless of how many
   * collections the user has: (1) the collections themselves, (2) every
   * membership row for those collections joined to its job's `source` — then
   * both stats are aggregated client-side. Mirrors the batching approach
   * JobRepository already uses for skills (findSkillsForJob / skillsByJobIds)
   * rather than a per-collection round trip or a new SQL function.
   */
  async findAllByUser(userId: string): Promise<CollectionWithStats[]> {
    const { data: rows, error } = await supabase
      .from("collections")
      .select(COLLECTION_COLUMNS)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const collections = (rows ?? []) as unknown as Collection[];
    if (collections.length === 0) return [];

    const { data: memberRows, error: memberError } = await supabase
      .from("collection_jobs")
      .select("collection_id, global_jobs(source)")
      .in(
        "collection_id",
        collections.map((c) => c.id),
      );
    if (memberError) throw memberError;

    type MemberRow = { collection_id: string; global_jobs: { source: string } | null };

    const jobCounts = new Map<string, number>();
    const sourceCounts = new Map<string, Map<string, number>>();

    for (const row of (memberRows ?? []) as unknown as MemberRow[]) {
      jobCounts.set(row.collection_id, (jobCounts.get(row.collection_id) ?? 0) + 1);

      const source = row.global_jobs?.source;
      if (!source) continue;
      if (!sourceCounts.has(row.collection_id)) sourceCounts.set(row.collection_id, new Map());
      const bySource = sourceCounts.get(row.collection_id)!;
      bySource.set(source, (bySource.get(source) ?? 0) + 1);
    }

    return collections.map((c) => {
      const bySource = sourceCounts.get(c.id);
      const top_sources = bySource
        ? [...bySource.entries()]
            .map(([source, count]) => ({ source, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3)
        : [];
      return { ...c, job_count: jobCounts.get(c.id) ?? 0, top_sources };
    });
  }

  async findById(id: string): Promise<Collection | null> {
    const { data, error } = await supabase
      .from("collections")
      .select(COLLECTION_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as Collection | null;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  async create(
    userId: string,
    name: string,
    description?: string,
    color?: CollectionColor,
  ): Promise<Collection> {
    const { data, error } = await supabase
      .from("collections")
      .insert({ user_id: userId, name, description: description ?? null, color: color ?? null })
      .select(COLLECTION_COLUMNS)
      .single();
    if (error) throw error;
    return data as Collection;
  }

  async update(
    id: string,
    fields: { name?: string; description?: string | null; color?: CollectionColor | null },
  ): Promise<Collection> {
    const { data, error } = await supabase
      .from("collections")
      .update(fields)
      .eq("id", id)
      .select(COLLECTION_COLUMNS)
      .single();
    if (error) throw error;
    return data as Collection;
  }

  /**
   * Deletes a collection. ON DELETE CASCADE on collection_jobs.collection_id
   * removes ONLY the membership rows for this collection — global_jobs has no
   * foreign key pointing at collections, so this can never delete, or cascade
   * into, a global_jobs row. Jobs remain in global_jobs and in any other
   * collection they belong to.
   */
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("collections").delete().eq("id", id);
    if (error) throw error;
  }

  // ── Membership ────────────────────────────────────────────────────────────

  /** job_ids in a collection, most-recently-added first. */
  async findJobIdsInCollection(collectionId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from("collection_jobs")
      .select("job_id")
      .eq("collection_id", collectionId)
      .order("added_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => r.job_id as string);
  }

  /** Which of the user's collections a given job already belongs to — powers the Add-to-Collection picker's membership checkmarks. */
  async findCollectionIdsForJob(userId: string, jobId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from("collection_jobs")
      .select("collection_id")
      .eq("user_id", userId)
      .eq("job_id", jobId);
    if (error) throw error;
    return (data ?? []).map((r) => r.collection_id as string);
  }

  /**
   * Adds a job to a collection. Upserts with ignoreDuplicates so a repeated
   * add (e.g. a double-click before the optimistic UI settles) is a silent
   * no-op instead of a unique-constraint error — the row already reflects the
   * desired state either way.
   */
  async addJob(userId: string, collectionId: string, jobId: string): Promise<void> {
    const { error } = await supabase
      .from("collection_jobs")
      .upsert(
        { user_id: userId, collection_id: collectionId, job_id: jobId },
        { onConflict: "collection_id,job_id", ignoreDuplicates: true },
      );
    if (error) throw error;
  }

  async removeJob(collectionId: string, jobId: string): Promise<void> {
    const { error } = await supabase
      .from("collection_jobs")
      .delete()
      .eq("collection_id", collectionId)
      .eq("job_id", jobId);
    if (error) throw error;
  }
}
