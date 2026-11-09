import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseReceipt } from "./parse";

const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");

describe("Kaufland-Bon Göttingen 09.11.", () => {
  const r = parseReceipt(fixture("kaufland-goettingen.txt"));

  it("erkennt Markt, Datum und Summe", () => {
    expect(r.store).toBe("kaufland");
    expect(r.date).toBe("2026-11-09");
    expect(r.totalCents).toBe(4986);
  });

  it("liest Mehrfachpositionen", () => {
    const quark = r.lines.find((l) => l.label === "K.Speisequark")!;
    expect(quark).toMatchObject({ qty: 4, unitCents: 119, totalCents: 476 });
    const milch = r.lines.find((l) => l.label === "K.H-Milch")!;
    expect(milch).toMatchObject({ qty: 4, unitCents: 69 });
  });

  it("verbindet Name und Preis über zwei Zeilen", () => {
    expect(r.lines.find((l) => l.label === "Monster Green Zero")).toMatchObject({ qty: 2, unitCents: 79, totalCents: 158 });
  });

  it("liest Gewichtsware", () => {
    expect(r.lines.find((l) => l.label === "Bananen")).toMatchObject({ weightKg: 0.968, totalCents: 125 });
  });

  it("rechnet Card-Rabatt der Zeile darüber an", () => {
    expect(r.lines.find((l) => l.label === "K.Naturjoghurt")).toMatchObject({ totalCents: 59, discountCents: 20 });
    expect(r.lines.find((l) => l.label === "Barilla Mafaldine")).toMatchObject({ totalCents: 129, discountCents: 20 });
  });

  it("überspringt Pfand", () => {
    expect(r.lines.some((l) => /pfand/i.test(l.label))).toBe(false);
  });

  it("Summe der Positionen + Pfand = Bonsumme", () => {
    const sum = r.lines.reduce((s, l) => s + l.totalCents, 0);
    expect(r.skippedCents).toBe(200); // 6 × 0,25 + 0,50 Pfand
    expect(sum + r.skippedCents).toBe(4986);
    expect(r.warnings).toEqual([]);
  });
});

describe("Kaufland-Bon Wolfsburg 02.10.", () => {
  const r = parseReceipt(fixture("kaufland-wolfsburg.txt"));

  it("erkennt Datum und Summe", () => {
    expect(r.date).toBe("2026-10-02");
    expect(r.totalCents).toBe(4344);
  });

  it("ignoriert Leergut und Tüten, Summe geht trotzdem auf", () => {
    expect(r.lines.some((l) => /leergut|tasche/i.test(l.label))).toBe(false);
    expect(r.warnings).toEqual([]);
  });

  it("liest abgekürzte Namen über zwei Zeilen mit Rabatt", () => {
    expect(r.lines.find((l) => l.label === "KLC.Mozz.Kugel lig")).toMatchObject({ qty: 2, totalCents: 118, unitCents: 59 });
  });
});
