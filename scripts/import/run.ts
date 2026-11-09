// Wöchentlicher Angebotsimport. Läuft in GitHub Actions (siehe .github/workflows/import-offers.yml).
// Benötigt SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY als GitHub Secrets. Der Service-Schlüssel
// umgeht RLS und darf deshalb nie in die App oder in den Browser.
//
// Aufruf lokal ohne Datenbank (nur anzeigen): npx tsx scripts/import/run.ts --dry
import { createClient } from "@supabase/supabase-js";
import { matches } from "../../lib/matching";
import { aldiNord } from "./adapters/aldi-nord";
import { kaufland } from "./adapters/kaufland";
import { edeka, lidl, netto } from "./adapters/pending";
import type { Adapter, AdapterContext } from "./types";
import { cleanSupabaseUrl, isAllowed, normalizeOffer, USER_AGENT } from "./util";

const ADAPTERS: Adapter[] = [aldiNord, kaufland, lidl, netto, edeka];
const dry = process.argv.includes("--dry");
// Leeres Feld beim Start von Hand = alle Märkte
const only = process.env.IMPORT_STORES?.split(",").map((s) => s.trim()).filter(Boolean);

async function fetchHtml(url: string): Promise<string> {
  if (!(await isAllowed(url))) throw new Error(`robots.txt verbietet ${url}`);
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, "accept-language": "de-DE" } });
  if (!res.ok) throw new Error(`${url} antwortet mit HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const ctx: AdapterContext = { today: new Date(), fetchHtml };
  if (!dry && !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) throw new Error("Secret SUPABASE_SERVICE_ROLE_KEY fehlt oder ist leer.");
  const db = dry
    ? null
    : createClient(cleanSupabaseUrl(process.env.SUPABASE_URL), process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), {
        auth: { persistSession: false },
      });

  const products = db
    ? ((await db.from("products").select("id, household_id, unit, keywords_include, keywords_exclude").eq("active", true))
        .data ?? [])
    : [];

  let failed = 0;
  for (const adapter of ADAPTERS) {
    if (only?.length && !only.includes(adapter.store)) {
      console.log(`– ${adapter.store}: nicht ausgewählt`);
      continue;
    }
    if (!adapter.ready) {
      console.log(`– ${adapter.store}: Adapter noch nicht gebaut, übersprungen`);
      continue;
    }
    try {
      const raw = await adapter.fetchOffers(ctx);
      const offers = raw.map(normalizeOffer);
      console.log(`✓ ${adapter.store}: ${offers.length} Angebote`);
      if (offers.length === 0) throw new Error("0 Angebote gefunden – hat sich die Seite geändert?");
      const noUnit = offers.filter((o) => !o.unit).length;
      if (noUnit) console.log(`   ${noUnit} ohne erkennbare Menge (werden gespeichert, aber nicht verglichen)`);

      if (dry) {
        for (const o of offers.slice(0, 15))
          console.log(`   ${o.title} | ${o.pack_text} | ${o.price_cents} ct | ${o.unit_price_cents ?? "?"} ct/${o.unit ?? "?"}`);
        continue;
      }

      // Doppelte Schlüssel entfernen (sonst lehnt Postgres das Upsert ab) und nur echte Spalten senden
      const unique = [...new Map(offers.map((o) => [o.source_key, o])).values()];
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const rows = unique.map(({ base_price_text: _ignored, ...o }) => ({ ...o, store_id: adapter.store }));
      const { data: saved, error } = await db!
        .from("offers")
        .upsert(rows, { onConflict: "store_id,source_key" })
        .select("id, title, brand, unit");
      if (error) throw error;

      // Zuordnung zu den Produkten jedes Haushalts (nur Vorschläge, bestätigte bleiben unberührt)
      const matchRows = [];
      for (const o of saved ?? [])
        for (const p of products)
          if (p.unit === o.unit && matches(`${o.brand ?? ""} ${o.title}`, p))
            matchRows.push({ offer_id: o.id, product_id: p.id, household_id: p.household_id });
      if (matchRows.length) {
        const { error: mErr } = await db!
          .from("offer_matches")
          .upsert(matchRows, { onConflict: "offer_id,product_id", ignoreDuplicates: true });
        if (mErr) throw mErr;
      }
      console.log(`   ${matchRows.length} Treffer für eure Produkte`);
      await db!.from("import_runs").insert({ store_id: adapter.store, ok: true, offers_found: offers.length });
    } catch (e) {
      failed++;
      const message =
        e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : JSON.stringify(e);
      console.error(`✗ ${adapter.store}: ${message}`);
      if (db) await db.from("import_runs").insert({ store_id: adapter.store, ok: false, message });
    }
  }

  if (db) await db.from("heartbeat").update({ seen_at: new Date().toISOString() }).eq("id", 1);
  if (failed) process.exitCode = 1; // GitHub schickt dann eine Mail über den fehlgeschlagenen Lauf
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
