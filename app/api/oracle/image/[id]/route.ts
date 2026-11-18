import { z } from "zod";
import { getContext, getSystemClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };
type Row = { mime: string; data: string };

const notFound = () => new Response("Not found", { status: 404 });

/**
 * Serves an oracle picture. Pictures of published decks are public and never
 * change (a repaint gets a new id), so browsers and the CDN may keep them for a
 * year. Draft pictures are shown only to admins and never cached.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return notFound();

  const pub = await getSystemClient().rpc("arcana_oracle_image", { p_id: id });
  let row = (pub.data as Row[] | null)?.[0];
  let isPublic = Boolean(row);
  if (!row) {
    try {
      const { supabase } = await getContext();
      const priv = await supabase.rpc("arcana_oracle_image", { p_id: id });
      row = (priv.data as Row[] | null)?.[0];
      isPublic = false;
    } catch {
      // no session: drafts stay hidden
    }
  }
  if (!row) return notFound();

  return new Response(Buffer.from(row.data, "base64"), {
    headers: {
      "content-type": row.mime,
      "cache-control": isPublic ? "public, max-age=31536000, immutable" : "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
