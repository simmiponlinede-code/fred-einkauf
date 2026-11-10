"use client";
import { useEffect, useState } from "react";
import type { Analysis, Pick } from "@/lib/pricing";
import { formatEuro, unitLabel } from "@/lib/units";

export const STORE_NAMES: Record<string, string> = {
  "aldi-nord": "Aldi Nord",
  lidl: "Lidl",
  kaufland: "Kaufland",
  netto: "Netto",
  edeka: "Edeka",
};

/** Bereiche im Laden, in der Reihenfolge eines typischen Rundgangs. */
export const CATEGORIES: { id: string; name: string; icon: string }[] = [
  { id: "obst-gemuese", name: "Obst & Gemüse", icon: "🥒" },
  { id: "brot", name: "Brot & Backwaren", icon: "🥖" },
  { id: "kuehlregal", name: "Kühlregal", icon: "🥛" },
  { id: "fleisch", name: "Fleisch & Wurst", icon: "🍗" },
  { id: "tiefkuehl", name: "Tiefkühl", icon: "🧊" },
  { id: "vorrat", name: "Vorrat & Konserven", icon: "🥫" },
  { id: "getraenke", name: "Getränke", icon: "🥤" },
  { id: "drogerie", name: "Drogerie & Haushalt", icon: "🧴" },
  { id: "sonstiges", name: "Sonstiges", icon: "🛒" },
];
export const categoryIndex = (id: string | null | undefined) => {
  const i = CATEGORIES.findIndex((c) => c.id === id);
  return i === -1 ? CATEGORIES.length - 1 : i;
};

export const pct = (x: number) => `${Math.round(x * 100)} %`;

export function unitPrice(p: Pick) {
  return `${formatEuro(p.unit_price_cents)}/${unitLabel(p.unit)}`;
}

/** Markt-Chip in der Hausfarbe des Markts. */
export function StoreChip({ store }: { store: string }) {
  return <span className={`chip store store-${store}`}>{STORE_NAMES[store] ?? store}</span>;
}

export function PriceTag({ a, compact = false }: { a: Analysis; compact?: boolean }) {
  const p = a.best;
  if (!p) return <div className="none">{compact ? "kein Preis" : "Noch kein Preis. Bon hochladen oder eintragen."}</div>;
  const hot = p.kind === "angebot" && a.isDeal;
  return (
    <div className={`tag ${hot ? "hot" : "calm"}`}>
      {!compact && <div className="k">{p.kind === "angebot" ? "Angebot" : "Normalpreis"}</div>}
      <div className="p">{formatEuro(p.price_cents)}</div>
      {!compact && <div className="u">{unitPrice(p)}</div>}
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
  | "fred-extra-angebot-gefunden"
  | "fred-extra-einkaufstasche"
  | "fred-extra-einkaufswagen";

export function Fred({ pose, size = 72, alt = "", className = "" }: { pose: FredPose; size?: number; alt?: string; className?: string }) {
  return <img className={className} src={`/fred/${pose}.webp`} alt={alt} width={size} height={size} style={{ objectFit: "contain" }} />;
}

/** Kurzer Hinweis unten am Bildschirm, verschwindet von selbst. */
export function Toast({ text, onDone }: { text: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [text, onDone]);
  if (!text) return null;
  return (
    <div className="toast" role="status">
      <img src="/fred/fred-8-profilbild.webp" alt="" width={28} height={28} />
      {text}
    </div>
  );
}

const CONFETTI_COLORS = ["#ec4899", "#f9a8d4", "#c084fc", "#fde68a", "#6ee7b7", "#ff7ab6"];

/** Konfetti-Regen, rein mit CSS; bei „Bewegung reduzieren“ nicht sichtbar. */
export function Confetti({ show }: { show: boolean }) {
  const [pieces] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      left: (i * 97) % 100,
      delay: ((i * 37) % 60) / 100,
      dur: 1.6 + ((i * 53) % 100) / 100,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rot: (i * 47) % 360,
    })),
  );
  if (!show) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, transform: `rotate(${p.rot}deg)` }}
        />
      ))}
    </div>
  );
}

/** Begrüßung je nach Tageszeit. */
export function greeting(name: string | undefined, now = new Date()): string {
  const h = now.getHours();
  const hello = h < 5 ? "Gute Nacht" : h < 11 ? "Guten Morgen" : h < 17 ? "Hallo" : h < 22 ? "Guten Abend" : "Gute Nacht";
  return name ? `${hello}, ${name}!` : `${hello}!`;
}
