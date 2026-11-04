const CACHE='find-the-space-v1';
const FILES=['./','index.html','three.min.js','three-post.js','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)))});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
/* Newest version when online, saved version when offline */
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{if(r.ok&&new URL(e.request.url).origin===location.origin){const k=r.clone();caches.open(CACHE).then(c=>c.put(e.request,k))}return r}).catch(()=>caches.match(e.request).then(m=>m||caches.match('index.html'))))});
