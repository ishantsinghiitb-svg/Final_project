import { supabase } from "@/lib/supabase";
import type { Feedback } from "@/types";
import type { FeedbackInsert } from "@/types/database";

const TABLE = "feedback";
const COLUMNS = "id, user_id, category, message, page_path, created_at";

export class FeedbackRepository {
  async create(feedback: FeedbackInsert): Promise<Feedback | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(feedback)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw error;
    return data as Feedback | null;
  }
}
