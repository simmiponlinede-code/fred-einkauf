// Montags-Push: nach dem Import bekommt jedes Haushaltsmitglied eine Nachricht mit den
// Schnäppchen der Woche. Web Push mit eigenen VAPID-Schlüsseln, kein Drittanbieter, kostenlos.
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { analyze, type Observation, type Offer } from "../../lib/pricing";
import type { BaseUnit } from "../../lib/units";

const STORE: Record<string, string> = { "aldi-nord": "Aldi", lidl: "Lidl", kaufland: "Kaufland", netto: "Netto", edeka: "Edeka" };

export interface Deal {
  name: string;
  store: string;
  saving: number; // 0.17 = 17 %
}

/** Text der Nachricht; null = nichts zu melden. */
export function buildMessage(deals: Deal[]): { title: string; body: string } | null {
  if (!deals.length) return null;
  const top = [...deals].sort((a, b) => b.saving - a.saving);
  const list = top
    .slice(0, 3)
    .map((d) => `${d.name} −${Math.round(d.saving * 100)} % (${STORE[d.store] ?? d.store})`)
    .join(", ");
  const more = top.length > 3 ? ` und ${top.length - 3} mehr` : "";
  return {
    title: top.length === 1 ? "Fred hat ein Schnäppchen gefunden" : `Fred hat ${top.length} Schnäppchen gefunden`,
    body: `${list}${more}.`,
  };
}

export async function sendWeeklyPush(db: SupabaseClient, today: string): Promise<void> {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) {
    console.log("– Push: VAPID-Schlüssel fehlen, übersprungen");
    return;
  }
  webpush.setVapidDetails(process.env.APP_URL?.trim() || "https://fred-einkauf.vercel.app", pub, priv);

  const { data: subs, error } = await db.from("push_subscriptions").select("id, household_id, endpoint, p256dh, auth");
  if (error) {
    console.log(`– Push: Tabelle push_subscriptions fehlt oder ist nicht lesbar (${error.message}). Migration 0002 ausführen.`);
    return;
  }
  if (!subs?.length) {
    console.log("– Push: noch niemand hat Push aktiviert");
    return;
  }

  const households = [...new Set(subs.map((s) => s.household_id as string))];
  for (const hh of households) {
    const [{ data: products }, { data: matches }, { data: obs }] = await Promise.all([
      db.from("products").select("id, name, unit").eq("household_id", hh).eq("active", true),
      db.from("offer_matches").select("product_id, confirmed, offers(*)").eq("household_id", hh).or("confirmed.is.null,confirmed.eq.true"),
      db.from("price_observations").select("*").eq("household_id", hh),
    ]);
    const deals: Deal[] = [];
    for (const p of (products ?? []) as { id: string; name: string; unit: BaseUnit }[]) {
      const offers = ((matches ?? []) as unknown as { product_id: string; offers: Offer }[])
        .filter((m) => m.product_id === p.id && m.offers)
        .map((m) => m.offers);
      const a = analyze(p.unit, offers, ((obs ?? []) as (Observation & { product_id: string })[]).filter((o) => o.product_id === p.id), today);
      if (a.isDeal && a.best?.kind === "angebot" && a.saving != null) deals.push({ name: p.name, store: a.best.store_id, saving: a.saving });
    }
    const msg = buildMessage(deals);
    if (!msg) {
      console.log("– Push: diese Woche keine Schnäppchen, keine Nachricht");
      continue;
    }
    let sent = 0;
    for (const s of subs.filter((x) => x.household_id === hh)) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ ...msg, url: "/" }),
          { TTL: 60 * 60 * 24 },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id); // Abo abgelaufen
        else console.log(`   Push an ein Gerät fehlgeschlagen (${code ?? "?"})`);
      }
    }
    console.log(`✓ Push: ${sent} Gerät(e) benachrichtigt – ${msg.title}`);
  }
}
