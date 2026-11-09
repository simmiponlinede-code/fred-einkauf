import type { StoreId } from "../../lib/pricing";

/** Was ein Adapter pro Angebot liefert, noch ohne Grundpreis-Berechnung. */
export interface RawOffer {
  source_key: string;
  title: string;
  brand?: string | null;
  price_cents: number;
  card_price_cents?: number | null;
  was_price_cents?: number | null;
  pack_text?: string | null;
  base_price_text?: string | null; // z. B. "kg = 1.19"
  valid_from: string; // YYYY-MM-DD
  valid_to?: string | null;
  source_url: string;
}

export interface Adapter {
  store: StoreId;
  /** false = Adapter noch nicht gebaut, wird übersprungen */
  ready: boolean;
  fetchOffers(ctx: AdapterContext): Promise<RawOffer[]>;
}

export interface AdapterContext {
  today: Date;
  fetchHtml(url: string): Promise<string>;
}
