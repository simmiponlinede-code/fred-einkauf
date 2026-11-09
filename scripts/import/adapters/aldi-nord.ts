// Aldi Nord: Angebote sind bundesweit gleich und stehen auf aldi-nord.de/angebote.html.
// Aufbau geprüft am 10.11.2026:
// 1. Bevorzugt: eingebettete Seitendaten (<script id="__NEXT_DATA__">, props.pageProps.apiData,
//    darin "algoliaDataMap" je Artikel mit Name, Marke, Preis, UVP, Packung, Grundpreis, Gültigkeit).
//    Diese Daten liefert der Server mit der Seite aus; die Kacheln baut erst der Browser.
// 2. Rückfall: Kacheln .product-tile-grid / .product-tile mit data-testid-Feldern.
import * as cheerio from "cheerio";
import { toCents } from "../../../lib/units";
import type { Adapter, RawOffer } from "../types";
import { dayMonth, isoDate, weekRange } from "../util";

export const URL_ALDI = "https://www.aldi-nord.de/angebote.html";

// Non-Food-Abschnitte überspringen, damit die Datenbank klein bleibt
const SKIP_SECTIONS = /mode|spielzeug|schlafzimmer|badezimmer|elektronik|haustier|kueche|deko|pflanzen|kosmetik|haushalt|sport/i;

interface AldiItem {
  objectID?: string;
  name?: string;
  brandName?: string;
  salesUnit?: string;
  currentPrice?: {
    priceValue?: number;
    strikePrice?: { strikePriceValue?: number };
    basePrice?: { basePriceValue?: number; basePriceScale?: string }[];
    validFrom?: number;
    validUntil?: number;
  };
  promotionPrices?: { validFromLocalDate?: string; validUntilLocalDate?: string }[];
}

const cents = (v: number | undefined) => (typeof v === "number" && v > 0 ? Math.round(v * 100) : null);
const epochDate = (s: number | undefined) => (s ? isoDate(new Date(s * 1000 + 3600 * 1000)) : null); // MEZ

/** Liest die eingebetteten Seitendaten (bevorzugter Weg). */
export function parseAldiNextData(html: string, today: Date): RawOffer[] {
  const $ = cheerio.load(html);
  const raw = $("#__NEXT_DATA__").text();
  if (!raw) return [];
  const next = JSON.parse(raw);
  let api = next?.props?.pageProps?.apiData;
  if (typeof api === "string") api = JSON.parse(api);

  const items: AldiItem[] = [];
  (function walk(o: unknown, depth: number) {
    if (!o || typeof o !== "object" || depth > 12) return;
    for (const [k, v] of Object.entries(o)) {
      if (k === "algoliaDataMap" && v && typeof v === "object") items.push(...(Object.values(v) as AldiItem[]));
      else walk(v, depth + 1);
    }
  })(api, 0);

  const { monday, saturday } = weekRange(today);
  const seen = new Set<string>();
  const out: RawOffer[] = [];
  for (const it of items) {
    const price = cents(it.currentPrice?.priceValue);
    if (!it.name || !price) continue;
    const promo = it.promotionPrices?.[0];
    const from = promo?.validFromLocalDate ?? epochDate(it.currentPrice?.validFrom) ?? isoDate(monday);
    const to = promo?.validUntilLocalDate ?? epochDate(it.currentPrice?.validUntil) ?? isoDate(saturday);
    const key = `${it.objectID ?? it.name}|${from}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const base = it.currentPrice?.basePrice?.[0];
    out.push({
      source_key: key,
      title: it.name,
      brand: it.brandName || null,
      price_cents: price,
      was_price_cents: cents(it.currentPrice?.strikePrice?.strikePriceValue),
      pack_text: it.salesUnit || null,
      base_price_text: base?.basePriceScale && base.basePriceValue ? `${base.basePriceScale} = ${base.basePriceValue.toFixed(2)}` : null,
      valid_from: from,
      valid_to: to,
      source_url: URL_ALDI,
    });
  }
  return out;
}

export function parseAldi(html: string, today: Date): RawOffer[] {
  const fromData = parseAldiNextData(html, today);
  if (fromData.length) return fromData;
  return parseAldiTiles(html, today);
}

/** Rückfall: sichtbare Kacheln lesen. */
export function parseAldiTiles(html: string, today: Date): RawOffer[] {
  const $ = cheerio.load(html);
  const out: RawOffer[] = [];
  $(".product-tile-grid").each((_, grid) => {
    const id = $(grid).attr("id") ?? "";
    if (SKIP_SECTIONS.test(id)) return;
    const m = id.match(/Ab-\w+--(\d{1,2})-(\d{1,2})/);
    const from = m ? dayMonth(Number(m[1]), Number(m[2]), today) : weekRange(today).monday;
    const to = weekRange(from).saturday;

    $(grid)
      .find(".product-tile")
      .each((__, tile) => {
        const field = (suffix: string) => $(tile).find(`[data-testid$="-${suffix}"]`).first().text().trim();
        const title = field("product-name");
        const price = toCents(field("tag-current-price-amount"));
        if (!title || !price) return;
        const pack = field("tag-sales-unit");
        out.push({
          source_key: `${id}|${title}|${pack}`.toLowerCase(),
          title,
          brand: field("brand-name") || null,
          price_cents: price,
          was_price_cents: toCents(field("tag-cross-price-label")),
          pack_text: pack || null,
          base_price_text: field("tag-base-price") || null,
          valid_from: isoDate(from),
          valid_to: isoDate(to),
          source_url: `${URL_ALDI}#${id}`,
        });
      });
  });
  return out;
}

export const aldiNord: Adapter = {
  store: "aldi-nord",
  ready: true,
  async fetchOffers(ctx) {
    const html = await ctx.fetchHtml(URL_ALDI);
    const offers = parseAldi(html, ctx.today);
    if (!offers.length)
      console.log(
        `   Diagnose: ${html.length} Zeichen, Seitendaten ${html.includes("__NEXT_DATA__") ? "vorhanden" : "fehlen"}, ` +
          `${(html.match(/product-tile"/g) ?? []).length} Kacheln, Titel „${html.match(/<title>([^<]*)/)?.[1]?.trim() ?? "?"}“`,
      );
    return offers;
  },
};
