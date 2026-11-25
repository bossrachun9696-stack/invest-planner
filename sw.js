// แผนลงทุน · service worker: ติดตั้งเป็นแอป + เปิดได้ตอนเน็ตไม่ดี
// เฉพาะไฟล์ของเว็บนี้ (network-first รอ 4 วิ แล้วใช้ cache) · ไม่เก็บ Supabase / ราคาสด / CDN
const VERSION = 'ivp-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/ivp-192.png', 'icons/ivp-512.png', 'icons/favicon-32.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ivp-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    try {
      const r = await Promise.race([fetch(e.request), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
      if (r && r.ok) c.put(e.request, r.clone());
      return r;
    } catch (err) {
      return (await c.match(e.request)) || (await c.match('index.html')) || Response.error();
    }
  })());
});
