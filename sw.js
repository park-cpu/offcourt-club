// ─────────────────────────────────────────────────────────────
// 서비스 워커 — 홈 화면 앱 설치 + 업데이트 안정화
// · 항상 서버에서 최신 파일을 먼저 확인 (network-first, no-cache)
//   → 업데이트 후 예전/새 파일이 섞이는 문제 방지
// · 인터넷이 끊기면 마지막으로 받은 파일로 열림
// · Firebase · 날씨 · 폰트 등 다른 사이트 요청은 건드리지 않음
// 버전은 app.js가 sw.js?v=버전 으로 등록하면서 정해집니다.
// ─────────────────────────────────────────────────────────────
const VERSION = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = 'offcourt-' + VERSION;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('offcourt-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((hit) => hit || caches.match('./')))
  );
});
