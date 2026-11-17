/* Passport to More Book: keeps the app working with no signal. Bump CACHE on every change. */
var CACHE = 'p2m-book-v1';
var SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './data.enc.json',
  './fonts/cg700.woff2', './fonts/cg600i.woff2', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
  './qr/kit.png', './qr/talk.png', './qr/contact.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
/* Network first, so a new upload shows up right away; fall back to the saved copy when offline. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('./index.html'); });
    })
  );
});
