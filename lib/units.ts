// Mengen und Grundpreise aus Prospekt- und Bontexten lesen.
// Intern: Gewicht in g, Volumen in ml, Stück als Anzahl. Preise in ganzen Cent.

export type BaseUnit = "kg" | "l" | "stk";

export interface Amount {
  amount: number; // g, ml oder Stück
  unit: BaseUnit;
}

/** "1,19" | "1.19" | "1.19**" → 119 */
export function toCents(text: string): number | null {
  const m = String(text).replace(/\s/g, "").match(/-?\d+(?:[.,]\d{1,2})?/);
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const num = (s: string) => Number(s.replace(",", "."));

const UNIT_MAP: Record<string, { unit: BaseUnit; factor: number }> = {
  g: { unit: "kg", factor: 1 },
  gr: { unit: "kg", factor: 1 },
  kg: { unit: "kg", factor: 1000 },
  ml: { unit: "l", factor: 1 },
  cl: { unit: "l", factor: 10 },
  l: { unit: "l", factor: 1000 },
  liter: { unit: "l", factor: 1000 },
  st: { unit: "stk", factor: 1 },
  stk: { unit: "stk", factor: 1 },
  stück: { unit: "stk", factor: 1 },
};

/**
 * Liest eine Packungsangabe.
 * Beispiele: "500-g-Packung", "je 0,5-l-Dose", "4 x 150 g", "6x1,5 l", "10 St.", "kg-Preis", "1-kg-Netz".
 * Bereiche wie "310 - 445-g-Packg." sind mehrdeutig → null (dann Grundpreis der Seite nutzen).
 */
export function parseAmount(text: string): Amount | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/ /g, " ");

  if (/\d\s*-\s*\d+[\s-]*(g|kg|ml|l)\b/.test(t) && !/x/.test(t)) return null; // Bereich

  // Mehrfachpackung: "4 x 150 g", "6x1,5 l", "4 x 125-g-Becher"
  const multi = t.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)[\s-]*(kg|g|ml|cl|l)\b/);
  if (multi) {
    const u = UNIT_MAP[multi[3]];
    return { amount: Number(multi[1]) * num(multi[2]) * u.factor, unit: u.unit };
  }

  // "je 8 St. = 240-g-Packg." → das Gewicht zählt
  const eq = t.match(/=\s*(\d+(?:[.,]\d+)?)[\s-]*(kg|g|ml|cl|l)\b/);
  if (eq) {
    const u = UNIT_MAP[eq[2]];
    return { amount: num(eq[1]) * u.factor, unit: u.unit };
  }

  // Einzelmenge: "500-g-Packung", "0,5-l-Dose", "1,5 l"
  const single = t.match(/(\d+(?:[.,]\d+)?)[\s-]*(kg|gr|g|ml|cl|liter|l)\b/);
  if (single) {
    const u = UNIT_MAP[single[2]];
    return { amount: num(single[1]) * u.factor, unit: u.unit };
  }

  // Stück: "10 St.", "6 Stück", "10er"
  const pcs = t.match(/(\d+)\s*(st\.?|stk\.?|stück|er\b)/);
  if (pcs) return { amount: Number(pcs[1]), unit: "stk" };

  // Lose Ware: "kg-Preis", "je kg", "per kg"
  if (/\bkg\b/.test(t)) return { amount: 1000, unit: "kg" };
  if (/\bje st(ü|u)ck\b|\bstück\b|\bst\.?\b/.test(t)) return { amount: 1, unit: "stk" };

  return null;
}

/** Grundpreis in Cent je kg, l oder Stück. */
export function unitPriceCents(priceCents: number, a: Amount): number {
  if (a.unit === "stk") return Math.round(priceCents / a.amount);
  return Math.round((priceCents * 1000) / a.amount);
}

/** "kg = 1.19", "(1 l = 1.58)", "Liter = 0.88", "(1 kg = 4.03 - 5.78)" → erster Wert */
export function parseBasePrice(text: string): { unit: BaseUnit; cents: number; perAmount: number } | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const m = t.match(/(\d+(?:[.,]\d+)?)?\s*(kg|liter|l|stück|st\.?|100 g|100 ml)\s*=\s*(\d+[.,]\d{2})/);
  if (!m) return null;
  const cents = toCents(m[3]);
  if (cents == null) return null;
  const u = m[2];
  const qty = m[1] ? num(m[1]) : 1;
  if (u === "kg") return { unit: "kg", cents: Math.round(cents / qty), perAmount: 1000 };
  if (u === "l" || u === "liter") return { unit: "l", cents: Math.round(cents / qty), perAmount: 1000 };
  if (u === "100 g") return { unit: "kg", cents: cents * 10, perAmount: 1000 };
  if (u === "100 ml") return { unit: "l", cents: cents * 10, perAmount: 1000 };
  return { unit: "stk", cents: Math.round(cents / qty), perAmount: 1 };
}

export function formatEuro(cents: number | null | undefined): string {
  if (cents == null) return "–";
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function unitLabel(u: BaseUnit): string {
  return u === "stk" ? "Stück" : u;
}
