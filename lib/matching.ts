// Ordnet Angebots- und Bontexte euren Produkten zu, ohne KI:
// Jedes Element in keywords_include muss vorkommen (Alternativen mit "|"),
// kein Element aus keywords_exclude darf vorkommen.

export interface MatchRule {
  id: string;
  keywords_include: string[];
  keywords_exclude: string[];
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9%,.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matches(text: string, rule: MatchRule): boolean {
  if (!rule.keywords_include.length) return false;
  const t = normalize(text);
  const has = (kw: string) => t.includes(normalize(kw));
  const ok = rule.keywords_include.every((group) => group.split("|").some(has));
  if (!ok) return false;
  return !rule.keywords_exclude.some(has);
}

export function matchAll<T extends MatchRule>(text: string, rules: T[]): T[] {
  return rules.filter((r) => matches(text, r));
}
