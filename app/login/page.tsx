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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
      if (!error) {
        router.replace("/");
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
      </form>
    </main>
  );
}
