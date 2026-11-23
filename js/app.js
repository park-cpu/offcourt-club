import { h, reportError, flushMount } from './ui.js';
import { startStore, subscribe, settings, state, me } from './store.js';
import { homeView } from './views/home.js';
import { weekView, scheduleView } from './views/schedule.js';
import { playView } from './views/play.js';
import { rankView, profileView, rulesView } from './views/rank.js';
import { meView } from './views/me.js';
import { avatarView, galleryView } from './views/avatar.js';
import { adminView, setupView } from './views/admin.js';
import { loadWeather } from './weather.js';
import { setupApp } from './install.js';
import { membersOnly } from './views/common.js';

const TABS = [
  ['#/', '홈', 'home', ['', 'home']],
  ['#/week', '일정', 'cal', ['week', 's']],
  ['#/play', '경기', 'ball', ['play']],
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
  const PUBLIC = ['', 'home', 'week', 's', 'me'];
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

// 놓친 저장 오류도 화면에 알림
window.addEventListener('unhandledrejection', (e) => reportError(e.reason));

setupApp();
boot();
