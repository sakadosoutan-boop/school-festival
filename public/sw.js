const CACHE = "machitime-shell-v5";
const CORE = ["./", "./manifest.webmanifest", "./icon.svg", "./OPERATION_MANUAL.md", "./templates/booths-template.csv", "./templates/timetable-template.csv"];

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(CORE);
  const response = await fetch("./", { cache: "no-cache" });
  const html = await response.clone().text();
  await cache.put("./", response);
  const assets = [...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)]
    .map((match) => new URL(match[1], self.registration.scope).href);
  if (assets.length > 0) await cache.addAll([...new Set(assets)]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          const shell = await caches.match("./");
          if (shell) return shell;
        }
        return new Response("オフラインです。通信を確認して再読み込みしてください。", {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }),
  );
});
