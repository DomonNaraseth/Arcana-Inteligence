import { getContext, supabaseConfigured } from "../supabase/server";
import { DEFAULT_KNOWLEDGE, getKnowledge, type Knowledge } from "./knowledge";

/**
 * Effective knowledge base for the current request (server components).
 * Falls back to the shipped defaults if the database is unreachable, so the
 * card library never goes blank.
 */
export async function currentKnowledge(): Promise<Knowledge> {
  if (!supabaseConfigured()) return DEFAULT_KNOWLEDGE;
  try {
    const { supabase } = await getContext();
    return await getKnowledge(supabase);
  } catch {
    return DEFAULT_KNOWLEDGE;
  }
}
