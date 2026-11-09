import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Öffentliche Werte aus Supabase → Project Settings → API. Der "publishable"/"anon"-Schlüssel
// darf in den Browser; alle Daten schützt Row Level Security. Den Service-Schlüssel NIE hier eintragen.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlen (.env.local bzw. Vercel).");
  client ??= createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "fred-auth" },
  });
  return client;
}
