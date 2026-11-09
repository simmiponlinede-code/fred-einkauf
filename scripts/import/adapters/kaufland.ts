// Kaufland: Übersichtsseite filiale.kaufland.de/angebote/uebersicht.html (laut robots.txt erlaubt,
// Detailseiten nicht). Aufbau geprüft am 09.11.2026: Kacheln .k-product-tile mit Titel, Untertitel,
// Packung (__unit-price), Grundpreis (__base-price) und Preisschildern .k-price-tag.
//
// OFFEN: Die Angebote hängen an der gewählten Filiale. Ohne Filialwahl liefert die Seite
// Standardangebote. Beim ersten Lauf in GitHub Actions prüfen, ob die Preise zur Filiale
// Göttingen (Große Breite 6) passen; die Filiale steht in KAUFLAND_STORE_URL.
import * as cheerio from "cheerio";
import { toCents } from "../../../lib/units";
import type { Adapter, RawOffer } from "../types";
import { isoDate, weekRange } from "../util";

export const URL_KAUFLAND =
  process.env.KAUFLAND_STORE_URL || "https://filiale.kaufland.de/angebote/uebersicht.html?kloffer-week=current";

const SKIP = /drogerie|elektro|heim|bekleidung|pflanze|amaryllis|alpenveilchen|kalanchoe/i;

export function parseKaufland(html: string, today: Date): RawOffer[] {
  const $ = cheerio.load(html);
  const { monday, saturday } = weekRange(today);
  const seen = new Set<string>();
  const out: RawOffer[] = [];

  $("a.k-product-tile, div.k-product-tile").each((_, tile) => {
    const t = (sel: string) => $(tile).find(sel).first().text().replace(/\s+/g, " ").trim();
    const brand = t(".k-product-tile__title");
    const subtitle = t(".k-product-tile__subtitle");
    const title = subtitle || brand;
    if (!title || SKIP.test(`${brand} ${subtitle}`)) return;

    const tags = $(tile).find(".k-price-tag");
    const price = toCents($(tags[0]).find(".k-price-tag__price").text());
    if (!price) return;
    const was = toCents($(tags[0]).find(".k-price-tag__old-price-line-through").text());
    // Ein zweites Preisschild ist der Preis mit Kaufland Card
    const card = tags.length > 1 ? toCents($(tags[1]).find(".k-price-tag__price").text()) : null;

    const pack = t(".k-product-tile__unit-price");
    const key = `${brand}|${subtitle}|${pack}|${price}`.toLowerCase();
    if (seen.has(key)) return; // Topartikel erscheinen mehrfach
    seen.add(key);

    out.push({
      source_key: `${isoDate(monday)}|${key}`,
      title,
      brand: subtitle ? brand : null,
      price_cents: price,
      card_price_cents: card && card < price ? card : null,
      was_price_cents: was,
      pack_text: pack || null,
      base_price_text: t(".k-product-tile__base-price") || null,
      valid_from: isoDate(monday),
      valid_to: isoDate(saturday),
      source_url: URL_KAUFLAND,
    });
  });
  return out;
}

export const kaufland: Adapter = {
  store: "kaufland",
  ready: true,
  async fetchOffers(ctx) {
    return parseKaufland(await ctx.fetchHtml(URL_KAUFLAND), ctx.today);
  },
};
