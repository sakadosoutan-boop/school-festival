const CACHE = "machitime-shell-v6";
const CORE = [
  "./",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./OPERATION_MANUAL.md",
  "./templates/booths-template.csv",
  "./templates/timetable-template.csv",
];

// addAllは1件でも404があると全体が失敗し、オフライン対応が丸ごと無効になる。
// 1件ずつ登録して失敗を握りつぶし、残りのキャッシュは必ず作る。
async function addTolerant(cache, urls) {
  await Promise.allSettled(urls.map((url) => cache.add(url)));
}

async function precache() {
  const cache = await caches.open(CACHE);
  await addTolerant(cache, CORE);
  try {
    const response = await fetch("./", { cache: "no-cache" });
    const html = await response.clone().text();
    await cache.put("./", response);
    const assets = [...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)]
      .map((match) => new URL(match[1], self.registration.scope).href);
    await addTolerant(cache, [...new Set(assets)]);
  } catch {
    // オフラインでインストールされた場合はCOREのキャッシュだけで動かす。
  }
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
