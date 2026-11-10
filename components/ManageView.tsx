"use client";
import { useState } from "react";
import { addObservation, upsertProduct, type HouseholdData, type Product } from "@/lib/data";
import type { StoreId } from "@/lib/pricing";
import { supabase } from "@/lib/supabase";
import { parseAmount, toCents, unitPriceCents, type BaseUnit } from "@/lib/units";
import { today } from "@/lib/week";
import { PushSetting, ThemeSetting } from "./Settings";
import { CATEGORIES, STORE_NAMES } from "./shared";

export default function ManageView({
  data,
  onChanged,
  useCard,
  setUseCard,
}: {
  data: HouseholdData;
  onChanged: () => void;
  useCard: boolean;
  setUseCard: (v: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<BaseUnit>("kg");
  const [msg, setMsg] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const words = name.trim().toLowerCase().split(/\s+/);
    await upsertProduct({ household_id: data.householdId, name: name.trim(), unit, keywords_include: words, keywords_exclude: [], active: true, sort: data.products.length });
    setName("");
    onChanged();
  }

  async function toggle(p: Product) {
    await supabase().from("products").update({ active: !p.active }).eq("id", p.id);
    onChanged();
  }

  async function saveCategory(p: Product, category: string) {
    const { error } = await supabase().from("products").update({ category }).eq("id", p.id);
    if (error) setMsg("Bereich konnte nicht gespeichert werden. Wurde die Migration 0002 in Supabase ausgeführt?");
    onChanged();
  }

  async function saveKeywords(p: Product, include: string, exclude: string) {
    const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
    await supabase().from("products").update({ keywords_include: split(include), keywords_exclude: split(exclude) }).eq("id", p.id);
    setMsg(`Suchwörter für ${p.name} gespeichert. Sie wirken ab dem nächsten Import.`);
    onChanged();
  }

  return (
    <section className="list">
      <form className="card add" onSubmit={add}>
        <input type="text" placeholder="Neues Produkt, z. B. Kräuterquark" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={unit} onChange={(e) => setUnit(e.target.value as BaseUnit)} aria-label="Einheit">
          <option value="kg">Preis je kg</option>
          <option value="l">Preis je Liter</option>
          <option value="stk">Preis je Stück</option>
        </select>
        <button className="btn primary">Hinzufügen</button>
      </form>

      {msg && <div className="banner">{msg}</div>}

      <div className="group-h">Einstellungen</div>
      <ThemeSetting />
      <PushSetting householdId={data.householdId} />

      <label className="card mrow">
        <input type="checkbox" checked={useCard} onChange={(e) => setUseCard(e.target.checked)} />
        <span className="grow">Preise mit Kaufland Card bzw. Lidl Plus einrechnen</span>
      </label>

      <div className="group-h">Eure Produkte</div>
      {data.products.map((p) => (
        <details key={p.id} className={`card mrow${p.active ? "" : " paused"}`} style={{ display: "block" }}>
          <summary style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="grow">
              {p.name} <span className="detail">je {p.unit === "stk" ? "Stück" : p.unit}</span>
            </span>
            <button
              type="button"
              className="btn ghost"
              onClick={(e) => {
                e.preventDefault();
                toggle(p);
              }}
            >
              {p.active ? "Pausieren" : "Aktivieren"}
            </button>
          </summary>
          <div className="review">
            <label className="f">
              Bereich im Laden (für den Einkaufsmodus)
              <select value={p.category ?? "sonstiges"} onChange={(e) => saveCategory(p, e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <KeywordForm p={p} onSave={saveKeywords} />
          <PriceForm p={p} data={data} onSaved={onChanged} />
        </details>
      ))}

      <div className="group-h">Letzte Importe</div>
      <div className="card review">
        {data.lastImports.length === 0 && <span className="note">Noch kein Import gelaufen. Der erste läuft am Montag früh.</span>}
        {data.lastImports.slice(0, 8).map((r, i) => (
          <div key={i} className="line">
            <span className={`chip ${r.ok ? "mint" : "amber"}`}>{r.ok ? "ok" : "Fehler"}</span>
            <span className="txt">{STORE_NAMES[r.store_id]}</span>
            <span>{new Date(r.started_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</span>
            <span>{r.ok ? `${r.offers_found} Angebote` : r.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function KeywordForm({ p, onSave }: { p: Product; onSave: (p: Product, inc: string, exc: string) => void }) {
  const [inc, setInc] = useState(p.keywords_include.join(", "));
  const [exc, setExc] = useState(p.keywords_exclude.join(", "));
  return (
    <div className="review">
      <label className="f">
        Muss enthalten (Komma trennt, | heißt „oder“)
        <input type="text" value={inc} onChange={(e) => setInc(e.target.value)} />
      </label>
      <label className="f">
        Darf nicht enthalten
        <input type="text" value={exc} onChange={(e) => setExc(e.target.value)} />
      </label>
      <button className="btn" onClick={() => onSave(p, inc, exc)}>
        Suchwörter speichern
      </button>
    </div>
  );
}

function PriceForm({ p, data, onSaved }: { p: Product; data: HouseholdData; onSaved: () => void }) {
  const [store, setStore] = useState<StoreId>("kaufland");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState(p.pack_hint ?? "");
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const cents = toCents(price);
    const a = parseAmount(amount);
    if (!cents || !a || a.unit !== p.unit) {
      setErr("Bitte Preis und passende Menge angeben, z. B. 1,19 und 500 g.");
      return;
    }
    await addObservation({
      household_id: data.householdId,
      product_id: p.id,
      store_id: store,
      label: p.name,
      price_cents: cents,
      unit: p.unit,
      unit_price_cents: unitPriceCents(cents, a),
      observed_on: today(),
      source: "manuell",
      amount: a.amount,
    });
    setPrice("");
    setErr(null);
    onSaved();
  }

  return (
    <div className="review">
      <b style={{ fontSize: 13 }}>Normalpreis eintragen</b>
      <div className="head">
        <select value={store} onChange={(e) => setStore(e.target.value as StoreId)}>
          {data.stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input type="text" inputMode="decimal" placeholder="Preis, z. B. 1,19" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <input type="text" placeholder="Menge, z. B. 500 g" value={amount} onChange={(e) => setAmount(e.target.value)} />
      {err && <span className="err">{err}</span>}
      <button className="btn" onClick={save}>
        Preis speichern
      </button>
    </div>
  );
}
