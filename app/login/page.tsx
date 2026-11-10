"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function forgot() {
    if (!email.trim()) return setError("Trag oben zuerst deine E-Mail-Adresse ein.");
    setBusy(true);
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/passwort`,
    });
    setBusy(false);
    // Supabase Free verschickt nur wenige Mails pro Stunde
    setError(
      error
        ? /rate|limit/i.test(error.message)
          ? "Gerade wurden zu viele Mails verschickt. Bitte in einer Stunde nochmal versuchen."
          : `Mail konnte nicht verschickt werden: ${error.message}`
        : "Mail ist unterwegs. Tippe auf den Link darin, dann kannst du ein neues Passwort setzen.",
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
      if (!error) {
        // nach der Anmeldung zurück, z. B. zur Einrichtung unter /import (nur interne Pfade)
        const next = new URLSearchParams(window.location.search).get("next");
        router.replace(next && /^\/[a-z]/.test(next) && !next.startsWith("//") ? next : "/");
        return;
      }
      const code = (error as { code?: string }).code ?? "";
      if (code === "email_not_confirmed" || /not confirmed/i.test(error.message))
        setError("Dein Konto ist noch nicht bestätigt. In Supabase beim Konto „Confirm email“ wählen oder es mit Haken bei „Auto Confirm User“ neu anlegen.");
      else if (code === "invalid_credentials" || /invalid login/i.test(error.message))
        setError("E-Mail oder Passwort stimmen nicht. Groß- und Kleinschreibung beim Passwort beachten.");
      else setError(`Anmeldung fehlgeschlagen: ${error.message}`);
    } catch (e) {
      setError(`Fred erreicht Supabase nicht: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <form className="card login" onSubmit={submit}>
        <img src="/fred/fred-1-begruessung.webp" alt="Fred, der Dachs, winkt" width={140} height={140} />
        <h1 style={{ fontSize: 26 }}>
          Hallo! <span className="grad">Ich bin Fred.</span>
        </h1>
        <p className="sub">Meldet euch mit eurem Konto an. Neue Konten legt ihr im Supabase-Dashboard an.</p>
        <input type="email" autoComplete="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="err">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? "Melde an …" : "Anmelden"}
        </button>
        <button type="button" className="btn ghost" onClick={forgot} disabled={busy}>
          Passwort vergessen?
        </button>
      </form>
    </main>
  );
}
