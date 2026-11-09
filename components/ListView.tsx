"use client";
import { setChecked, type HouseholdData } from "@/lib/data";
import type { Analysis } from "@/lib/pricing";
import { formatEuro } from "@/lib/units";
import { Fred, pct, PriceTag, STORE_NAMES, unitPrice } from "./shared";

export default function ListView({
  data,
  analyses,
  onChange,
}: {
  data: HouseholdData;
  analyses: Map<string, Analysis>;
  onChange: (d: HouseholdData) => void;
}) {
  const byProduct = new Map(data.items.map((i) => [i.product_id, i]));
  const names = new Map(data.members.map((m) => [m.user_id, m.display_name]));
  const products = data.products.filter((p) => p.active && byProduct.has(p.id));

  if (!products.length)
    return (
      <div className="card emptyfred">
        <Fred pose="fred-2-einkaufskorb" size={120} />
        Eure Liste ist leer. Legt unter „Verwalten“ eure Produkte an.
      </div>
    );

  async function toggle(itemId: string, checked: boolean) {
    onChange({
      ...data,
      items: data.items.map((i) => (i.id === itemId ? { ...i, checked_at: checked ? new Date().toISOString() : null } : i)),
    });
    await setChecked(itemId, checked);
  }

  const open = products.filter((p) => !byProduct.get(p.id)?.checked_at);
  const done = products.filter((p) => byProduct.get(p.id)?.checked_at);

  return (
    <section className="list" aria-live="polite">
      {[...open, ...done].map((p) => {
        const item = byProduct.get(p.id)!;
        const a = analyses.get(p.id)!;
        const isDone = !!item.checked_at;
        return (
          <article key={p.id} className={`card row${isDone ? " done" : ""}`}>
            <label className="chk">
              <input type="checkbox" checked={isDone} onChange={(e) => toggle(item.id, e.target.checked)} aria-label={`${p.name} abhaken`} />
              <span />
            </label>
            <div className="title">
              <b>{p.name}</b>
              {isDone && item.checked_by && <div className="who">abgehakt von {names.get(item.checked_by) ?? "euch"}</div>}
            </div>
            <PriceTag a={a} />
            <div className="main">
              {a.best && (
                <div className="line">
                  <span className="chip store">{STORE_NAMES[a.best.store_id]}</span>
                  <span className="txt">{a.best.label}</span>
                  {a.best.needsCard && <span className="chip amber">mit Card/App</span>}
                  {a.isDeal && a.saving != null && <span className="chip hot">−{pct(a.saving)}</span>}
                  {a.isHistoryLow && <span className="chip mint">günstigster Preis bisher</span>}
                </div>
              )}
              {a.cheaperNormalElsewhere && a.offers[0] && (
                <div className="note">
                  Das Angebot bei {STORE_NAMES[a.offers[0].store_id]} ({unitPrice(a.offers[0])}) ist teurer als der Normalpreis bei{" "}
                  {STORE_NAMES[a.cheaperNormalElsewhere.store_id]}.
                </div>
              )}
            </div>
            {(a.offers.length > 1 || a.normals.length > 0) && (
              <details className="more">
                <summary>Alle Preise</summary>
                <div className="alt">
                  {[...a.offers, ...a.normals].map((x, i) => (
                    <div key={i} style={{ display: "contents" }}>
                      <span className="chip soft">{STORE_NAMES[x.store_id]}</span>
                      <span>
                        {x.label} <span className="detail">{x.kind === "angebot" ? "Angebot" : "normal"}</span>
                      </span>
                      <span className="ap">
                        {formatEuro(x.price_cents)} <span className="au">{unitPrice(x)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </article>
        );
      })}
    </section>
  );
}
