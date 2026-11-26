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
import { featureOn } from './features.js';

const TABS = [
  ['#/', '홈', 'home', ['', 'home', 'rally']],
  ['#/week', '일정', 'cal', ['week', 's']],
  ['#/play', '경기', 'ball', ['play', 'analysis']],
  ['#/rank', '순위', 'rank', ['rank', 'p', 'rules']],
  ['#/me', '내 정보', 'user', ['me', 'admin', 'avatar', 'avatars']],
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
    // 영상 분석은 숨김 중이면 관리자만 (v1.19.0~, js/features.js)
    case 'analysis': return featureOn('analysis', true) ? ['analysis', analysisView(a, b)] : ['', homeView()];
    default: return ['', homeView()];
  }
}

// ── 뒤로 가기 · 아래 탭 (v1.23.0~) ─────────────────────
// 여러 곳에서 들어오는 화면(FLOAT)은 '‹ 뒤로'가 들어온 곳으로 가고, 아래 탭도 들어온 쪽 탭에 불이 들어옴
//   예) 내 정보 → 회원 아바타 구경: '‹ 내 정보' + 내 정보 탭 / 홈 카드 → 일정 상세: '‹ 홈' + 홈 탭
// 바로 열었을 때(새로고침 · 공유 링크)는 각 화면의 기본값 그대로
const FLOAT = ['s', 'p', 'rules', 'avatars', 'avatar'];
const PLACE = { '': '홈', home: '홈', week: '주간 일정', s: '일정', play: '경기', rank: '순위', p: '회원', me: '내 정보', avatar: '아바타', avatars: '아바타 구경', admin: '관리자', rules: '점수 규칙', rally: '랠리 게임', analysis: '영상 분석' };
const headOf = (hs) => (hs || '').replace(/^#\/?/, '').split('/')[0];
// 회원 페이지로 돌아갈 땐 그 회원 이름 ('‹ 한도윤')
const backLabel = (hs) => (headOf(hs) === 'p' ? state.players.find((x) => x.id === hs.split('/')[2])?.name : null) || PLACE[headOf(hs)] || '뒤로';
let trail = []; // 지나온 화면 (탭 화면에서 다시 시작)
function track() {
  const H = location.hash || '#/';
  if (trail[trail.length - 1] === H) return;
  const head = headOf(H);
  if (!FLOAT.includes(head)) trail = [H];
  else if (trail.length >= 2 && trail[trail.length - 2] === H) trail.pop(); // 뒤로 감
  else if (trail.length && headOf(trail[trail.length - 1]) === head && head !== 'p') trail[trail.length - 1] = H; // 같은 화면 안 탭 이동
  else trail.push(H);
  const prev = trail.length >= 2 ? trail[trail.length - 2] : null;
  try {
    if (prev) sessionStorage.setItem('oc-back', JSON.stringify({ for: H, hash: prev, label: backLabel(prev) }));
    else sessionStorage.removeItem('oc-back');
  } catch {}
}

let lastHash = null;
function render() {
  const main = document.getElementById('main');
  track();
  const [key, view] = route();
  const y = window.scrollY;
  main.replaceChildren(view);
  flushMount();
  // 같은 화면 갱신이면 스크롤 유지, 화면 이동이면 맨 위로
  window.scrollTo(0, location.hash === lastHash ? y : 0);
  lastHash = location.hash;
  const tabKey = FLOAT.includes(key) && trail.length >= 2 ? headOf(trail[0]) : key;
  const nav = document.getElementById('tabbar');
  nav.replaceChildren(
    ...TABS.map(([href, label, ic, keys]) => {
      const on = keys.includes(tabKey);
      return h('a', { href, class: on ? 'on' : '', 'aria-current': on ? 'page' : null }, icon(ic), h('span', {}, label));
    })
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
  // 화살표 대신 테니스공 (v1.25.2~): 당기면 공이 굴러 내려오고, 새로고침 중엔 그 자리에서 띵띵 튐
  const ind = h('div', { class: 'ptr', 'aria-hidden': 'true' });
  ind.innerHTML =
    '<i class="ptr-shadow"></i><span class="ptr-ball"><svg viewBox="-16 -16 32 32" width="30" height="30">' +
    '<circle r="14"/><path d="M-9 -10.5Q0 0 -9 10.5M9 -10.5Q0 0 9 10.5"/></svg></span>';
  document.body.append(ind);
  const ballEl = ind.querySelector('.ptr-ball svg');
  let y0 = null;
  let pull = 0;
  const skip = (t) => location.hash.startsWith('#/rally') || document.querySelector('.sheet-wrap') || t?.closest?.('canvas, input, textarea, select, .stage-wrap');
  const show = (v) => {
    pull = v;
    ind.style.transform = `translate(-50%, ${Math.round(v - 56)}px)`;
    ind.style.opacity = v > 4 ? Math.min(1, v / READY) : 0;
    ballEl.style.transform = `rotate(${Math.round(v * 6)}deg)`;
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
      ballEl.style.transform = '';
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
