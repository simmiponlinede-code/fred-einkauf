"use client";
// Ziel des Links aus der Mail „Passwort zurücksetzen“. supabase-js liest den Anmeldeschlüssel
// aus der Adresse; danach kann hier ein neues Passwort gesetzt werden.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function NeuesPasswort() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const db = supabase();
    const { data } = db.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) setReady(true);
    });
    db.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    const t = setTimeout(() => setReady((r) => r ?? false), 3000);
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setMsg("Bitte mindestens 8 Zeichen.");
    if (pw !== pw2) return setMsg("Die beiden Passwörter sind nicht gleich.");
    setBusy(true);
    const { error } = await supabase().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setMsg(`Das hat nicht geklappt: ${error.message}`);
    else {
      setMsg("Gespeichert! Fred öffnet gleich eure Liste.");
      setTimeout(() => router.replace("/"), 1200);
    }
  }

  return (
    <main className="wrap">
      <form className="card login" onSubmit={save}>
        <img src="/fred/fred-3-lupe.webp" alt="Fred mit Lupe" width={140} height={140} />
        <h1 style={{ fontSize: 24 }}>
          Neues <span className="grad">Passwort</span>
        </h1>
        {ready === null && <p className="sub">Prüfe den Link aus der Mail …</p>}
        {ready === false && (
          <p className="err">
            Der Link ist abgelaufen oder wurde schon benutzt. Fordere auf der Anmeldeseite über „Passwort vergessen?“ eine neue Mail an.
          </p>
        )}
        {ready && (
          <>
            <input type="password" autoComplete="new-password" placeholder="Neues Passwort" value={pw} onChange={(e) => setPw(e.target.value)} required />
            <input type="password" autoComplete="new-password" placeholder="Nochmal eingeben" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
            <button className="btn primary" disabled={busy}>
              {busy ? "Speichere …" : "Passwort speichern"}
            </button>
          </>
        )}
        {msg && <p className="err">{msg}</p>}
        <a href="/login">Zur Anmeldung</a>
      </form>
    </main>
  );
}
