"use client";
// Barcode-Scanner: Kamera → EAN → eures Produkt → „Ist der Preis hier gut?“
// Erkennung mit ZXing komplett im Browser. Für unbekannte Barcodes fragt Fred Open Food Facts
// nach dem Produktnamen (kostenlos, nur die Barcode-Nummer wird übertragen).
import { useEffect, useRef, useState } from "react";
import {
  addObservation,
  addProductToList,
  findBarcode,
  lookupOpenFoodFacts,
  saveBarcode,
  upsertProduct,
  type BarcodeLink,
  type HouseholdData,
  type Product,
} from "@/lib/data";
import type { Analysis, StoreId } from "@/lib/pricing";
import { formatEuro, parseAmount, toCents, unitLabel, unitPriceCents, type BaseUnit } from "@/lib/units";
import { today } from "@/lib/week";
import { Fred, STORE_NAMES, StoreChip, unitPrice } from "./shared";

type Phase = "scan" | "lookup" | "known" | "unknown";

export default function Scanner({
  data,
  analyses,
  onClose,
  onChanged,
}: {
  data: HouseholdData;
  analyses: Map<string, Analysis>;
  onClose: () => void;
  onChanged: (d: HouseholdData | null) => void; // null = neu laden
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>("scan");
  const [ean, setEan] = useState("");
  const [manual, setManual] = useState("");
  const [camError, setCamError] = useState<string | null>(null);
  const [link, setLink] = useState<BarcodeLink | null>(null);
  const [off, setOff] = useState<{ name: string; quantity: string | null } | null>(null);
  const [scanKey, setScanKey] = useState(0); // erneut scannen

  // Kamera starten
  useEffect(() => {
    if (phase !== "scan") return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          video.current!,
          (result) => {
            if (result && !cancelled) {
              cancelled = true;
              controls.stop();
              navigator.vibrate?.(60);
              handle(result.getText());
            }
          },
        );
        stop = () => controls.stop();
        if (cancelled) stop();
      } catch (e) {
        setCamError(
          e instanceof Error && /permission|denied|notallowed/i.test(e.name + e.message)
            ? "Fred darf die Kamera nicht benutzen. Erlaube den Kamerazugriff für Fred in den Handy-Einstellungen oder tippe die Nummer unten ein."
            : "Die Kamera ließ sich nicht starten. Tippe die Nummer unter dem Barcode unten ein.",
        );
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [phase, scanKey]);

  async function handle(code: string) {
    const clean = code.replace(/\D/g, "");
    setEan(clean);
    setPhase("lookup");
    const found = await findBarcode(clean).catch(() => null);
    if (found) {
      setLink(found);
      setPhase("known");
    } else {
      setOff(await lookupOpenFoodFacts(clean));
      setPhase("unknown");
    }
  }

  function again() {
    setLink(null);
    setOff(null);
    setEan("");
    setManual("");
    setCamError(null);
    setPhase("scan");
    setScanKey((k) => k + 1);
  }

  const product = link ? data.products.find((p) => p.id === link.product_id) : undefined;

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Barcode scannen">
      <div className="scanbar">
        <b>Barcode scannen</b>
        <button className="xbtn" onClick={onClose} aria-label="Scanner schließen">
          ×
        </button>
      </div>

      {phase === "scan" && (
        <>
          <div className="scanview">
            <video ref={video} playsInline muted />
            <div className="scanframe" aria-hidden="true" />
          </div>
          {camError ? <p className="err">{camError}</p> : <p className="note">Halte den Barcode in den Rahmen. Fred erkennt ihn von selbst.</p>}
          <form
            className="card add freeadd"
            onSubmit={(e) => {
              e.preventDefault();
              if (/^\d{8,14}$/.test(manual.trim())) handle(manual.trim());
            }}
          >
            <input type="text" inputMode="numeric" placeholder="oder Nummer eintippen" value={manual} onChange={(e) => setManual(e.target.value)} />
            <button className="btn primary" disabled={!/^\d{8,14}$/.test(manual.trim())}>
              Suchen
            </button>
          </form>
        </>
      )}

      {phase === "lookup" && (
        <div className="card status">
          <div className="spinner" /> Fred sucht {ean} …
        </div>
      )}

      {phase === "known" && product && link && (
        <KnownProduct data={data} product={product} link={link} a={analyses.get(product.id)} onChanged={onChanged} onAgain={again} />
      )}

      {phase === "unknown" && <UnknownProduct data={data} ean={ean} off={off} onChanged={onChanged} onLinked={(l) => (setLink(l), setPhase("known"))} onAgain={again} />}
    </div>
  );
}

function KnownProduct({
  data,
  product,
  link,
  a,
  onChanged,
  onAgain,
}: {
  data: HouseholdData;
  product: Product;
  link: BarcodeLink;
  a: Analysis | undefined;
  onChanged: (d: HouseholdData | null) => void;
  onAgain: () => void;
}) {
  const [store, setStore] = useState<StoreId>("kaufland");
  const [price, setPrice] = useState("");
  const [pack, setPack] = useState(link.pack_text ?? product.pack_hint ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  const cents = toCents(price);
  const amount = parseAmount(pack);
  const unitOk = amount && amount.unit === product.unit;
  const shelfUnit = cents && amount && unitOk ? unitPriceCents(cents, amount) : null;
  const best = a?.best ?? null;

  let verdict: { tone: "good" | "bad" | "ok"; text: string } | null = null;
  if (shelfUnit && best) {
    const diff = 1 - shelfUnit / best.unit_price_cents;
    if (shelfUnit <= best.unit_price_cents)
      verdict = { tone: "good", text: `Guter Preis! Günstiger oder gleich wie alles, was Fred kennt (bisher bestes: ${unitPrice(best)} bei ${STORE_NAMES[best.store_id]}).` };
    else if (diff > -0.05) verdict = { tone: "ok", text: `Fast gleich wie das beste Angebot (${unitPrice(best)} bei ${STORE_NAMES[best.store_id]}).` };
    else
      verdict = {
        tone: "bad",
        text: `${Math.round(-diff * 100)} % teurer als bei ${STORE_NAMES[best.store_id]} (${unitPrice(best)}${best.kind === "angebot" ? ", Angebot" : ""}).`,
      };
  }

  async function savePrice() {
    if (!cents || !amount || !unitOk) return;
    await addObservation({
      household_id: data.householdId,
      product_id: product.id,
      store_id: store,
      label: link.label ?? product.name,
      price_cents: cents,
      amount: amount.amount,
      unit: product.unit,
      unit_price_cents: unitPriceCents(cents, amount),
      observed_on: today(),
      source: "manuell",
    });
    if (pack && pack !== link.pack_text) await saveBarcode(data.householdId, { ...link, pack_text: pack }).catch(() => {});
    setMsg("Preis gespeichert. Fred vergleicht ab jetzt damit.");
    onChanged(null);
  }

  async function addToList() {
    const item = await addProductToList(data.listId, data.householdId, product.id, data.items);
    onChanged({ ...data, items: data.items.some((i) => i.id === item.id) ? data.items.map((i) => (i.id === item.id ? item : i)) : [...data.items, item] });
    setMsg(`${product.name} ist auf der Liste (${item.qty ?? 1}×).`);
  }

  return (
    <div className="list">
      <div className="card fredsays">
        <Fred pose="fred-3-lupe" />
        <div>
          <b>{product.name}</b>
          <span>{link.label ?? "Barcode bekannt"}</span>
        </div>
      </div>
      {best && (
        <div className="card review">
          <span className="note">Bester bekannter Preis</span>
          <div className="line">
            <StoreChip store={best.store_id} />
            <span className="txt">{best.label}</span>
            <b>{formatEuro(best.price_cents)}</b>
            <span>{unitPrice(best)}</span>
          </div>
        </div>
      )}
      <div className="card review">
        <b>Preis hier am Regal</b>
        <div className="head">
          <select value={store} onChange={(e) => setStore(e.target.value as StoreId)} aria-label="Markt">
            {data.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input type="text" inputMode="decimal" placeholder="Preis, z. B. 1,19" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Preis" />
        </div>
        <input type="text" placeholder={`Packungsgröße, z. B. 500 g`} value={pack} onChange={(e) => setPack(e.target.value)} aria-label="Packungsgröße" />
        {shelfUnit && (
          <span className="note">
            Grundpreis hier: {formatEuro(shelfUnit)}/{unitLabel(product.unit)}
          </span>
        )}
        {pack && amount && !unitOk && <span className="err">{product.name} wird je {unitLabel(product.unit)} verglichen. Bitte passende Menge angeben.</span>}
        {verdict && <div className={`verdict ${verdict.tone}`}>{verdict.text}</div>}
        {!best && shelfUnit && <span className="note">Fred kennt noch keinen anderen Preis. Speichere ihn, dann vergleicht er künftig.</span>}
        <div className="bonbtns">
          <button className="btn" onClick={savePrice} disabled={!shelfUnit}>
            Preis merken
          </button>
          <button className="btn primary" onClick={addToList}>
            + Auf die Liste
          </button>
        </div>
        {msg && <span className="note">{msg}</span>}
      </div>
      <button className="btn ghost" onClick={onAgain}>
        Nächsten Barcode scannen
      </button>
    </div>
  );
}

function UnknownProduct({
  data,
  ean,
  off,
  onChanged,
  onLinked,
  onAgain,
}: {
  data: HouseholdData;
  ean: string;
  off: { name: string; quantity: string | null } | null;
  onChanged: (d: HouseholdData | null) => void;
  onLinked: (l: BarcodeLink) => void;
  onAgain: () => void;
}) {
  const [choice, setChoice] = useState("");
  const [newName, setNewName] = useState(off?.name ?? "");
  const guess = parseAmount(off?.quantity ?? "");
  const [unit, setUnit] = useState<BaseUnit>(guess?.unit ?? "kg");
  const [err, setErr] = useState<string | null>(null);

  async function link() {
    try {
      let productId = choice;
      if (choice === "__neu") {
        if (!newName.trim()) return setErr("Bitte einen Namen eingeben.");
        const p = await upsertProduct({
          household_id: data.householdId,
          name: newName.trim(),
          unit,
          keywords_include: newName.trim().toLowerCase().split(/\s+/).slice(-2),
          keywords_exclude: [],
          active: true,
          sort: data.products.length,
        });
        productId = p.id;
      }
      if (!productId) return setErr("Bitte ein Produkt wählen.");
      const l: BarcodeLink = { ean, product_id: productId, label: off?.name ?? null, pack_text: off?.quantity ?? null };
      await saveBarcode(data.householdId, l);
      onChanged(null);
      onLinked(l);
    } catch (e) {
      setErr(`Speichern fehlgeschlagen. Wurde die Migration 0004 in Supabase ausgeführt? (${e instanceof Error ? e.message : JSON.stringify(e)})`);
    }
  }

  return (
    <div className="list">
      <div className="card fredsays">
        <Fred pose="fred-4-nachdenklich" />
        <div>
          <b>{off ? off.name : "Diesen Barcode kenne ich noch nicht"}</b>
          <span>
            {off ? `${off.quantity ?? ""} · Zu welchem eurer Produkte gehört das?` : `Nummer ${ean}. Zu welchem eurer Produkte gehört das?`}
          </span>
        </div>
      </div>
      <div className="card review">
        <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Produkt zuordnen">
          <option value="">– Produkt wählen –</option>
          {data.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="__neu">+ Neues Produkt anlegen</option>
        </select>
        {choice === "__neu" && (
          <div className="head">
            <input type="text" placeholder="Name, z. B. Kräuterquark" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Name" />
            <select value={unit} onChange={(e) => setUnit(e.target.value as BaseUnit)} aria-label="Einheit">
              <option value="kg">Preis je kg</option>
              <option value="l">Preis je Liter</option>
              <option value="stk">Preis je Stück</option>
            </select>
          </div>
        )}
        {err && <span className="err">{err}</span>}
        <div className="bonbtns">
          <button className="btn ghost" onClick={onAgain}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={link} disabled={!choice}>
            Zuordnen
          </button>
        </div>
        <span className="note">Fred merkt sich den Barcode. Beim nächsten Scan erkennt er das Produkt sofort.</span>
      </div>
    </div>
  );
}
