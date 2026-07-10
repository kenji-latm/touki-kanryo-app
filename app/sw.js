// オフライン用キャッシュ（http(s)配信時のみ有効）。Phase 2bで通知(push)処理を追加予定。
const CACHE_PREFIX = "touki-kanryo-";
const CACHE = "touki-kanryo-v16-agetena-icon";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=20260710-agetena-icon",
  "./app.js?v=20260710-agetena-icon",
  "./shared-config.js?v=20260710-agetena-icon",
  "./data/kanryo-integrity.js",
  "./data/kanryo.js",
  "./data/kanryo.json",
  "./manifest.webmanifest?v=20260710-agetena-icon",
  "./apple-touch-icon.png?v=20260710-agetena-icon",
  "./icon-192.png?v=20260710-agetena-icon",
  "./icon-512.png?v=20260710-agetena-icon",
  "./icon.svg?v=20260710-agetena-icon",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const isData = /\/data\/kanryo(?:-integrity)?\.(json|js)$/.test(url.pathname);
  const isPage = e.request.mode === "navigate";

  // 最新データはネットワーク優先。失敗時は最後にキャッシュできたデータへ戻る。
  if (isData) {
    const cacheKey = new Request(`${url.origin}${url.pathname}`);
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(cacheKey, res.clone()));
          return res;
        })
        .catch(() => caches.match(cacheKey))
    );
    return;
  }

  if (isPage) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
