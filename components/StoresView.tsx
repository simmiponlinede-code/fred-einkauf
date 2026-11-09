"use client";
import { useState } from "react";
import type { HouseholdData } from "@/lib/data";
import { analyze, planShopping, type Analysis, type StoreId } from "@/lib/pricing";
import { formatEuro } from "@/lib/units";
import { today } from "@/lib/week";
import { STORE_NAMES } from "./shared";

export default function StoresView({ data, analyses, useCard }: { data: HouseholdData; analyses: Map<string, Analysis>; useCard: boolean }) {
  const [threshold, setThreshold] = useState(300);
  const open = new Set(data.items.filter((i) => !i.checked_at).map((i) => i.product_id));
  const products = data.products.filter((p) => p.active && open.has(p.id));

  const items = products.map((p) => {
    // Kandidaten pro Markt: bestes Angebot und Normalpreis
    const all = analyze(p.unit, data.offersByProduct.get(p.id) ?? [], data.obsByProduct.get(p.id) ?? [], today(), null, useCard);
    return { productId: p.id, candidates: [...all.offers, ...all.normals] };
  });
  const plan = planShopping(items, data.stores.map((s) => s.id) as StoreId[], threshold);
  const rec = plan.recommended;
  const name = new Map(data.products.map((p) => [p.id, p.name]));

  const groups = new Map<string, string[]>();
  for (const p of products) {
    const s = analyses.get(p.id)?.best?.store_id ?? "ohne Preis";
    groups.set(s, [...(groups.get(s) ?? []), p.name]);
  }

  return (
    <section className="list">
      {rec && (
        <div className="card planbox">
          <b>Freds Einkaufsplan</b>
          <span>
            {rec.stores.map((s) => STORE_NAMES[s]).join(" + ")}: {formatEuro(rec.totalCents)} für {rec.covered} von {products.length} Produkten
          </span>
          {plan.single && plan.pair && rec.stores.length === 2 && (
            <span className="note">Nur {STORE_NAMES[plan.single.stores[0]]} wären {formatEuro(plan.single.totalCents)}.</span>
          )}
          <label className="note">
            Zweiten Markt erst ab{" "}
            <input type="number" min={0} step={50} value={threshold / 100} onChange={(e) => setThreshold(Math.round(Number(e.target.value) * 100))} style={{ width: 70 }} /> € Ersparnis
          </label>
          {rec.assignments.map(({ productId, pick }) => (
            <div key={productId} className="line">
              <span className="txt">{name.get(productId)}</span>
              {pick ? (
                <>
                  <span className="chip soft">{STORE_NAMES[pick.store_id]}</span>
                  <span>{formatEuro(pick.price_cents)}</span>
                </>
              ) : (
                <span className="chip amber">dort kein Preis bekannt</span>
              )}
            </div>
          ))}
        </div>
      )}
      {[...groups.entries()].map(([store, names]) => (
        <div key={store}>
          <div className="group-h">
            <span>{STORE_NAMES[store] ?? store}</span>
            <span>{names.length}</span>
          </div>
          <div className="card receipt">
            <span>{names.join(", ")}</span>
          </div>
        </div>
      ))}
    </section>
  );
}
