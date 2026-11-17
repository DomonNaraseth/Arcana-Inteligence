export type Arcana = "major" | "minor";
export type Suit = "wands" | "cups" | "swords" | "pentacles" | null;
export type Element = "fire" | "water" | "air" | "earth" | "spirit";
export type Orientation = "upright" | "reversed";

export interface TarotCard {
  /** stable id e.g. "the-fool", "ace-of-wands" */
  id: string;
  name: string;
  nameTh: string;
  arcana: Arcana;
  suit: Suit;
  /** 0-21 for major, 1-14 for minor (11=Page,12=Knight,13=Queen,14=King) */
  number: number;
  element: Element;
  /** image file under /public/cards */
  image: string;
  keywords: string[];
  keywordsReversed: string[];
  uprightTh: string;
  reversedTh: string;
  loveTh: string;
  careerTh: string;
  financeTh: string;
  adviceTh: string;
}

export interface SpreadPosition {
  key: string;
  nameTh: string;
  nameEn: string;
  meaningTh: string;
}

export interface Spread {
  id: string;
  nameEn: string;
  nameTh: string;
  descriptionTh: string;
  category:
    | "general"
    | "love"
    | "career"
    | "decision"
    | "timeline"
    | "insight"
    | "spiritual"
    | "forecast";
  cardCount: number;
  positions: SpreadPosition[];
  /** question intents this spread suits */
  recommendedFor: string[];
  /** how the AI should approach synthesis for this spread */
  interpretationStrategyTh: string;
}

export interface DrawnCard {
  position: number;
  positionKey: string;
  cardId: string;
  orientation: Orientation;
  isFollowup?: boolean;
}
