/* 安心药助手 PWA Service Worker：缓存应用壳，弱网可打开界面 */
const CACHE = 'medguard-h5-v12';
const SHELL = [
  './', './index.html', './css/app.css',
  './js/core.js', './js/pages1.js', './js/pages2.js', './js/app.js',
  './vendor/vue.global.prod.js',
  './manifest.json', './assets/icon-192.png', './assets/icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // API 请求走网络，不缓存（用药数据必须实时）
  if (url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
