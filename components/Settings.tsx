"use client";
import { useEffect, useState } from "react";
import { deletePushSubscription, savePushSubscription } from "@/lib/data";
import { getTheme, setTheme, type ThemeChoice } from "@/lib/theme";

export function ThemeSetting() {
  // Nur im Browser sichtbar (nach dem Laden der Daten), daher direkt aus dem Gerät lesen
  const [choice, setChoice] = useState<ThemeChoice>(() => (typeof window === "undefined" ? "auto" : getTheme()));
  const pick = (c: ThemeChoice) => {
    setChoice(c);
    setTheme(c);
  };
  return (
    <div className="card setting">
      <span className="grow">
        <b>Aussehen</b>
        <br />
        <span className="note">Automatisch folgt der Einstellung deines Handys.</span>
      </span>
      <div className="seg" role="group" aria-label="Aussehen">
        {(
          [
            ["auto", "Auto"],
            ["light", "☀︎ Hell"],
            ["dark", "☾ Nacht"],
          ] as [ThemeChoice, string][]
        ).map(([c, label]) => (
          <button key={c} aria-pressed={choice === c} onClick={() => pick(c)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function b64ToBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type PushState = "unsupported" | "needs-install" | "no-key" | "off" | "on" | "denied" | "busy";

export function PushSetting({ householdId }: { householdId: string }) {
  const [state, setState] = useState<PushState>("busy");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!VAPID) return setState("no-key");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        // iPhone: Push gibt es nur in der installierten App vom Home-Bildschirm
        const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const standalone = window.matchMedia("(display-mode: standalone)").matches;
        return setState(ios && !standalone ? "needs-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setState("busy");
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID!) }));
      await savePushSubscription(householdId, sub);
      await reg.showNotification("Fred ist bereit", {
        body: "Ab jetzt melde ich mich montags früh mit euren Schnäppchen.",
        icon: "/icon-192.png",
        tag: "fred-test",
      });
      setState("on");
    } catch (e) {
      setMsg(`Hat nicht geklappt: ${e instanceof Error ? e.message : String(e)}`);
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await deletePushSubscription(sub.endpoint).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    setState("off");
  }

  const text: Record<PushState, string> = {
    on: "Aktiv auf diesem Handy. Montags früh kommen eure Schnäppchen.",
    off: "Montags früh eine Nachricht mit den Schnäppchen der Woche.",
    busy: "Einen Moment …",
    denied: "Mitteilungen sind für Fred blockiert. In den Handy-Einstellungen bei Fred erlauben.",
    "needs-install": "Auf dem iPhone geht das nur in der App vom Home-Bildschirm. Öffne Fred dort.",
    unsupported: "Dieser Browser unterstützt keine Push-Nachrichten.",
    "no-key": "Noch nicht eingerichtet: Der öffentliche Push-Schlüssel fehlt in Vercel.",
  };

  return (
    <div className="card setting">
      <span className="grow">
        <b>Push-Nachrichten</b>
        <br />
        <span className="note">{msg ?? text[state]}</span>
      </span>
      {state === "off" && (
        <button className="btn primary" onClick={enable}>
          Aktivieren
        </button>
      )}
      {state === "on" && (
        <button className="btn ghost" onClick={disable}>
          Ausschalten
        </button>
      )}
    </div>
  );
}
