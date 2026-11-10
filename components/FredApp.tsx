"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { flushQueue, loadHousehold, loadSnapshot, saveSnapshot, subscribeList, type HouseholdData, type ListItem } from "@/lib/data";
import { analyze, historyLow, type Analysis } from "@/lib/pricing";
import { supabase } from "@/lib/supabase";
import { formatEuro } from "@/lib/units";
import { isoWeek, today } from "@/lib/week";
import BonView from "./BonView";
import ListView from "./ListView";
import ManageView from "./ManageView";
import { Fred, greeting, pct, STORE_NAMES, Toast } from "./shared";
import StoresView from "./StoresView";

type Tab = "liste" | "maerkte" | "bon" | "verwalten";

export default function FredApp() {
  const router = useRouter();
  const [data, setData] = useState<HouseholdData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("liste");
  const [useCard, setUseCard] = useState(true);
  const [day, setDay] = useState<string | null>(null); // erst im Browser setzen, nicht beim Build
  const [toast, setToast] = useState<string | null>(null);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const reload = useCallback(async () => {
    try {
      const fresh = await loadHousehold();
      setData(fresh);
      saveSnapshot(fresh);
      setOfflineSince(null);
      setError(null);
    } catch (e) {
      // Kein Netz (z. B. im Laden): letzten Stand vom Gerät zeigen
      const snap = loadSnapshot();
      if (snap) {
        setData(snap);
        setOfflineSince(snap.savedAt);
      } else setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Offline Abgehaktes nachholen, sobald wieder Netz da ist
  useEffect(() => {
    const onOnline = () => flushQueue().then(() => reload());
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [reload]);

  // Stand fürs Funkloch merken, auch nach dem Abhaken
  useEffect(() => {
    if (data && !offlineSince) saveSnapshot(data);
  }, [data, offlineSince]);


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
    return subscribeList(data.listId, (item: ListItem, deleted: boolean) => {
      setData((d) => {
        if (!d) return d;
        if (deleted) return { ...d, items: d.items.filter((i) => i.id !== item.id) };
        const before = d.items.find((i) => i.id === item.id);
        // Hinweis, wenn der/die andere etwas abhakt oder hinzufügt
        if (item.checked_by && item.checked_by !== d.me && item.checked_at && !before?.checked_at) {
          const who = d.members.find((m) => m.user_id === item.checked_by)?.display_name ?? "Jemand";
          const what = d.products.find((p) => p.id === item.product_id)?.name ?? item.free_text ?? "etwas";
          setToast(`${who} hat ${what} abgehakt`);
        } else if (!before && item.free_text && item.created_by && item.created_by !== d.me) {
          const who = d.members.find((m) => m.user_id === item.created_by)?.display_name ?? "Jemand";
          setToast(`${who} hat ${item.free_text} auf die Liste gesetzt`);
        }
        return { ...d, items: before ? d.items.map((i) => (i.id === item.id ? item : i)) : [...d.items, item] };
      });
    });
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

  // data gibt es nur im Browser, die Uhrzeit ist hier also die des Handys
  const hello = greeting(data.members.find((m) => m.user_id === data.me)?.display_name);
  const active = data.products.filter((p) => p.active);
  const deals = active.filter((p) => analyses.get(p.id)?.isDeal);
  const qtyOf = new Map(data.items.filter((i) => i.product_id).map((i) => [i.product_id!, i.qty ?? 1]));
  const total = active.reduce((s, p) => s + (analyses.get(p.id)?.best?.price_cents ?? 0) * (qtyOf.get(p.id) ?? 1), 0);
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
            {hello && <div className="hello">{hello}</div>}
            <div className="sub">
              Woche <b>{isoWeek().split("-W")[1]}</b> · {deals.length} von {active.length} Produkten im Angebot
            </div>
          </div>
          <img className="herofred" src="/fred/fred-1-begruessung.webp" alt="Fred, der Dachs, zwinkert dir zu" width={132} height={132} />
        </div>
      </header>

      {offlineSince && (
        <div className="banner">
          Kein Netz: Fred zeigt den Stand von {new Date(offlineSince).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" })}. Abgehaktes wird nachgeholt.
        </div>
      )}

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
          <span className="l">eure Liste zum besten Preis</span>
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

      {tab === "liste" && <ListView data={data} analyses={analyses} onChange={setData} reload={reload} />}
      {tab === "maerkte" && <StoresView data={data} analyses={analyses} useCard={useCard} onChanged={reload} />}
      {tab === "bon" && <BonView data={data} onSaved={reload} />}
      {tab === "verwalten" && <ManageView data={data} onChanged={reload} useCard={useCard} setUseCard={setUseCard} />}

      <p className="foot">
        <Toast text={toast} onDone={clearToast} />
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
