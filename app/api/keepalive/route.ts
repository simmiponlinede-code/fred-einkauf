// Täglicher Vercel-Cron (vercel.json): eine kleine Abfrage, damit Supabase Free
// nicht nach 7 Tagen ohne Aktivität pausiert. Vercel schickt CRON_SECRET als Bearer-Token mit.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Nicht erlaubt", { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ ok: false, reason: "Supabase-Variablen fehlen" }, { status: 500 });

  const res = await fetch(`${url}/rest/v1/heartbeat?select=seen_at&id=eq.1`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  return Response.json({ ok: res.ok, status: res.status });
}
