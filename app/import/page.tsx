"use client";
// Übergabe-Seite für Zulieferer (die wöchentliche Claude-Aufgabe).
// Aufruf: /import#<Zugangscode>. Der Code steht nur im Adress-Anker und geht nie an Vercel.
// Die Seite zeigt die Produktliste als Text und nimmt Angebote als JSON entgegen.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

interface P {
  slug: string;
  name: string;
  unit: "kg" | "l" | "stk";
  pack_hint: string | null;
  allowed_stores: string[];
}

export default function ImportPage() {
  const token = useRef("");
  const [products, setProducts] = useState<P[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [json, setJson] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = decodeURIComponent(window.location.hash.slice(1));
    if (!t) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- einmalig beim Laden aus der Adresse
      setError("Kein Zugangscode in der Adresse (/import#CODE).");
      return;
    }
    token.current = t;
    supabase()
      .rpc("import_products", { token: t })
      .then(({ data, error }) => {
        if (error) setError(`Zugangscode abgelehnt: ${error.message}`);
        else setProducts(data as P[]);
      });
  }, []);

  async function send() {
    setBusy(true);
    setResult(null);
    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      setBusy(false);
      setResult("FEHLER: Das ist kein gültiges JSON.");
      return;
    }
    const { data, error } = await supabase().rpc("submit_offers", { token: token.current, payload });
    setBusy(false);
    setResult(error ? `FEHLER: ${error.message}` : `ERGEBNIS: ${JSON.stringify(data)}`);
    if (!error) setJson("");
  }

  const stores = products?.[0]?.allowed_stores ?? [];
  return (
    <main className="wrap">
      <div className="card review">
        <h1 style={{ fontSize: 22 }}>Fred · Angebote einliefern</h1>
        {error && <p className="err">{error}</p>}
        {products && (
          <>
            <p className="note">
              Erlaubte Märkte: {stores.join(", ")}. Heute: {new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })}.
            </p>
            <pre className="importlist" aria-label="Produktliste">
              {products.map((p) => `${p.slug} | ${p.name} | Einheit ${p.unit}${p.pack_hint ? ` | üblich ${p.pack_hint}` : ""}`).join("\n")}
            </pre>
            <p className="note">
              Format: JSON-Liste mit {"{"}store, product (slug), title, brand, price_cents, card_price_cents, was_price_cents, pack_text, amount
              (g bzw. ml bzw. Stück), unit (kg|l|stk), valid_from, valid_to (YYYY-MM-DD), url{"}"}
            </p>
            <label className="f">
              Angebote (JSON)
              <textarea id="angebote-json" rows={10} value={json} onChange={(e) => setJson(e.target.value)} style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }} />
            </label>
            <button id="angebote-senden" className="btn primary" onClick={send} disabled={busy || !json.trim()}>
              {busy ? "Sende …" : "Angebote übertragen"}
            </button>
          </>
        )}
        {result && (
          <p id="ergebnis" className={result.startsWith("FEHLER") ? "err" : "note"}>
            {result}
          </p>
        )}
      </div>
    </main>
  );
}
