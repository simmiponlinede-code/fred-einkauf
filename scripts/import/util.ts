import { parseAmount, parseBasePrice, unitPriceCents, type BaseUnit } from "../../lib/units";
import type { RawOffer } from "./types";

export const USER_AGENT =
  "Mozilla/5.0 (compatible; FredEinkaufsliste/1.0; privater Wochenabruf, 1x pro Woche)";

/** Einfache robots.txt-Prüfung für User-agent: * (Disallow/Allow mit * und $). */
export async function isAllowed(url: string): Promise<boolean> {
  const u = new URL(url);
  const res = await fetch(`${u.origin}/robots.txt`, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) return true;
  const lines = (await res.text()).split(/\r?\n/);
  const rules: { allow: boolean; pattern: string }[] = [];
  let applies = false;
  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    const [k, ...rest] = line.split(":");
    const v = rest.join(":").trim();
    if (/^user-agent$/i.test(k)) applies = v === "*";
    else if (applies && /^(dis)?allow$/i.test(k) && v) rules.push({ allow: /^allow$/i.test(k), pattern: v });
  }
  const path = u.pathname + u.search;
  const toRe = (p: string) =>
    new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    if (toRe(r.pattern).test(path) && (!best || r.pattern.length > best.len)) best = { allow: r.allow, len: r.pattern.length };
  }
  return best ? best.allow : true;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Montag und Samstag der Woche, in der `d` liegt. */
export function weekRange(d: Date): { monday: Date; saturday: Date } {
  const day = (d.getUTCDay() + 6) % 7; // Mo = 0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  const saturday = new Date(monday);
  saturday.setUTCDate(monday.getUTCDate() + 5);
  return { monday, saturday };
}

/** "9-11" bzw. "09.11." → Datum im Jahr von `ref` (Jahreswechsel berücksichtigt). */
export function dayMonth(day: number, month: number, ref: Date): Date {
  let year = ref.getUTCFullYear();
  if (month === 1 && ref.getUTCMonth() === 11) year++;
  if (month === 12 && ref.getUTCMonth() === 0) year--;
  return new Date(Date.UTC(year, month - 1, day));
}

export interface NormalizedOffer extends RawOffer {
  amount: number | null;
  unit: BaseUnit | null;
  unit_price_cents: number | null;
}

/** Menge und Grundpreis bestimmen: erst aus der Packungsangabe rechnen, sonst Grundpreis der Seite. */
export function normalizeOffer(o: RawOffer): NormalizedOffer {
  const amount = parseAmount(o.pack_text ?? "");
  if (amount) return { ...o, amount: amount.amount, unit: amount.unit, unit_price_cents: unitPriceCents(o.price_cents, amount) };
  const base = parseBasePrice(o.base_price_text ?? "");
  if (base) return { ...o, amount: null, unit: base.unit, unit_price_cents: base.cents };
  return { ...o, amount: null, unit: null, unit_price_cents: null };
}

/**
 * Macht die Project URL robust gegen typische Kopierfehler (Leerzeichen, fehlendes https://,
 * angehängtes /rest/v1) und erklärt verständlich, was nicht stimmt, ohne den Wert auszugeben.
 */
export function cleanSupabaseUrl(raw: string | undefined): string {
  let v = (raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (!v) throw new Error("Secret SUPABASE_URL fehlt oder ist leer.");
  if (/^postgres(ql)?:\/\//i.test(v))
    throw new Error("SUPABASE_URL enthält die Datenbank-Adresse (postgresql://…). Dort gehört die Project URL hin: https://<projekt>.supabase.co");
  if (/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i.test(v)) v = `https://${v.match(/project\/([a-z0-9]+)/i)![1]}.supabase.co`;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  v = v.replace(/\/(rest|auth)\/v1.*$/i, "").replace(/\/+$/, "");
  try {
    const u = new URL(v);
    if (!u.hostname.endsWith(".supabase.co"))
      throw new Error("SUPABASE_URL sollte die Project URL sein: https://<projekt>.supabase.co (ist evtl. ein Schlüssel reingerutscht?)");
  } catch (e) {
    if (e instanceof TypeError) throw new Error("SUPABASE_URL ist keine gültige Adresse. Erwartet: https://<projekt>.supabase.co");
    throw e;
  }
  return v;
}
