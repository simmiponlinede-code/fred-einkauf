"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadHousehold, subscribeList, type HouseholdData, type ListItem } from "@/lib/data";
import { analyze, historyLow, type Analysis } from "@/lib/pricing";
import { supabase } from "@/lib/supabase";
import { formatEuro } from "@/lib/units";
import { isoWeek, today } from "@/lib/week";
import BonView from "./BonView";
import ListView from "./ListView";
import ManageView from "./ManageView";
import { Fred, pct, STORE_NAMES } from "./shared";
import StoresView from "./StoresView";

type Tab = "liste" | "maerkte" | "bon" | "verwalten";

export default function FredApp() {
  const router = useRouter();
  const [data, setData] = useState<HouseholdData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("liste");
  const [useCard, setUseCard] = useState(true);
  const [day, setDay] = useState<string | null>(null); // erst im Browser setzen, nicht beim Build

  const reload = useCallback(async () => {
    try {
      setData(await loadHousehold());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase()
      .auth.getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return;
        if (!session) router.replace("/login");
        else {
          setDay(today());
          reload();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router, reload]);

  // Abhaken des Partners live übernehmen
  useEffect(() => {
    if (!data?.listId) return;
    return subscribeList(data.listId, (item: ListItem) =>
      setData((d) => (d ? { ...d, items: d.items.some((i) => i.id === item.id) ? d.items.map((i) => (i.id === item.id ? item : i)) : [...d.items, item] } : d)),
    );
  }, [data?.listId]);

  const analyses = useMemo(() => {
    const m = new Map<string, Analysis>();
    if (!data || !day) return m;
    for (const p of data.products) {
      const offers = data.offersByProduct.get(p.id) ?? [];
      const obs = data.obsByProduct.get(p.id) ?? [];
      const monday = isoMonday(day);
      m.set(p.id, analyze(p.unit, offers, obs, day, historyLow(offers, obs, p.unit, monday), useCard));
    }
    return m;
  }, [data, day, useCard]);

  if (error)
    return (
      <main className="wrap">
        <div className="card emptyfred">
          <Fred pose="fred-7-traurig" size={120} />
          <b>Fred kommt gerade nicht an die Daten.</b>
          <span>{error}</span>
          <button className="btn primary" onClick={reload}>
            Nochmal versuchen
          </button>
        </div>
      </main>
    );

  if (!data)
    return (
      <main className="wrap">
        <div className="card status">
          <div className="spinner" /> Fred holt eure Liste …
        </div>
      </main>
    );

  const active = data.products.filter((p) => p.active);
  const deals = active.filter((p) => analyses.get(p.id)?.isDeal);
  const total = active.reduce((s, p) => s + (analyses.get(p.id)?.best?.price_cents ?? 0), 0);
  const stores = new Set(active.map((p) => analyses.get(p.id)?.best?.store_id).filter(Boolean));
  const bestSaving = deals
    .map((p) => ({ p, s: analyses.get(p.id)!.saving ?? 0 }))
    .sort((a, b) => b.s - a.s)[0];
  const failedImports = latestFailures(data.lastImports);

  return (
    <main className="wrap">
      <header className="hero">
        <div className="brand">
          <img className="avatar" src="/fred/fred-8-profilbild.webp" alt="" width={30} height={30} />
          Wocheneinkauf Göttingen · mit Fred
        </div>
        <div className="herorow">
          <div className="herotext">
            <h1>
              Kauf smart.
              <br />
              <span className="grad">Spar bei jedem Einkauf.</span>
            </h1>
            <div className="sub">
              Woche <b>{isoWeek().split("-W")[1]}</b> · {deals.length} von {active.length} Produkten im Angebot
            </div>
          </div>
          <img className="herofred" src="/fred/fred-1-begruessung.webp" alt="Fred, der Dachs, zwinkert dir zu" width={132} height={132} />
        </div>
      </header>

      {failedImports.length > 0 && (
        <div className="banner">
          Import fehlgeschlagen: {failedImports.map((s) => STORE_NAMES[s] ?? s).join(", ")}. Die Angebote dieser Märkte können fehlen.
        </div>
      )}

      <div className="card fredsays">
        {bestSaving ? (
          <>
            <Fred pose="fred-5-ersparnis" />
            <div>
              <b>
                {bestSaving.p.name}: {pct(bestSaving.s)} günstiger
              </b>
              <span>
                bei {STORE_NAMES[analyses.get(bestSaving.p.id)!.best!.store_id]} – das beste Angebot der Woche.
              </span>
            </div>
          </>
        ) : (
          <>
            <Fred pose="fred-4-nachdenklich" />
            <div>
              <b>Diese Woche keine echten Schnäppchen.</b>
              <span>Ich zeige euch die besten Normalpreise.</span>
            </div>
          </>
        )}
      </div>

      <section className="stats" aria-label="Zusammenfassung">
        <div className="stat">
          <span className="n">{deals.length}</span>
          <span className="l">Produkte im Angebot</span>
        </div>
        <div className="stat">
          <span className="n">{formatEuro(total)}</span>
          <span className="l">je 1 Packung zum besten Preis</span>
        </div>
        <div className="stat">
          <span className="n">{stores.size}</span>
          <span className="l">{stores.size === 1 ? "Laden" : "Läden"}</span>
        </div>
      </section>

      <nav className="tabs" role="tablist">
        {(
          [
            ["liste", "Liste"],
            ["maerkte", "Märkte"],
            ["bon", "Bon"],
            ["verwalten", "Verwalten"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "liste" && <ListView data={data} analyses={analyses} onChange={setData} />}
      {tab === "maerkte" && <StoresView data={data} analyses={analyses} useCard={useCard} />}
      {tab === "bon" && <BonView data={data} onSaved={reload} />}
      {tab === "verwalten" && <ManageView data={data} onChanged={reload} useCard={useCard} setUseCard={setUseCard} />}

      <p className="foot">
        Angebote aus den Angebotsseiten der Märkte, Normalpreise aus euren Bons. Preise ohne Gewähr; im Laden zählt das Preisschild.
      </p>
    </main>
  );
}

function isoMonday(day: string): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Märkte, deren letzter Import fehlgeschlagen ist. */
function latestFailures(runs: HouseholdData["lastImports"]): string[] {
  const seen = new Map<string, boolean>();
  for (const r of runs) if (!seen.has(r.store_id)) seen.set(r.store_id, r.ok);
  return [...seen.entries()].filter(([, ok]) => !ok).map(([s]) => s);
}
