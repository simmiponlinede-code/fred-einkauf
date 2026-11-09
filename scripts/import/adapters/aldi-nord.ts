// Aldi Nord: Angebote sind bundesweit gleich und stehen als Text auf aldi-nord.de/angebote.html.
// Aufbau geprüft am 09.11.2026: Abschnitte .product-tile-grid mit id "Ab-Mo--9-11--…",
// darin .product-tile mit data-testid-Feldern für Name, Marke, Preis, UVP, Packung, Grundpreis.
import * as cheerio from "cheerio";
import { toCents } from "../../../lib/units";
import type { Adapter, RawOffer } from "../types";
import { dayMonth, isoDate, weekRange } from "../util";

export const URL_ALDI = "https://www.aldi-nord.de/angebote.html";

// Non-Food-Abschnitte überspringen, damit die Datenbank klein bleibt
const SKIP_SECTIONS = /mode|spielzeug|schlafzimmer|badezimmer|elektronik|haustier|kueche|deko|pflanzen|kosmetik|haushalt|sport/i;

export function parseAldi(html: string, today: Date): RawOffer[] {
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
    return parseAldi(await ctx.fetchHtml(URL_ALDI), ctx.today);
  },
};
