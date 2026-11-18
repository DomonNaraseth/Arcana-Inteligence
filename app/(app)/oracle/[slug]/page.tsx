import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OracleDeckView } from "@/components/oracle/OracleDeckView";
import type { OracleDeck } from "@/lib/oracle/schemas";
import { getSystemClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ slug: string }> };
export const revalidate = 300;

async function load(slug: string): Promise<OracleDeck | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) return null;
  try {
    const { data } = await getSystemClient().rpc("arcana_oracle_public_deck", { p_slug: slug });
    const deck = data as OracleDeck | null;
    return deck?.status === "published" ? deck : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const deck = await load((await params).slug);
  return deck ? { title: `${deck.title} · ไพ่ออราเคิล`, description: deck.tagline } : { title: "ไพ่ออราเคิล" };
}

export default async function OracleDeckPage({ params }: Props) {
  const deck = await load((await params).slug);
  if (!deck) notFound();
  return <OracleDeckView deck={{ ...deck, cards: deck.cards.filter((c) => c.message) }} />;
}
