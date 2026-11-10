"use client";
import { useEffect, useRef, useState } from "react";
import { addFreeItem, deleteItem, queueCheck, setChecked, setMatch, setQty, type HouseholdData, type ListItem, type Product } from "@/lib/data";
import type { Analysis, Pick } from "@/lib/pricing";
import { formatEuro } from "@/lib/units";
import Scanner from "./Scanner";
import { CATEGORIES, categoryIndex, Confetti, Fred, pct, PriceTag, STORE_NAMES, StoreChip, unitPrice } from "./shared";

interface Row {
  item: ListItem;
  product: Product | null; // null = Einmaliges (Freitext)
  category: string;
  name: string;
}

export default function ListView({
  data,
  analyses,
  onChange,
  reload,
}: {
  data: HouseholdData;
  analyses: Map<string, Analysis>;
  onChange: (d: HouseholdData) => void;
  reload: () => void;
}) {
  const [shopMode, setShopMode] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [celebrate, setCelebrate] = useState(false);
  const [scanning, setScanning] = useState(false);
  const names = new Map(data.members.map((m) => [m.user_id, m.display_name]));
  const productById = new Map(data.products.map((p) => [p.id, p]));

  const rows: Row[] = data.items
    .map((item) => {
      const product = item.product_id ? (productById.get(item.product_id) ?? null) : null;
      if (item.product_id && (!product || !product.active)) return null;
      return {
        item,
        product,
        category: product?.category ?? item.category ?? "sonstiges",
        name: product?.name ?? item.free_text ?? "",
      };
    })
    .filter((r): r is Row => !!r && !!r.name);

  const open = rows.filter((r) => !r.item.checked_at);
  const done = rows.filter((r) => r.item.checked_at);

  // Konfetti, sobald der letzte Haken gesetzt ist
  const prevOpen = useRef(open.length);
  useEffect(() => {
    if (prevOpen.current > 0 && open.length === 0 && rows.length > 0) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 3200);
      prevOpen.current = open.length;
      return () => clearTimeout(t);
    }
    prevOpen.current = open.length;
  }, [open.length, rows.length]);

  // Einkaufsmodus: Bildschirm bleibt an
  useEffect(() => {
    if (!shopMode || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () =>
      navigator.wakeLock
        .request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    request();
    const onVisible = () => document.visibilityState === "visible" && request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [shopMode]);

  async function toggle(item: ListItem, checked: boolean) {
    const now = new Date().toISOString();
    onChange({
      ...data,
      items: data.items.map((i) => (i.id === item.id ? { ...i, checked_at: checked ? now : null, checked_by: checked ? data.me : null } : i)),
    });
    try {
      await setChecked(item.id, checked);
    } catch {
      queueCheck(item.id, checked); // kein Netz im Laden: später nachholen
    }
  }

  async function changeQty(item: ListItem, qty: number) {
    const q = Math.max(1, Math.min(99, qty));
    onChange({ ...data, items: data.items.map((i) => (i.id === item.id ? { ...i, qty: q } : i)) });
    await setQty(item.id, q).catch(reload);
  }

  async function addFree(e: React.FormEvent) {
    e.preventDefault();
    const text = freeText.trim();
    if (!text) return;
    setFreeText("");
    try {
      const item = await addFreeItem(data.listId, data.householdId, text);
      onChange({ ...data, items: [...data.items.filter((i) => i.id !== item.id), item] });
    } catch {
      setFreeText(text);
    }
  }

  async function remove(item: ListItem) {
    onChange({ ...data, items: data.items.filter((i) => i.id !== item.id) });
    await deleteItem(item.id).catch(reload);
  }

  async function judge(p: Pick, productId: string, ok: boolean) {
    if (!p.offerId) return;
    const key = `${p.offerId}|${productId}`;
    const matchState = new Map(data.matchState);
    const offersByProduct = new Map(data.offersByProduct);
    if (ok) matchState.set(key, true);
    else {
      matchState.delete(key);
      offersByProduct.set(productId, (offersByProduct.get(productId) ?? []).filter((o) => o.id !== p.offerId));
    }
    onChange({ ...data, matchState, offersByProduct });
    await setMatch(p.offerId, productId, ok).catch(reload);
  }

  if (!rows.length)
    return (
      <section className="list">
        <FreeForm value={freeText} onChange={setFreeText} onSubmit={addFree} />
        <div className="card emptyfred">
          <Fred pose="fred-2-einkaufskorb" size={120} />
          Eure Liste ist leer. Legt unter „Verwalten“ eure Produkte an oder tragt oben etwas ein.
        </div>
      </section>
    );

  // Im Einkaufsmodus nach Bereichen gruppieren
  const sections = shopMode
    ? CATEGORIES.map((c) => ({ c, rows: open.filter((r) => categoryIndex(r.category) === categoryIndex(c.id)) })).filter((s) => s.rows.length)
    : [{ c: null, rows: open }];

  return (
    <section className={`list${shopMode ? " shopmode" : ""}`} aria-live="polite">
      <Confetti show={celebrate} />
      {scanning && (
        <Scanner data={data} analyses={analyses} onClose={() => setScanning(false)} onChanged={(d) => (d ? onChange(d) : reload())} />
      )}
      <div className="listbar">
        <button className={`btn ${shopMode ? "primary" : "ghost"}`} onClick={() => setShopMode(!shopMode)} aria-pressed={shopMode}>
          {shopMode ? "✓ Im Laden" : "🛒 Einkaufsmodus"}
        </button>
        <button className="btn ghost" onClick={() => setScanning(true)}>
          📷 Scannen
        </button>
        <span className="note">
          {open.length ? `${open.length} offen` : "Alles erledigt!"} · {done.length} im Wagen
        </span>
      </div>
      {!shopMode && <FreeForm value={freeText} onChange={setFreeText} onSubmit={addFree} />}

      {open.length === 0 && (
        <div className="card fredsays">
          <Fred pose="fred-5-ersparnis" />
          <div>
            <b>Alles im Wagen!</b>
            <span>Gut gemacht. Lad danach gern den Bon hoch, dann lernt Fred die Preise.</span>
          </div>
        </div>
      )}

      {sections.map(({ c, rows: rs }) => (
        <div key={c?.id ?? "all"} className="list">
          {c && (
            <div className="group-h">
              <span>
                {c.icon} {c.name}
              </span>
              <span>{rs.length}</span>
            </div>
          )}
          {rs.map((r) => (
            <ItemRow
              key={r.item.id}
              r={r}
              a={r.product ? analyses.get(r.product.id) : undefined}
              data={data}
              shopMode={shopMode}
              who={null}
              onToggle={toggle}
              onRemove={remove}
              onJudge={judge}
              onQty={changeQty}
            />
          ))}
        </div>
      ))}

      {done.length > 0 && (
        <>
          <div className="group-h">
            <span>Im Wagen</span>
            <span>{done.length}</span>
          </div>
          {done.map((r) => (
            <ItemRow
              key={r.item.id}
              r={r}
              a={r.product ? analyses.get(r.product.id) : undefined}
              data={data}
              shopMode={shopMode}
              who={r.item.checked_by ? (names.get(r.item.checked_by) ?? "euch") : null}
              onToggle={toggle}
              onRemove={remove}
              onJudge={judge}
              onQty={changeQty}
            />
          ))}
        </>
      )}
    </section>
  );
}

function FreeForm({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: (e: React.FormEvent) => void }) {
  return (
    <form className="card add freeadd" onSubmit={onSubmit}>
      <input type="text" placeholder="Noch was mitbringen? z. B. Spülmittel" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Einmaliges auf die Liste" />
      <button className="btn primary" disabled={!value.trim()}>
        Dazu
      </button>
    </form>
  );
}

function ItemRow({
  r,
  a,
  data,
  shopMode,
  who,
  onToggle,
  onRemove,
  onJudge,
  onQty,
}: {
  r: Row;
  a: Analysis | undefined;
  data: HouseholdData;
  shopMode: boolean;
  who: string | null;
  onToggle: (item: ListItem, checked: boolean) => void;
  onRemove: (item: ListItem) => void;
  onJudge: (p: Pick, productId: string, ok: boolean) => void;
  onQty: (item: ListItem, qty: number) => void;
}) {
  const isDone = !!r.item.checked_at;
  const free = !r.product;
  const qty = r.item.qty ?? 1;
  return (
    <article className={`card row${isDone ? " done" : ""}${free ? " free" : ""}`}>
      <label className="chk">
        <input type="checkbox" checked={isDone} onChange={(e) => onToggle(r.item, e.target.checked)} aria-label={`${r.name} abhaken`} />
        <span />
      </label>
      <div className="title">
        <b>
          {qty > 1 && <span className="qtyx">{qty}× </span>}
          {r.name}
        </b>
        {!isDone && (
          <div className="stepper" role="group" aria-label={`Anzahl ${r.name}`}>
            <button onClick={() => onQty(r.item, qty - 1)} disabled={qty <= 1} aria-label="eins weniger">
              −
            </button>
            <span aria-live="polite">{qty}</span>
            <button onClick={() => onQty(r.item, qty + 1)} aria-label="eins mehr">
              +
            </button>
          </div>
        )}
        {who && <div className="who">abgehakt von {who}</div>}
        {shopMode && a?.best && !isDone && (
          <div className="who">
            {a.best.kind === "angebot" ? "Angebot" : "normal"} bei {STORE_NAMES[a.best.store_id]}
          </div>
        )}
      </div>
      {free ? (
        <button className="xbtn" onClick={() => onRemove(r.item)} aria-label={`${r.name} entfernen`}>
          ×
        </button>
      ) : a ? (
        <PriceTag a={a} compact={shopMode} />
      ) : (
        <span />
      )}
      {!shopMode && a && r.product && (
        <>
          <div className="main">
            {a.best && (
              <div className="line">
                <StoreChip store={a.best.store_id} />
                <span className="txt">{a.best.label}</span>
                {a.best.needsCard && <span className="chip amber">mit Card/App</span>}
                {a.isDeal && a.saving != null && <span className="chip hot">−{pct(a.saving)}</span>}
                {a.isHistoryLow && <span className="chip mint">günstigster Preis bisher</span>}
                {qty > 1 && <span className="chip soft">{qty} × = {formatEuro(a.best.price_cents * qty)}</span>}
              </div>
            )}
            {a.cheaperNormalElsewhere && a.offers[0] && (
              <div className="note">
                Das Angebot ({unitPrice(a.offers[0])}) ist teurer als der Normalpreis bei der Konkurrenz.
              </div>
            )}
          </div>
          {(a.offers.length > 0 || a.normals.length > 1) && (
            <details className="more">
              <summary>Alle Preise{a.offers.length ? ` · ${a.offers.length} Angebot${a.offers.length > 1 ? "e" : ""}` : ""}</summary>
              <div className="alt">
                {[...a.offers, ...a.normals].map((x, i) => {
                  const state = x.offerId ? data.matchState.get(`${x.offerId}|${r.product!.id}`) : undefined;
                  return (
                    <div key={i} style={{ display: "contents" }}>
                      <StoreChip store={x.store_id} />
                      <span>
                        {x.label} <span className="detail">{x.kind === "angebot" ? "Angebot" : "normal"}</span>
                        {x.kind === "angebot" && (
                          <span className="judge">
                            {state === true ? (
                              <span className="chip mint">passt ✓</span>
                            ) : (
                              <>
                                <button onClick={() => onJudge(x, r.product!.id, true)} aria-label={`${x.label} passt zu ${r.name}`} title="Passt">
                                  👍
                                </button>
                                <button onClick={() => onJudge(x, r.product!.id, false)} aria-label={`${x.label} passt nicht zu ${r.name}`} title="Passt nicht">
                                  👎
                                </button>
                              </>
                            )}
                          </span>
                        )}
                      </span>
                      <span className="ap">
                        {formatEuro(x.price_cents)} <span className="au">{unitPrice(x)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="note">👎 bei einem Angebot, das nicht zu {r.name} passt: Fred zeigt es dann nicht mehr an.</p>
            </details>
          )}
        </>
      )}
    </article>
  );
}
