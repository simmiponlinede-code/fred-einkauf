// Fred Service Worker: hält die App-Hülle und Fred-Bilder offline bereit.
// Supabase-Anfragen gehen immer ins Netz, damit Preise und Liste aktuell sind.
const CACHE = "fred-v2";
const SHELL = ["/", "/login", "/icon-192.png", "/fred/fred-1-begruessung.webp", "/fred/fred-8-profilbild.webp"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Seiten: erst Netz, bei Funkloch im Laden aus dem Cache
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Statische Dateien: erst Cache, dann Netz
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fred/") || url.pathname.endsWith(".png")) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          }),
      ),
    );
  }
});

// Push vom Montags-Import
self.addEventListener("push", (e) => {
  let d = { title: "Fred", body: "Neue Angebote sind da.", url: "/" };
  try {
    d = { ...d, ...e.data.json() };
  } catch {
    /* Text statt JSON */
  }
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "fred-weekly",
      data: { url: d.url },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.navigate(url).then((w) => (w || c).focus());
      return self.clients.openWindow(url);
    }),
  );
});
