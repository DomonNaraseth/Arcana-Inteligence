"use client";

import { Fragment, createContext, useContext } from "react";
import { splitCardMentions, type MentionCard } from "@/lib/tarot/mentions";

/** The drawn cards of the reading on screen, with how each was drawn. */
export interface ProseCard extends MentionCard {
  reversed: boolean;
}

const CardsContext = createContext<ProseCard[]>([]);

export const CardProseProvider = CardsContext.Provider;

/** Reading text with every drawn card's name marked in gold, so the reader sees which card a sentence rests on. */
export function CardProse({ text }: { text: string }) {
  const cards = useContext(CardsContext);
  const byId = new Map(cards.map((c) => [c.id, c]));
  return (
    <>
      {splitCardMentions(text, cards).map((s, i) => {
        if (!s.cardId) return <Fragment key={i}>{s.text}</Fragment>;
        const c = byId.get(s.cardId);
        return (
          <mark
            key={i}
            className="rounded bg-gold/10 px-0.5 font-medium text-gold-light [box-decoration-break:clone]"
            title={c ? `${c.name} · ${c.nameTh}${c.reversed ? " · กลับหัว" : ""}` : undefined}
          >
            {s.text}
          </mark>
        );
      })}
    </>
  );
}
