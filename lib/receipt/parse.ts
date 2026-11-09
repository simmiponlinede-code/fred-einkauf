// Kassenbon-Text → Positionen, ohne KI. Regelsatz für Kaufland, Grundlage für weitere Märkte.
import type { StoreId } from "../pricing";
import { toCents } from "../units";

export interface ReceiptLine {
  raw: string;
  label: string;
  qty: number; // Stückzahl (bei Gewichtsware 1)
  weightKg: number | null;
  unitCents: number; // Preis je Stück bzw. je Packung nach Rabatt
  totalCents: number; // Zeilensumme nach Rabatt
  discountCents: number; // abgezogener Rabatt (positiv)
}

export interface ParsedReceipt {
  store: StoreId | null;
  date: string | null; // YYYY-MM-DD
  totalCents: number | null;
  skippedCents: number;
  lines: ReceiptLine[];
  warnings: string[];
}

const SKIP = /^(pfandartikel|pfand\b|leergut|tk tasche|tasche|t[uü]te|summe|zu zahlen|gegeben|r[uü]ckgeld|kartenzahlung|bar\b|ec\b|steuer|mwst|netto|brutto|[ab] \d+,\d+%)/i;
const DISCOUNT = /(rabatt|card xtra|lidl plus|coupon|preisvorteil|nachlass)/i;
const PRICE_END = /\s+(-?\d+[.,]\d{2})(?:\s*[AB12*]{1,2})?\s*$/;
const MULTI = /(\d+)\s*[*x×]\s*(\d+[.,]\d{2})\s*$/;
const WEIGHT = /(\d+[.,]\d{1,3})\s*kg\s*$/i;

export function detectStore(text: string): StoreId | null {
  const t = text.toLowerCase();
  if (t.includes("kaufland")) return "kaufland";
  if (/\baldi\b/.test(t)) return "aldi-nord";
  if (/\blidl\b/.test(t)) return "lidl";
  if (/\bnetto\b/.test(t)) return "netto";
  if (/\bedeka\b/.test(t)) return "edeka";
  return null;
}

export function detectDate(text: string): string | null {
  const m = text.match(/(?:datum\s*)?\b(\d{2})\.(\d{2})\.(\d{2}|\d{4})\b/i);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2]}-${m[1]}`;
}

/** Zerlegt den Bontext. Erwartet eine Position pro Zeile (pdf.js-Zeilen oder OCR). */
export function parseReceipt(text: string): ParsedReceipt {
  const warnings: string[] = [];
  const store = detectStore(text);
  const date = detectDate(text.match(/datum[^\n]*/i)?.[0] ?? text);

  const all = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
  let start = all.findIndex((l) => /preis\s*eur/i.test(l));
  start = start === -1 ? 0 : start + 1;
  let end = all.findIndex((l, i) => i >= start && /^\s*(summe|zu zahlen)\b/i.test(l));
  const totalLine = end !== -1 ? all[end] : null;
  if (end === -1) end = all.length;

  const lines: ReceiptLine[] = [];
  let pendingLabel: string | null = null;
  let skippedCents = 0; // Pfand, Leergut, Tüten

  for (const rawLine of all.slice(start, end)) {
    const line = rawLine.trim();
    if (!line) continue;

    const priceMatch = line.match(PRICE_END);
    if (!priceMatch) {
      // Name ohne Preis: Preis folgt in der nächsten Zeile (" 2 * 0,79   1,58 A")
      pendingLabel = line;
      continue;
    }

    const total = toCents(priceMatch[1])!;
    let head = line.slice(0, priceMatch.index).trim();
    if (pendingLabel) {
      head = `${pendingLabel} ${head}`.trim();
      pendingLabel = null;
    }

    if (DISCOUNT.test(head) && total < 0) {
      const prev = lines[lines.length - 1];
      if (prev) {
        prev.discountCents += -total;
        prev.totalCents += total;
        prev.unitCents = Math.round(prev.totalCents / prev.qty);
        prev.raw += ` | ${line}`;
      } else warnings.push(`Rabatt ohne Position: ${line}`);
      continue;
    }

    if (SKIP.test(head) || total <= 0) {
      skippedCents += total;
      continue;
    }

    let label = head;
    let qty = 1;
    let weightKg: number | null = null;

    const multi = head.match(MULTI);
    if (multi) {
      qty = Number(multi[1]);
      label = head.slice(0, multi.index).trim();
      const unit = toCents(multi[2])!;
      if (unit * qty !== total) warnings.push(`Menge × Preis passt nicht zur Summe: ${line}`);
    }

    const weight = label.match(WEIGHT);
    if (weight) {
      weightKg = Number(weight[1].replace(",", "."));
      label = label.slice(0, weight.index).replace(/\s+kg\s*$/i, "").trim();
    }

    lines.push({
      raw: line,
      label: label.replace(/\s{2,}/g, " "),
      qty,
      weightKg,
      unitCents: Math.round(total / qty),
      totalCents: total,
      discountCents: 0,
    });
  }

  const totalCents = totalLine ? toCents(totalLine.match(/(-?\d+[.,]\d{2})/)?.[1] ?? "") : null;
  const sumLines = lines.reduce((s, l) => s + l.totalCents, 0);
  if (totalCents != null && sumLines + skippedCents !== totalCents)
    warnings.push(
      `Positionen ergeben mit Pfand ${((sumLines + skippedCents) / 100).toFixed(2)} €, der Bon sagt ${(totalCents / 100).toFixed(2)} €. Bitte prüfen.`,
    );

  return { store, date, totalCents, skippedCents, lines, warnings };
}

/** Bon-Kürzel vereinheitlichen, für gelernte Zuordnungen. */
export function aliasKey(label: string): string {
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}
