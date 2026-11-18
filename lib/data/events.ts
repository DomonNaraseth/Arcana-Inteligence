import type { SupabaseClient } from "@supabase/supabase-js";
import type { Device, Touch } from "../tracking";

/**
 * Records a measurement event for the request's own user key. Measurement
 * must never break the product, so failures are logged and swallowed.
 */
export async function recordEvent(
  supabase: SupabaseClient,
  event: "page_view" | "out_of_credits" | "share",
  path: string,
  extra: { touch?: Touch | null; device?: Device | null } = {},
): Promise<void> {
  const { error } = await supabase.rpc("arcana_track", {
    p_event: event,
    p_path: path,
    p_touch: extra.touch ?? null,
    p_device: extra.device ?? null,
  });
  if (error) console.error("[arcana] track failed:", error.message);
}
