"use client";
// „Angebot eintragen“: für Märkte ohne automatischen Import (Lidl, Netto, Edeka).
// In 10 Sekunden: Markt, Produkt, Preis, Menge – Fred rechnet den Grundpreis selbst.
import { useState } from "react";
import { addManualOffer, deleteManualOffer, type HouseholdData } from "@/lib/data";
import { formatEuro, parseAmount, toCents, unitLabel, unitPriceCents } from "@/lib/units";
import { today } from "@/lib/week";
import { STORE_NAMES, StoreChip } from "./shared";

/** Samstag der laufenden Woche als YYYY-MM-DD. */
function saturday(day: string): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

export default function ManualOffer({ data, onSaved }: { data: HouseholdData; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [store, setStore] = useState("lidl");
  const [productId, setProductId] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [cardPrice, setCardPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [validTo, setValidTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const product = data.products.find((p) => p.id === productId);
  const cents = toCents(price);
  const a = parseAmount(amount);
  const unitOk = !!a && !!product && a.unit === product.unit;
  const preview = cents && a && unitOk ? unitPriceCents(cents, a) : null;

  // Eigene Angebote dieser Woche, zum Kontrollieren und Löschen
  const day = today();
  const mine = [...data.offersByProduct.entries()].flatMap(([pid, offers]) =>
    offers
      .filter((o) => o.household_id && (!o.valid_to || o.valid_to >= day))
      .map((o) => ({ o, name: data.products.find((p) => p.id === pid)?.name ?? "" })),
  );

  function start() {
    setOpen(true);
    setValidTo(saturday(today()));
    setMsg(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return setMsg("Bitte ein Produkt wählen.");
    if (!cents) return setMsg("Bitte einen Preis eintragen, z. B. 0,99.");
    if (!a) return setMsg("Bitte die Menge angeben, z. B. 500 g, 1 l oder 10 St.");
    if (!unitOk) return setMsg(`${product.name} wird je ${unitLabel(product.unit)} verglichen. Bitte die Menge passend angeben.`);
    setBusy(true);
    try {
      await addManualOffer({
        householdId: data.householdId,
        productId: product.id,
        store,
        title: title.trim() || product.name,
        priceCents: cents,
        cardPriceCents: toCents(cardPrice) && toCents(cardPrice)! < cents ? toCents(cardPrice) : null,
        packText: amount.trim(),
        amount: a.amount,
        unit: a.unit,
        unitPriceCents: unitPriceCents(cents, a),
        validFrom: today(),
        validTo: validTo || saturday(today()),
      });
      setMsg(`Gespeichert: ${product.name} bei ${STORE_NAMES[store]} für ${formatEuro(cents)}.`);
      setPrice("");
      setCardPrice("");
      setTitle("");
      setAmount("");
      setProductId("");
      onSaved();
    } catch (err) {
      setMsg(
        `Speichern fehlgeschlagen. Wurde die Migration 0003 in Supabase ausgeführt? (${err instanceof Error ? err.message : JSON.stringify(err)})`,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <div className="card setting">
        <span className="grow">
          <b>Angebot im Prospekt gesehen?</b>
          <br />
          <span className="note">Lidl, Netto und Edeka trägst du hier selbst ein. Fred rechnet es wie alle anderen Angebote mit.</span>
        </span>
        <button className="btn primary" onClick={start}>
          + Angebot eintragen
        </button>
        {mine.length > 0 && (
          <div className="mineoffers">
            {mine.map(({ o, name }) => (
              <div key={o.id} className="line">
                <StoreChip store={o.store_id} />
                <span className="txt">{name}</span>
                <span>
                  {formatEuro(o.price_cents)} · bis {o.valid_to ? new Date(o.valid_to).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : "?"}
                </span>
                <button
                  className="xbtn"
                  aria-label={`Angebot ${name} löschen`}
                  onClick={async () => {
                    await deleteManualOffer(o.id).catch(() => {});
                    onSaved();
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );

  return (
    <form className="card review" onSubmit={save}>
      <b>Angebot eintragen</b>
      <div className="head">
        <label className="f">
          Markt
          <select value={store} onChange={(e) => setStore(e.target.value)}>
            {data.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Produkt
          <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="">– wählen –</option>
            {data.products
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label className="f">
          Preis
          <input type="text" inputMode="decimal" placeholder="0,99" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </label>
        <label className="f">
          Menge
          <input type="text" placeholder={product?.pack_hint ?? "500 g"} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label className="f">
          Preis mit App (optional)
          <input type="text" inputMode="decimal" placeholder="z. B. Lidl Plus" value={cardPrice} onChange={(e) => setCardPrice(e.target.value)} />
        </label>
        <label className="f">
          Gültig bis
          <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </label>
      </div>
      <label className="f">
        Bezeichnung im Prospekt (optional)
        <input type="text" placeholder="z. B. Milbona Magerquark" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {preview && product && (
        <span className="note">
          Grundpreis: {formatEuro(preview)}/{unitLabel(product.unit)}
        </span>
      )}
      {msg && <span className="err">{msg}</span>}
      <div className="bonbtns">
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
          Fertig
        </button>
        <button className="btn primary" disabled={busy}>
          {busy ? "Speichere …" : "Speichern"}
        </button>
      </div>
    </form>
  );
}
