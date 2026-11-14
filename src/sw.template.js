/* Anatomy Atlas service worker: makes the app installable and usable offline. */
const VERSION = '__VERSION__';
const SHELL = __SHELL__;
const DATA = __DATA__;
const SHELL_CACHE = 'atlas-shell-' + VERSION;
const DATA_CACHE = 'atlas-data-__DATAVER__';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('atlas-') && k !== SHELL_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isData = url.pathname.includes('/data/geo/') || url.pathname.includes('/data/desc/');
  if (isData) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(async () => (req.mode === 'navigate' ? (await caches.match('index.html')) || Response.error() : Response.error()));
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'data-list') event.source.postMessage({ type: 'data-list', files: DATA });
});
