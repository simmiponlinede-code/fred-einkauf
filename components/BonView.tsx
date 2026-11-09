"use client";
import { useEffect, useState } from "react";
import type { HouseholdData, Product } from "@/lib/data";
import { matches } from "@/lib/matching";
import type { StoreId } from "@/lib/pricing";
import { fileToText } from "@/lib/receipt/extract";
import { aliasKey, parseReceipt, type ParsedReceipt } from "@/lib/receipt/parse";
import { supabase } from "@/lib/supabase";
import { formatEuro, parseAmount, unitPriceCents } from "@/lib/units";
import { Fred, STORE_NAMES } from "./shared";

interface Row {
  use: boolean;
  productId: string;
  amountText: string; // z. B. "500 g", bei Gewichtsware automatisch
}

export default function BonView({ data, onSaved }: { data: HouseholdData; onSaved: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [store, setStore] = useState<StoreId>("kaufland");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [aliases, setAliases] = useState<Map<string, string>>(new Map());
  const [receipts, setReceipts] = useState<{ id: string; store_id: string; bought_on: string; total_cents: number | null }[]>([]);

  useEffect(() => {
    const db = supabase();
    db.from("label_aliases")
      .select("store_id, label, product_id")
      .then(({ data: a }) => setAliases(new Map((a ?? []).map((x) => [`${x.store_id}|${x.label}`, x.product_id]))));
    db.from("receipts")
      .select("id, store_id, bought_on, total_cents")
      .order("bought_on", { ascending: false })
      .limit(10)
      .then(({ data: r }) => setReceipts(r ?? []));
  }, []);

  const products = data.products;

  function suggest(label: string, s: StoreId): Product | undefined {
    const learned = aliases.get(`${s}|${aliasKey(label)}`);
    if (learned) return products.find((p) => p.id === learned);
    return products.find((p) => matches(label, p));
  }

  function defaultAmount(p: Product | undefined, label: string, weightKg: number | null): string {
    if (weightKg) return `${weightKg.toString().replace(".", ",")} kg`;
    const fromLabel = parseAmount(label);
    if (fromLabel && p && fromLabel.unit === p.unit) return label.match(/\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)\b/i)?.[0] ?? "";
    if (!p) return "";
    const last = (data.obsByProduct.get(p.id) ?? [])[0] as { amount?: number } | undefined;
    if (last?.amount) return p.unit === "stk" ? `${last.amount} St.` : `${last.amount} ${p.unit === "kg" ? "g" : "ml"}`;
    return p.pack_hint ?? "";
  }

  async function handleFile(file: File) {
    setParsed(null);
    setStatus(file.type === "application/pdf" ? "Lese PDF …" : "Erkenne Text im Foto … (5–15 Sekunden)");
    try {
      const text = await fileToText(file, (p) => setStatus(`Erkenne Text … ${Math.round(p * 100)} %`));
      const r = parseReceipt(text);
      if (!r.lines.length) {
        setStatus("Ich konnte keine Positionen finden. Ist das Foto scharf und der ganze Bon drauf?");
        return;
      }
      const s = r.store ?? "kaufland";
      setStore(s);
      setDate(r.date ?? new Date().toISOString().slice(0, 10));
      setRows(
        r.lines.map((l) => {
          const p = suggest(l.label, s);
          return { use: !!p, productId: p?.id ?? "", amountText: defaultAmount(p, l.label, l.weightKg) };
        }),
      );
      setParsed(r);
      setStatus(null);
    } catch (e) {
      setStatus(`Fehler beim Lesen: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function save() {
    if (!parsed) return;
    const db = supabase();
    setStatus("Speichere …");
    try {
      const receipt = await db
        .from("receipts")
        .insert({ household_id: data.householdId, store_id: store, bought_on: date, total_cents: parsed.totalCents })
        .select("id")
        .single();
      if (receipt.error) throw receipt.error;
      const rid = receipt.data.id;

      const lines = parsed.lines.map((l, i) => ({
        receipt_id: rid,
        household_id: data.householdId,
        raw: l.raw,
        label: l.label,
        qty: l.qty,
        price_cents: l.unitCents,
        total_cents: l.totalCents,
        weight_kg: l.weightKg,
        product_id: rows[i].use && rows[i].productId ? rows[i].productId : null,
      }));
      const ins = await db.from("receipt_lines").insert(lines);
      if (ins.error) throw ins.error;

      const obs = [];
      const newAliases = [];
      for (const [i, l] of parsed.lines.entries()) {
        const r = rows[i];
        if (!r.use || !r.productId) continue;
        const p = products.find((x) => x.id === r.productId)!;
        const amount = parseAmount(r.amountText);
        newAliases.push({ household_id: data.householdId, store_id: store, label: aliasKey(l.label), product_id: p.id });
        if (!amount || amount.unit !== p.unit) continue; // ohne Menge kein Grundpreis
        const price = l.weightKg ? l.totalCents : l.unitCents;
        obs.push({
          household_id: data.householdId,
          product_id: p.id,
          store_id: store,
          label: l.label,
          price_cents: price,
          amount: amount.amount,
          unit: p.unit,
          unit_price_cents: unitPriceCents(price, amount),
          observed_on: date,
          source: "bon",
          receipt_id: rid,
        });
      }
      if (obs.length) {
        const o = await db.from("price_observations").insert(obs);
        if (o.error) throw o.error;
      }
      if (newAliases.length) await db.from("label_aliases").upsert(newAliases, { onConflict: "household_id,store_id,label" });

      setStatus(`Gespeichert: ${obs.length} Preise aus dem Bon. Fred merkt sich die Zuordnungen.`);
      setParsed(null);
      onSaved();
    } catch (e) {
      setStatus(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
    }
  }

  return (
    <section className="list">
      {!parsed && (
        <div className="card bonhero">
          <img className="bonfred" src="/fred/fred-3-lupe.webp" alt="Fred prüft einen Bon mit der Lupe" width={150} height={150} />
          <h2>Bon hochladen</h2>
          <p>PDF aus der Kaufland-App oder ein Foto vom Papierbon. Alles wird hier auf dem Handy gelesen, ohne KI und ohne Server.</p>
          <div className="bonbtns">
            <label className="btn primary filebtn">
              Foto aufnehmen
              <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
            <label className="btn ghost filebtn">
              Datei wählen
              <input type="file" accept="application/pdf,image/*" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
          </div>
        </div>
      )}

      {status && (
        <div className="card status">
          {/^(Lese|Erkenne|Speichere)/.test(status) && <div className="spinner" />}
          {status}
        </div>
      )}

      {parsed && (
        <div className="card review">
          <div className="head">
            <label className="f">
              Markt
              <select value={store} onChange={(e) => setStore(e.target.value as StoreId)}>
                {data.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="f">
              Datum
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          {parsed.warnings.map((w) => (
            <div key={w} className="banner">
              {w}
            </div>
          ))}
          <div className="note">Haken = Preis übernehmen. Menge wie „500 g“, „1 l“ oder „10 St.“, sonst rechnet Fred keinen Grundpreis.</div>
          {parsed.lines.map((l, i) => (
            <div key={i} className="rline">
              <input
                type="checkbox"
                checked={rows[i].use}
                onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, use: e.target.checked } : r)))}
                aria-label={`${l.label} übernehmen`}
              />
              <span className="nm">
                {l.label}
                {l.qty > 1 && <span className="detail"> {l.qty} ×</span>}
                {l.discountCents > 0 && <span className="chip mint"> −{formatEuro(l.discountCents)}</span>}
              </span>
              <span className="pr">{formatEuro(l.weightKg ? l.totalCents : l.unitCents)}</span>
              {rows[i].use && (
                <>
                  <select
                    value={rows[i].productId}
                    onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, productId: e.target.value } : r)))}
                  >
                    <option value="">– Produkt wählen –</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Menge, z. B. 500 g"
                    value={rows[i].amountText}
                    onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, amountText: e.target.value } : r)))}
                    style={{ gridColumn: "2 / 4" }}
                  />
                </>
              )}
            </div>
          ))}
          <div className="bonbtns">
            <button className="btn ghost" onClick={() => setParsed(null)}>
              Verwerfen
            </button>
            <button className="btn primary" onClick={save}>
              Speichern
            </button>
          </div>
        </div>
      )}

      {receipts.length > 0 && (
        <>
          <div className="group-h">Letzte Bons</div>
          {receipts.map((r) => (
            <div key={r.id} className="card receipt">
              <span>
                <b>{STORE_NAMES[r.store_id]}</b> · {new Date(r.bought_on).toLocaleDateString("de-DE")}
              </span>
              <span>{formatEuro(r.total_cents)}</span>
            </div>
          ))}
        </>
      )}
      {!parsed && !receipts.length && (
        <div className="emptyfred">
          <Fred pose="fred-6-laptop" size={100} />
          Noch keine Bons gespeichert.
        </div>
      )}
    </section>
  );
}
