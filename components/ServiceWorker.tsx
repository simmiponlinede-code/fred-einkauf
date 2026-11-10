"use client";
import { useEffect } from "react";
import { applyTheme } from "@/lib/theme";

export default function ServiceWorker() {
  // Automatischer Nachtmodus folgt der Handy-Einstellung
  useEffect(() => {
    applyTheme();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
