"use client";
import type { Analysis, Pick } from "@/lib/pricing";
import { formatEuro, unitLabel } from "@/lib/units";

export const STORE_NAMES: Record<string, string> = {
  "aldi-nord": "Aldi Nord",
  lidl: "Lidl",
  kaufland: "Kaufland",
  netto: "Netto",
  edeka: "Edeka",
};

export const pct = (x: number) => `${Math.round(x * 100)} %`;

export function unitPrice(p: Pick) {
  return `${formatEuro(p.unit_price_cents)}/${unitLabel(p.unit)}`;
}

export function PriceTag({ a }: { a: Analysis }) {
  const p = a.best;
  if (!p) return <div className="none">Noch kein Preis. Bon hochladen oder eintragen.</div>;
  const hot = p.kind === "angebot" && a.isDeal;
  return (
    <div className={`tag ${hot ? "hot" : "calm"}`}>
      <div className="k">{p.kind === "angebot" ? "Angebot" : "Normalpreis"}</div>
      <div className="p">{formatEuro(p.price_cents)}</div>
      <div className="u">{unitPrice(p)}</div>
    </div>
  );
}

export type FredPose =
  | "fred-1-begruessung"
  | "fred-2-einkaufskorb"
  | "fred-3-lupe"
  | "fred-4-nachdenklich"
  | "fred-5-ersparnis"
  | "fred-6-laptop"
  | "fred-7-traurig"
  | "fred-8-profilbild"
  | "fred-extra-angebot-gefunden";

export function Fred({ pose, size = 72, alt = "" }: { pose: FredPose; size?: number; alt?: string }) {
  return <img src={`/fred/${pose}.webp`} alt={alt} width={size} height={size} style={{ objectFit: "contain" }} />;
}
