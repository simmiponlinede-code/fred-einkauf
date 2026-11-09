// Preisvergleich mit normaler Programmierlogik. Alles in Cent und Grundpreisen.
import type { BaseUnit } from "./units";

export type StoreId = "aldi-nord" | "lidl" | "kaufland" | "netto" | "edeka";
export type PriceSource = "bon" | "shop" | "manuell" | "import";

export interface Offer {
  id: string;
  store_id: StoreId;
  title: string;
  brand?: string | null;
  price_cents: number;
  card_price_cents?: number | null;
  was_price_cents?: number | null;
  pack_text?: string | null;
  unit: BaseUnit | null;
  unit_price_cents: number | null;
  valid_from: string; // YYYY-MM-DD
  valid_to?: string | null;
}

export interface Observation {
  store_id: StoreId;
  label: string;
  price_cents: number;
  unit: BaseUnit;
  unit_price_cents: number;
  observed_on: string;
  source: PriceSource;
}

export interface Pick {
  kind: "angebot" | "normal";
  store_id: StoreId;
  label: string;
  price_cents: number;
  unit_price_cents: number;
  unit: BaseUnit;
  needsCard?: boolean;
  offerId?: string;
}

export const DEAL_THRESHOLD = 0.05; // ab 5 % gilt ein Angebot als Schnäppchen

const SOURCE_RANK: Record<PriceSource, number> = { bon: 0, shop: 1, manuell: 2, import: 3 };

export function isActive(o: Pick | Offer, on: string): boolean {
  if (!("valid_from" in o)) return true;
  return o.valid_from <= on && (!o.valid_to || o.valid_to >= on);
}

/** Je Markt der neueste Normalpreis; bei gleichem Datum gewinnt Bon vor Shop vor manuell. */
export function normalByStore(obs: Observation[], unit?: BaseUnit): Map<StoreId, Observation> {
  const out = new Map<StoreId, Observation>();
  for (const o of obs) {
    if (unit && o.unit !== unit) continue;
    const cur = out.get(o.store_id);
    if (
      !cur ||
      o.observed_on > cur.observed_on ||
      (o.observed_on === cur.observed_on && SOURCE_RANK[o.source] < SOURCE_RANK[cur.source])
    ) {
      out.set(o.store_id, o);
    }
  }
  return out;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Haushalts-Normalpreis = Median der neuesten Normalpreise über die Märkte. */
export function householdNormal(obs: Observation[], unit?: BaseUnit): number | null {
  return median([...normalByStore(obs, unit).values()].map((o) => o.unit_price_cents));
}

/** Ersparnis gegenüber dem Normalpreis, 0.25 = 25 %. */
export function savings(offerUnitCents: number, normalUnitCents: number | null): number | null {
  if (!normalUnitCents || normalUnitCents <= 0) return null;
  return 1 - offerUnitCents / normalUnitCents;
}

export function offerToPick(o: Offer, useCard = true): Pick | null {
  if (!o.unit || !o.unit_price_cents) return null;
  const card = useCard && o.card_price_cents && o.card_price_cents < o.price_cents;
  const price = card ? o.card_price_cents! : o.price_cents;
  const unitPrice = card ? Math.round((o.unit_price_cents * price) / o.price_cents) : o.unit_price_cents;
  return {
    kind: "angebot",
    store_id: o.store_id,
    label: [o.brand, o.title].filter(Boolean).join(" "),
    price_cents: price,
    unit_price_cents: unitPrice,
    unit: o.unit,
    needsCard: !!card,
    offerId: o.id,
  };
}

export function obsToPick(o: Observation): Pick {
  return {
    kind: "normal",
    store_id: o.store_id,
    label: o.label,
    price_cents: o.price_cents,
    unit_price_cents: o.unit_price_cents,
    unit: o.unit,
  };
}

export interface Analysis {
  best: Pick | null;
  offers: Pick[]; // aktive Angebote, günstigste zuerst
  normals: Pick[]; // Normalpreise je Markt, günstigste zuerst
  normalCents: number | null; // Haushalts-Normalpreis (Grundpreis)
  saving: number | null; // Ersparnis des besten Angebots
  isDeal: boolean;
  isHistoryLow: boolean;
  /** Ein Normalpreis woanders ist günstiger als das beste Angebot. */
  cheaperNormalElsewhere: Pick | null;
}

/**
 * Bewertet ein Produkt.
 * @param unit Einheit des Produkts; Angebote/Preise mit anderer Einheit werden ignoriert.
 * @param historyLowCents bisher niedrigster Grundpreis (vor dieser Woche), falls bekannt.
 */
export function analyze(
  unit: BaseUnit,
  offers: Offer[],
  obs: Observation[],
  today: string,
  historyLowCents: number | null = null,
  useCard = true,
): Analysis {
  const offerPicks = offers
    .filter((o) => o.unit === unit && isActive(o, today))
    .map((o) => offerToPick(o, useCard))
    .filter((p): p is Pick => !!p)
    .sort((a, b) => a.unit_price_cents - b.unit_price_cents);

  const normals = [...normalByStore(obs, unit).values()]
    .map(obsToPick)
    .sort((a, b) => a.unit_price_cents - b.unit_price_cents);

  const normalCents = householdNormal(obs, unit);
  const bestOffer = offerPicks[0] ?? null;
  const bestNormal = normals[0] ?? null;

  let best: Pick | null = bestOffer ?? bestNormal;
  if (bestOffer && bestNormal && bestNormal.unit_price_cents < bestOffer.unit_price_cents) best = bestNormal;

  const saving = bestOffer ? savings(bestOffer.unit_price_cents, normalCents) : null;
  const isDeal = saving != null && saving >= DEAL_THRESHOLD;
  const isHistoryLow =
    !!bestOffer && historyLowCents != null && bestOffer.unit_price_cents < historyLowCents;
  const cheaperNormalElsewhere =
    bestOffer && bestNormal && bestNormal.unit_price_cents < bestOffer.unit_price_cents ? bestNormal : null;

  return { best, offers: offerPicks, normals, normalCents, saving, isDeal, isHistoryLow, cheaperNormalElsewhere };
}

/** Niedrigster Grundpreis aus allen bisherigen Angeboten und Beobachtungen vor einem Stichtag. */
export function historyLow(offers: Offer[], obs: Observation[], unit: BaseUnit, before: string): number | null {
  const vals = [
    ...offers.filter((o) => o.unit === unit && o.valid_from < before && o.unit_price_cents).map((o) => o.unit_price_cents!),
    ...obs.filter((o) => o.unit === unit && o.observed_on < before).map((o) => o.unit_price_cents),
  ];
  return vals.length ? Math.min(...vals) : null;
}

// ---------------------------------------------------------------
// Einkaufsplan: höchstens zwei Märkte
// ---------------------------------------------------------------

export interface PlanItem {
  productId: string;
  candidates: Pick[]; // alle Angebote und Normalpreise des Produkts
}

export interface Plan {
  stores: StoreId[];
  totalCents: number; // je 1 Packung zum besten Preis
  covered: number; // wie viele Produkte es dort gibt
  assignments: { productId: string; pick: Pick | null }[];
}

function planFor(stores: StoreId[], items: PlanItem[]): Plan {
  let total = 0;
  let covered = 0;
  const assignments = items.map((it) => {
    const pick =
      it.candidates
        .filter((c) => stores.includes(c.store_id))
        .sort((a, b) => a.price_cents - b.price_cents)[0] ?? null;
    if (pick) {
      total += pick.price_cents;
      covered++;
    }
    return { productId: it.productId, pick };
  });
  return { stores, totalCents: total, covered, assignments };
}

const better = (a: Plan, b: Plan) => a.covered > b.covered || (a.covered === b.covered && a.totalCents < b.totalCents);

/**
 * Rechnet alle Einzelmärkte und alle Zweierkombinationen durch.
 * Ein zweiter Markt wird nur empfohlen, wenn er mindestens `thresholdCents` spart
 * oder mehr Produkte abdeckt.
 */
export function planShopping(
  items: PlanItem[],
  stores: StoreId[],
  thresholdCents = 300,
): { single: Plan | null; pair: Plan | null; recommended: Plan | null } {
  let single: Plan | null = null;
  for (const s of stores) {
    const p = planFor([s], items);
    if (!single || better(p, single)) single = p;
  }
  let pair: Plan | null = null;
  for (let i = 0; i < stores.length; i++)
    for (let j = i + 1; j < stores.length; j++) {
      const p = planFor([stores[i], stores[j]], items);
      if (!pair || better(p, pair)) pair = p;
    }
  let recommended = single;
  if (pair && single) {
    const moreCovered = pair.covered > single.covered;
    const saves = single.totalCents - pair.totalCents >= thresholdCents && pair.covered >= single.covered;
    if (moreCovered || saves) recommended = pair;
  }
  return { single, pair, recommended };
}
