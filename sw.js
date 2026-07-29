/* Suite Bajo — service worker: app shell precacheada + lecciones en caché al visitarlas. */
const CACHE = 'suite-bajo-v20'; // subir la versión en cada release: invalida el caché viejo
const SHELL = [
  '.', 'index.html', 'manifest.json',
  'css/app.css', 'js/app.js', 'js/sync.js', 'js/audio.js', 'js/pitch.js', 'js/oido.js', 'js/vendor/supabase.js', 'js/entrenar.js', 'js/ensayo.js', 'js/show.js',
  'lessons/index.json', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* cache-first con relleno: lo visto una vez (teoría, diagramas, audios) queda offline */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
      }
      return res;
    }).catch(() => hit))
  );
});
