"use client";
// Übergabe-Seite für Zulieferer (die wöchentliche Claude-Aufgabe im eingebauten Browser).
// Einrichtung einmalig: angemeldet „Zugang für diesen Browser einrichten“ tippen. Der Code wird nur
// in diesem Browser gespeichert (und als Hash in der Datenbank); er darf ausschließlich Angebote für
// Lidl, Netto und Edeka eintragen. Danach zeigt die Seite die Produktliste und nimmt JSON entgegen.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const KEY = "fred-import-token";

interface P {
  slug: string;
  name: string;
  unit: "kg" | "l" | "stk";
  pack_hint: string | null;
  allowed_stores: string[];
}

type State = "loading" | "setup" | "login" | "ready" | "error";

export default function ImportPage() {
  const token = useRef("");
  const [state, setState] = useState<State>("loading");
  const [products, setProducts] = useState<P[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [json, setJson] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (t: string) => {
    token.current = t;
    const { data, error } = await supabase().rpc("import_products", { token: t });
    if (error) {
      setError(`Zugang abgelehnt: ${error.message}`);
      setState("error");
    } else {
      setProducts(data as P[]);
      setState("ready");
    }
  }, []);

  useEffect(() => {
    let stored = "";
    try {
      stored = decodeURIComponent(window.location.hash.slice(1)) || localStorage.getItem(KEY) || "";
    } catch {
      /* ohne Speicher */
    }
    if (stored) {
      void Promise.resolve(stored).then(load); // asynchron, nicht direkt im Effekt
      return;
    }
    supabase()
      .auth.getSession()
      .then(({ data: { session } }) => setState(session ? "setup" : "login"));
  }, [load]);

  async function setup() {
    setBusy(true);
    const { data, error } = await supabase().rpc("create_import_token", { label: "Claude-Aufgabe" });
    setBusy(false);
    if (error) {
      setError(`Einrichtung fehlgeschlagen: ${error.message}. Wurde die Migration 0004 ausgeführt?`);
      setState("error");
      return;
    }
    try {
      localStorage.setItem(KEY, data as string);
    } catch {
      /* ignorieren */
    }
    load(data as string);
  }

  function forget() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignorieren */
    }
    window.location.hash = "";
    window.location.reload();
  }

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

  return (
    <main className="wrap">
      <div className="card review">
        <h1 style={{ fontSize: 22 }}>Fred · Angebote einliefern</h1>

        {state === "loading" && <p className="note">Lade …</p>}

        {state === "login" && (
          <p className="note">
            Für die Einrichtung einmal <a href="/login?next=/import">in Fred anmelden</a>, dann kommst du automatisch hierher zurück.
          </p>
        )}

        {state === "setup" && (
          <>
            <p className="note">
              Richte diesen Browser als Zulieferer ein. Fred speichert dafür einen Zugangscode nur hier im Browser. Der Code kann
              ausschließlich Angebote für Lidl, Netto und Edeka eintragen, sonst nichts.
            </p>
            <button className="btn primary" onClick={setup} disabled={busy}>
              {busy ? "Richte ein …" : "Zugang für diesen Browser einrichten"}
            </button>
          </>
        )}

        {state === "error" && (
          <>
            <p className="err">{error}</p>
            <button className="btn ghost" onClick={forget}>
              Gespeicherten Zugang entfernen
            </button>
          </>
        )}

        {state === "ready" && (
          <>
            <p id="status" className="note">
              ✓ Zugang aktiv. Erlaubte Märkte: {products[0]?.allowed_stores.join(", ") ?? "–"}. Heute:{" "}
              {new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })}.
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
            <button className="btn ghost" onClick={forget}>
              Zugang in diesem Browser entfernen
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
