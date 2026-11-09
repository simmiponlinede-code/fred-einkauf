import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAldi, parseAldiNextData } from "./adapters/aldi-nord";
import { parseKaufland } from "./adapters/kaufland";
import { normalizeOffer } from "./util";

const html = (f: string) => readFileSync(join(__dirname, "__fixtures__", f), "utf8");
const today = new Date(Date.UTC(2026, 10, 10)); // Di., 10.11.2026

describe("Aldi Nord", () => {
  const offers = parseAldi(html("aldi.html"), today);

  it("liest Name, Marke, Preis, UVP und Packung", () => {
    expect(offers.find((o) => o.title === "Haltbare Landmilch")).toMatchObject({
      brand: "LANDLIEBE",
      price_cents: 88,
      was_price_cents: 145,
      pack_text: "1-L-Packung",
      valid_from: "2026-11-09",
      valid_to: "2026-11-14",
    });
  });

  it("nimmt das Startdatum aus dem Abschnitt", () => {
    expect(offers.find((o) => o.title.startsWith("Speisekürbis"))?.valid_from).toBe("2026-11-12");
  });

  it("überspringt Non-Food", () => {
    expect(offers.some((o) => o.title === "Strickpullover")).toBe(false);
  });

  it("berechnet Grundpreise", () => {
    const joghurt = normalizeOffer(offers.find((o) => o.title === "Joghurt mit der Ecke")!);
    expect(joghurt).toMatchObject({ unit: "kg", amount: 150, unit_price_cents: 220 });
    const kuerbis = normalizeOffer(offers.find((o) => o.title.startsWith("Speisekürbis"))!);
    expect(kuerbis).toMatchObject({ unit: "kg", unit_price_cents: 119 });
  });
});

describe("Aldi Nord über eingebettete Seitendaten", () => {
  const offers = parseAldiNextData(html("aldi-nextdata.html"), today);

  it("liest Artikel mit Preis, UVP, Packung und Gültigkeit", () => {
    expect(offers).toHaveLength(2); // Artikel ohne Preis fällt raus
    expect(offers.find((o) => o.title === "Haltbare Landmilch")).toMatchObject({
      brand: "LANDLIEBE",
      price_cents: 88,
      was_price_cents: 145,
      pack_text: "1-L-Packung",
      valid_from: "2026-11-09",
      valid_to: "2026-11-14",
    });
  });

  it("nimmt das Datum aus dem Zeitstempel, wenn keine Aktionsdaten da sind", () => {
    const k = offers.find((o) => o.title.startsWith("Speisekürbis"))!;
    expect(k.valid_from).toBe("2026-11-12");
    expect(normalizeOffer(k)).toMatchObject({ unit: "kg", unit_price_cents: 119 });
  });

  it("parseAldi bevorzugt die Seitendaten", () => {
    expect(parseAldi(html("aldi-nextdata.html"), today)).toHaveLength(2);
  });
});

describe("Kaufland", () => {
  const offers = parseKaufland(html("kaufland.html"), today);

  it("liest Preis, Statt-Preis und Grundpreis", () => {
    const monster = offers.find((o) => o.title === "Energy Drink")!;
    expect(monster).toMatchObject({ brand: "MONSTER", price_cents: 79, was_price_cents: 159, valid_from: "2026-11-09", valid_to: "2026-11-14" });
    expect(normalizeOffer(monster)).toMatchObject({ unit: "l", unit_price_cents: 158 });
  });

  it("entfernt doppelte Topartikel", () => {
    expect(offers.filter((o) => o.title === "Energy Drink")).toHaveLength(1);
  });

  it("erkennt den Card-Preis", () => {
    expect(offers.find((o) => o.title === "Kefir")).toMatchObject({ price_cents: 149, card_price_cents: 139 });
  });

  it("überspringt Pflanzen", () => {
    expect(offers.some((o) => o.title === "Amaryllis")).toBe(false);
  });
});
