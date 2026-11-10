# Fred · Wocheneinkauf

Eure gemeinsame Einkaufsliste mit Angeboten und Normalpreisen aus Göttingen. Läuft komplett kostenlos auf
**Vercel Hobby**, **Supabase Free** und **GitHub Free**. Keine KI, keine bezahlten APIs.

| Teil | Wo | Kosten |
|---|---|---|
| App (Next.js, PWA) | Vercel Hobby, `*.vercel.app` | 0 € |
| Datenbank, Login, Echtzeit | Supabase Free | 0 € |
| Angebotsimport (montags), Backup (sonntags), Tests | GitHub Actions, privates Repo | 0 € (ca. 30–60 von 2.000 Min./Monat) |
| Bons lesen | im Browser: pdf.js (PDF), Tesseract.js (Foto) | 0 € |

## Einrichtung (einmalig, ca. 20 Minuten)

### 1. Supabase
1. Auf [supabase.com](https://supabase.com) ein Projekt anlegen (Region Frankfurt, Free Plan, keine Kreditkarte nötig).
2. **SQL Editor** öffnen und nacheinander ausführen:
   1. `supabase/migrations/0001_schema.sql`
3. **Authentication → URL Configuration**: „Site URL“ auf eure App-Adresse setzen (z. B. `https://fred-einkauf.vercel.app`) und unter „Redirect URLs“ `https://fred-einkauf.vercel.app/**` hinzufügen. Sonst führen Mails zum Passwort-Zurücksetzen auf `localhost`.
4. **Authentication → Sign In / Providers → Email**: „Allow new users to sign up“ **aus**, „Confirm email“ **aus**.
5. **Authentication → Users → Add user → Create new user**: eure zwei Konten mit E-Mail und Passwort anlegen.
6. Im SQL Editor `supabase/setup_household.sql` öffnen, die zwei E-Mail-Adressen und Namen eintragen, ausführen.
   Die letzte Abfrage muss zwei Zeilen zeigen.
7. Danach `supabase/seed_from_v1.sql` ausführen: übernimmt Produkte, Normalpreise und gelernte Bon-Kürzel aus der ersten Fred-Version.
8. **Project Settings → API**: `Project URL`, den `publishable`-Schlüssel (früher „anon“) und den `secret`-Schlüssel (früher „service_role“) notieren.
   **Database → Connect → Session pooler**: die Verbindungs-URL notieren (für das Backup; GitHub Actions kann die direkte IPv6-Adresse nicht erreichen).

### 2. GitHub
Privates Repo `fred-einkauf` unter eurem persönlichen Konto (nicht unter einer Organisation, sonst verbindet Vercel Hobby es nicht).
Unter **Settings → Secrets and variables → Actions** anlegen:

| Name | Art | Wert |
|---|---|---|
| `SUPABASE_URL` | Secret | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | `secret`-Schlüssel. **Nur hier**, nie in Vercel oder im Code |
| `SUPABASE_DB_URL` | Secret | Session-pooler-URL mit Passwort |
| `KAUFLAND_STORE_URL` | Variable (optional) | Angebotsseite eurer Kaufland-Filiale, falls die Standardseite nicht passt |

Copilot-Code-Review **nicht** einschalten, es verbraucht Actions-Minuten.

### 3. Vercel
1. Mit GitHub bei [vercel.com](https://vercel.com) anmelden (Hobby, keine Kreditkarte).
2. **Add New → Project → `fred-einkauf` importieren**.
3. Umgebungsvariablen:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `publishable`-Schlüssel
   - `CRON_SECRET` = beliebige lange Zufallszeichenkette (schützt den Keep-alive)
4. Deploy. Die App läuft unter `fred-einkauf.vercel.app` (oder ähnlich).
5. Auf dem Handy öffnen → „Zum Home-Bildschirm“. Dann startet Fred wie eine App.

### 4. Erster Import
GitHub → **Actions → Angebote importieren → Run workflow**. Danach unter „Verwalten → Letzte Importe“ nachsehen.

## Wie die Daten reinkommen

- **Angebote:** `scripts/import/` holt montags die Angebotsseiten. Je Markt ein Adapter:
  - Aldi Nord ✅ (bundesweite Angebotsseite)
  - Kaufland ✅ (Übersichtsseite; Filiale beim ersten Lauf prüfen)
  - Lidl, Netto, Edeka ⏳ noch nicht gebaut, siehe `scripts/import/adapters/pending.ts`
  Jeder Adapter prüft `robots.txt`, ruft nur einmal pro Woche ab und meldet „0 Angebote“ als Fehler,
  damit eine umgebaute Seite auffällt. Fehlgeschlagene Läufe zeigt Fred als Hinweis, GitHub schickt eine Mail.
- **Normalpreise:** aus Bons (Tab „Bon“) und von Hand (Tab „Verwalten“).
- **Zuordnung:** Suchwörter je Produkt (`|` = oder, Ausschlusswörter). Bon-Kürzel wie „K.Speisequark“ lernt Fred beim ersten Bestätigen.

## Entwickeln

```bash
npm install
cp .env.example .env.local   # Werte eintragen
npm run dev                  # http://localhost:3000
npm test                     # Preislogik, Bon-Parser, Adapter
npm run import:dry           # Import testen, ohne in die Datenbank zu schreiben
```

## Freigrenzen im Blick

- **Supabase pausiert** nach 7 Tagen ohne Datenbankaktivität. Der tägliche Vercel-Cron (`/api/keepalive`) und der Montagsimport verhindern das.
- **Kein automatisches Backup** bei Supabase Free: `backup.yml` exportiert sonntags; der Export liegt 90 Tage am Workflow-Lauf.
- **Vercel Hobby** ist nur für private, nicht kommerzielle Nutzung. Bilder werden bewusst ohne `next/image` ausgeliefert.
- Bezahlte Dienste (Supabase Pro, Vercel Pro, eigene Domain, KI- oder OCR-APIs) sind nicht eingebaut. Vor jeder Änderung daran: erst besprechen.

