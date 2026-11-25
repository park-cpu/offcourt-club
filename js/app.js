import { h, reportError, flushMount } from './ui.js';
import { startStore, subscribe, settings, state, me } from './store.js';
import { homeView } from './views/home.js';
import { weekView, scheduleView } from './views/schedule.js';
import { playView } from './views/play.js';
import { rankView, profileView, rulesView } from './views/rank.js';
import { meView } from './views/me.js';
import { analysisView } from './views/analysis.js';
import { avatarView, galleryView } from './views/avatar.js';
import { adminView, setupView } from './views/admin.js';
import { loadWeather } from './weather.js';
import { setupApp } from './install.js';
import { membersOnly } from './views/common.js';
import { rallyView } from './views/rally.js';

const TABS = [
  ['#/', '홈', 'home', ['', 'home', 'rally']],
  ['#/week', '일정', 'cal', ['week', 's']],
  ['#/play', '경기', 'ball', ['play', 'analysis']],
  ['#/rank', '순위', 'rank', ['rank', 'p', 'rules', 'avatars']],
  ['#/me', '내 정보', 'user', ['me', 'admin', 'avatar']],
];

const ICONS = {
  home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="1"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  ball: '<circle cx="12" cy="12" r="8"/><path d="M5.5 7.5c3 1.5 3 7.5 0 9M18.5 7.5c-3 1.5-3 7.5 0 9"/>',
  rank: '<path d="M5 20v-6h4v6M10 20V9h4v11M15 20v-8h4v8M3 20h18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5"/>',
};

const icon = (name) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name];
  return s;
};

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const [head, a, b] = parts;
  if (!settings().adminId && !state.players.length) return ['', setupView()];
  // 로그인하지 않은 방문자는 일정(홈 · 주간 · 일정 상세)만 볼 수 있음
  const PUBLIC = ['', 'home', 'week', 's', 'me', 'rally'];
  if (!me() && !PUBLIC.includes(head)) {
    const tab = TABS.find(([, , , keys]) => keys.includes(head));
    return [head, membersOnly(tab ? tab[1] : '')];
  }
  switch (head) {
    case 'week': return ['week', weekView(a)];
    case 's': return ['s', scheduleView(a)];
    case 'play': return ['play', playView(a, b)];
    case 'rank': return ['rank', rankView(a, b)];
    case 'p': return ['p', profileView(a)];
    case 'rules': return ['rules', rulesView()];
    case 'me': return ['me', meView()];
    case 'avatar': return ['avatar', avatarView(a)];
    case 'avatars': return ['avatars', galleryView()];
    case 'admin': return ['admin', adminView(a)];
    case 'rally': return ['rally', rallyView()];
    case 'analysis': return ['analysis', analysisView(a, b)];
    default: return ['', homeView()];
  }
}

let lastHash = null;
function render() {
  const main = document.getElementById('main');
  const [key, view] = route();
  const y = window.scrollY;
  main.replaceChildren(view);
  flushMount();
  // 같은 화면 갱신이면 스크롤 유지, 화면 이동이면 맨 위로
  window.scrollTo(0, location.hash === lastHash ? y : 0);
  lastHash = location.hash;
  const nav = document.getElementById('tabbar');
  nav.replaceChildren(
    ...TABS.map(([href, label, ic, keys]) =>
      h('a', { href, class: keys.includes(key) ? 'on' : '', 'aria-current': keys.includes(key) ? 'page' : null }, icon(ic), h('span', {}, label))
    )
  );
}

async function boot() {
  try {
    await startStore();
  } catch (e) {
    document.getElementById('main').replaceChildren(
      h('div', { class: 'page' }, h('div', { class: 'empty' }, h('p', {}, '서버에 연결하지 못했어요.'), h('p', { class: 'muted small' }, String(e.message || e)), h('button', { class: 'btn primary', onclick: () => location.reload() }, '다시 시도')))
    );
    return;
  }
  subscribe(render);
  window.addEventListener('hashchange', render);
  window.addEventListener('rerender', render);
  render();
  loadWeather();
  // 앱을 오래 켜두면 1시간마다 예보 갱신
  setInterval(loadWeather, 30 * 60 * 1000);
}

// 앱 전체: 확대(두 손가락 · 두 번 탭) 막기, 오래 눌러도 글자 선택 안 됨 (입력칸 제외)
(() => {
  const opt = { passive: false };
  const stop = (e) => e.preventDefault();
  const isInput = (t) => !!t?.closest?.('input, textarea, [contenteditable]');
  document.addEventListener('gesturestart', stop, opt);
  document.addEventListener('gesturechange', stop, opt);
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, opt);
  // 두 번 탭 확대는 CSS touch-action으로 막음 (빠른 연타 버튼이 씹히지 않게)
  document.addEventListener('selectstart', (e) => { if (!isInput(e.target)) e.preventDefault(); }, opt);
})();

// 당겨서 새로고침 (v1.13.0~): 맨 위에서 아래로 끌어당기면 앱 전체를 다시 불러옴
// 랠리 게임 · 그림(캔버스) · 열린 창(시트) 위에서는 동작하지 않음
(() => {
  const READY = 64;
  // 최신 파일로 다시 불러오기 (install.js의 hardReload와 같은 내용 — 일부러 import 안 함)
  const hardReload = async () => {
    const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
    const urls = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((u) => u.startsWith(location.origin) && /\/(js|css)\//.test(u));
    urls.push(new URL('js/version.js', location.href).href);
    await Promise.race([
      Promise.all([...urls.map((u) => fetch(u, { cache: 'reload' }).catch(() => {})), reg?.update().catch(() => {})]),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    location.reload();
  };
  const ind = h('div', { class: 'ptr', 'aria-hidden': 'true' }, h('span', {}, '↻'));
  document.body.append(ind);
  let y0 = null;
  let pull = 0;
  const skip = (t) => location.hash.startsWith('#/rally') || document.querySelector('.sheet-wrap') || t?.closest?.('canvas, input, textarea, select, .stage-wrap');
  const show = (v) => {
    pull = v;
    ind.style.transform = `translate(-50%, ${Math.round(v - 48)}px) rotate(${Math.round(v * 4)}deg)`;
    ind.style.opacity = v > 4 ? Math.min(1, v / READY) : 0;
    ind.classList.toggle('ready', v >= READY);
  };
  const reset = () => {
    y0 = null;
    ind.classList.add('back');
    show(0);
    setTimeout(() => ind.classList.remove('back'), 200);
  };
  document.addEventListener('touchstart', (e) => {
    y0 = e.touches.length === 1 && window.scrollY <= 0 && !skip(e.target) ? e.touches[0].clientY : null;
    pull = 0;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    if (e.touches.length > 1 || window.scrollY > 0) return reset();
    const dy = e.touches[0].clientY - y0;
    show(dy > 0 ? Math.min(dy * 0.5, 100) : 0);
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (y0 == null) return;
    if (pull >= READY) {
      y0 = null;
      ind.classList.add('spin');
      hardReload();
    } else reset();
  });
  document.addEventListener('touchcancel', () => y0 != null && reset());
})();

// 놓친 저장 오류도 화면에 알림
window.addEventListener('unhandledrejection', (e) => reportError(e.reason));

setupApp();
boot();
