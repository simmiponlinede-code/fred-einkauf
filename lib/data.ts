"use client";
// Laden und Schreiben der Haushaltsdaten über supabase-js. RLS sorgt dafür,
// dass nur die zwei Mitglieder des Haushalts ihre Daten sehen.
import type { Observation, Offer, StoreId } from "./pricing";
import { supabase } from "./supabase";
import type { BaseUnit } from "./units";
import { isoWeek } from "./week";

export interface Product {
  id: string;
  household_id: string;
  slug: string;
  name: string;
  unit: BaseUnit;
  keywords_include: string[];
  keywords_exclude: string[];
  pack_hint: string | null;
  active: boolean;
  sort: number;
  category: string;
}

export interface ListItem {
  id: string;
  list_id: string;
  product_id: string | null;
  free_text: string | null;
  checked_by: string | null;
  checked_at: string | null;
  category?: string | null;
  created_by?: string | null;
}

export interface Member {
  user_id: string;
  display_name: string;
}

export interface Store {
  id: StoreId;
  name: string;
}

export interface HouseholdData {
  householdId: string;
  me: string; // eigene user_id
  members: Member[];
  stores: Store[];
  products: Product[];
  offersByProduct: Map<string, Offer[]>;
  /** `${offerId}|${productId}` → true (bestätigt) oder null (Vorschlag); abgelehnte fehlen */
  matchState: Map<string, boolean | null>;
  obsByProduct: Map<string, Observation[]>;
  listId: string;
  items: ListItem[];
  lastImports: { store_id: string; ok: boolean; started_at: string; offers_found: number; message: string | null }[];
}

function must<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

export async function loadHousehold(): Promise<HouseholdData> {
  const db = supabase();
  const me = (await db.auth.getUser()).data.user?.id ?? "";
  const householdId = must(await db.rpc("my_household")) as string | null;
  if (!householdId) throw new Error("Dein Konto ist noch keinem Haushalt zugeordnet (setup_household.sql ausführen).");

  const [members, stores, products, matches, obs, imports] = await Promise.all([
    db.from("household_members").select("user_id, display_name").eq("household_id", householdId),
    db.from("stores").select("id, name").order("sort"),
    db.from("products").select("*").eq("household_id", householdId).order("sort"),
    db
      .from("offer_matches")
      .select("product_id, confirmed, offers(*)")
      .eq("household_id", householdId)
      .or("confirmed.is.null,confirmed.eq.true"),
    db.from("price_observations").select("*").eq("household_id", householdId).order("observed_on", { ascending: false }),
    db.from("import_runs").select("store_id, ok, started_at, offers_found, message").order("started_at", { ascending: false }).limit(20),
  ]);

  const offersByProduct = new Map<string, Offer[]>();
  const matchState = new Map<string, boolean | null>();
  for (const m of must(matches) as unknown as { product_id: string; confirmed: boolean | null; offers: Offer }[]) {
    if (!m.offers) continue;
    matchState.set(`${m.offers.id}|${m.product_id}`, m.confirmed);
    const arr = offersByProduct.get(m.product_id) ?? [];
    arr.push(m.offers);
    offersByProduct.set(m.product_id, arr);
  }
  const obsByProduct = new Map<string, Observation[]>();
  for (const o of must(obs) as (Observation & { product_id: string })[]) {
    const arr = obsByProduct.get(o.product_id) ?? [];
    arr.push(o);
    obsByProduct.set(o.product_id, arr);
  }

  const { listId, items } = await loadList(householdId);

  return {
    householdId,
    me,
    matchState,
    members: must(members) as Member[],
    stores: must(stores) as Store[],
    products: must(products) as Product[],
    offersByProduct,
    obsByProduct,
    listId,
    items,
    lastImports: must(imports) as HouseholdData["lastImports"],
  };
}

/** Wochenliste holen oder anlegen; neue Wochen starten mit allen aktiven Produkten. */
export async function loadList(householdId: string): Promise<{ listId: string; items: ListItem[] }> {
  const db = supabase();
  const week = isoWeek();
  let list = must(await db.from("shopping_lists").select("id").eq("household_id", householdId).eq("week", week).maybeSingle()) as {
    id: string;
  } | null;
  if (!list) {
    const created = await db.from("shopping_lists").insert({ household_id: householdId, week }).select("id").single();
    if (created.error && created.error.code !== "23505") throw created.error; // 23505: Partner war schneller
    list = created.data ?? (must(await db.from("shopping_lists").select("id").eq("household_id", householdId).eq("week", week).single()) as { id: string });
    const products = must(await db.from("products").select("id").eq("household_id", householdId).eq("active", true)) as { id: string }[];
    if (products.length)
      await db
        .from("list_items")
        .upsert(products.map((p) => ({ list_id: list!.id, household_id: householdId, product_id: p.id })), {
          onConflict: "list_id,product_id",
          ignoreDuplicates: true,
        });
  }
  const items = must(await db.from("list_items").select("*").eq("list_id", list.id)) as ListItem[];
  return { listId: list.id, items };
}

export async function setChecked(itemId: string, checked: boolean) {
  const db = supabase();
  const user = (await db.auth.getUser()).data.user;
  must(
    await db
      .from("list_items")
      .update(checked ? { checked_by: user?.id, checked_at: new Date().toISOString() } : { checked_by: null, checked_at: null })
      .eq("id", itemId),
  );
}

/** Live-Abhaken: meldet Änderungen der Liste vom Partner. */
export function subscribeList(listId: string, onChange: (item: ListItem, deleted: boolean) => void) {
  const db = supabase();
  const channel = db
    .channel(`list-${listId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "list_items", filter: `list_id=eq.${listId}` }, (p) =>
      p.eventType === "DELETE" ? onChange(p.old as ListItem, true) : onChange(p.new as ListItem, false),
    )
    .subscribe();
  return () => {
    db.removeChannel(channel);
  };
}

export async function upsertProduct(p: Partial<Product> & { household_id: string; name: string; unit: BaseUnit }) {
  const slug =
    p.slug ??
    p.name
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return must(await supabase().from("products").upsert({ ...p, slug }, { onConflict: "household_id,slug" }).select().single()) as Product;
}

export async function addObservation(o: Observation & { amount: number; product_id: string; household_id: string; receipt_id?: string }) {
  must(await supabase().from("price_observations").insert(o));
}

/** Angebot für ein Produkt bestätigen (true) oder ablehnen (false). Abgelehnte kommen nicht wieder. */
export async function setMatch(offerId: string, productId: string, confirmed: boolean) {
  must(await supabase().from("offer_matches").update({ confirmed }).eq("offer_id", offerId).eq("product_id", productId));
}

/** Einmaliges auf die Liste, z. B. „Spülmittel“. */
export async function addFreeItem(listId: string, householdId: string, text: string, category: string | null = null) {
  return must(
    await supabase().from("list_items").insert({ list_id: listId, household_id: householdId, free_text: text, category }).select().single(),
  ) as ListItem;
}

export async function deleteItem(itemId: string) {
  must(await supabase().from("list_items").delete().eq("id", itemId));
}

// ---------------------------------------------------------------
// Offline: letzter Stand im Gerät, damit die Liste im Funkloch bleibt
// ---------------------------------------------------------------
const CACHE_KEY = "fred-cache-v1";
const QUEUE_KEY = "fred-queue-v1";

export function saveSnapshot(d: HouseholdData) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        ...d,
        savedAt: new Date().toISOString(),
        offersByProduct: [...d.offersByProduct],
        obsByProduct: [...d.obsByProduct],
        matchState: [...d.matchState],
      }),
    );
  } catch {
    /* Speicher voll oder privat: dann eben ohne Offline-Kopie */
  }
}

export function loadSnapshot(): (HouseholdData & { savedAt: string }) | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    return { ...j, offersByProduct: new Map(j.offersByProduct), obsByProduct: new Map(j.obsByProduct), matchState: new Map(j.matchState) };
  } catch {
    return null;
  }
}

/** Abhaken ohne Netz merken und später nachholen. */
export function queueCheck(itemId: string, checked: boolean) {
  try {
    const q: Record<string, boolean> = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "{}");
    q[itemId] = checked;
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* ignorieren */
  }
}

export async function flushQueue(): Promise<number> {
  let q: Record<string, boolean> = {};
  try {
    q = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "{}");
  } catch {
    return 0;
  }
  let done = 0;
  for (const [id, checked] of Object.entries(q)) {
    try {
      await setChecked(id, checked);
      delete q[id];
      done++;
    } catch {
      break; // immer noch offline
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  return done;
}

// ---------------------------------------------------------------
// Push-Abo speichern
// ---------------------------------------------------------------
export async function savePushSubscription(householdId: string, sub: PushSubscription) {
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  must(
    await supabase()
      .from("push_subscriptions")
      .upsert({ household_id: householdId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: "endpoint" }),
  );
}

export async function deletePushSubscription(endpoint: string) {
  must(await supabase().from("push_subscriptions").delete().eq("endpoint", endpoint));
}
