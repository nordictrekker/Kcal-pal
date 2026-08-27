// kcal pal service worker. Handles web-push notifications/clicks and a
// friendly offline fallback page. The app itself needs the network for
// everything, so navigations stay network-first — the cache only holds the
// offline page (without this, an offline launch of the installed app showed
// the raw browser error page).

const OFFLINE_CACHE = "kcalpal-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Drop old offline caches on version bumps.
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("kcalpal-offline-") && k !== OFFLINE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      ),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  // Only page navigations get the fallback; API/data requests fail as normal
  // so the app never sees stale data.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches
        .match(OFFLINE_URL)
        .then((cached) => cached ?? Response.error()),
    ),
  );
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "kcal pal",
    body: "You have a new notification.",
    url: "/today",
  };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/today" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/today";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      }),
  );
});
