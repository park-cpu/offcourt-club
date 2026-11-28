// ─────────────────────────────────────────────────────────────
// 홈 아래 '명예의 전당' (v1.24.0~)
//   주간 · 월간을 골라 ‹ › 로 지난 기간도 보고, 항목(연승왕 · 출석왕 …)은 좌우로 넘김
//   모두 경기 · 출석 기록에서 매번 계산 (저장 안 함). 항목 = 연승왕 · 다승왕 · 레이팅 급상승 · 출석왕 (v1.24.1~, 순서 v1.29.1~)
// ─────────────────────────────────────────────────────────────
import { h, onMount } from '../ui.js';
import { state, derived, playersMap, activePlayers, me, weekStart, addDays, ymd, parseYmd } from '../store.js';
import { computeStats } from '../rules.js';
import { withPlaces } from './rank.js';

// 화면이 다시 그려져도 보던 기간 · 항목 유지
const view = { unit: 'week', offset: 0, index: 0 };

function rangeOf(t) {
  if (view.unit === 'week') {
    const start = addDays(weekStart(t), view.offset * 7);
    const end = addDays(start, 6);
    // '11월 첫째주' — 주(월~일)의 목요일이 든 달 기준 (v1.25.4~ 실제 날짜로 표기)
    const thu = parseYmd(addDays(start, 3));
    const nth = ['첫째', '둘째', '셋째', '넷째', '다섯째'][Math.ceil(thu.getDate() / 7) - 1];
    return { start, end, label: `${thu.getMonth() + 1}월 ${nth}주` };
  }
  const d = parseYmd(t);
  const first = new Date(d.getFullYear(), d.getMonth() + view.offset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return { start: ymd(first), end: ymd(last), label: `${first.getFullYear()}년 ${first.getMonth() + 1}월` };
}

// 항목별 [회원 id, 값] 목록. 값이 클수록 위
function categories(range) {
  const players = playersMap();
  const active = new Set(activePlayers().map((p) => p.id));
  const inR = (date) => date >= range.start && date <= range.end;
  const { deltas } = derived();
  // 실제 레이팅 변동(deltas)을 넘기면 적응 기간 경기도 모두 셈
  const st = computeStats(players, state.matches, deltas, range);
  const from = (fn) => [...st.entries()].map(([id, s]) => [id, fn(s, id)]);

  const attend = new Map();
  for (const a of state.attendance) if (a.arrived && !a.isGuest && inR(a.date || '')) attend.set(a.playerId, (attend.get(a.playerId) || 0) + 1);
  const ofMap = (mp) => [...mp.entries()];

  return [
    { key: 'streak', icon: '🔥', name: '연승왕', rows: from((s) => s.best), fmt: (v) => `${v}연승`, min: 2 },
    { key: 'wins', icon: '🏆', name: '다승왕', rows: from((s) => s.wins), fmt: (v) => `${v}승` },
    { key: 'rise', icon: '📈', name: '레이팅 급상승', rows: from((s) => Math.round(s.sp - s.games)), fmt: (v) => `+${v}` },
    { key: 'attend', icon: '📅', name: '출석왕', rows: ofMap(attend), fmt: (v) => `${v}회` },
  ].map((c) => {
    const rows = c.rows
      .filter(([id, v]) => active.has(id) && v >= (c.min || 1))
      .map(([id, v]) => ({ id, v, name: players.get(id)?.name || '' }))
      .sort((a, b) => b.v - a.v || a.name.localeCompare(b.name, 'ko'));
    // 같은 값이면 같은 등수 → 3등 안 사람 중 3명만 보이고 나머지는 '외 N명'
    const inTop = withPlaces(rows, (r) => r.v).filter((r) => r.place <= 3);
    return { ...c, top: inTop.slice(0, 3), more: inTop.length - 3 };
  });
}

export function hallBlock(t) {
  const range = rangeOf(t);
  const cats = categories(range);
  const u = me();
  const rerender = () => window.dispatchEvent(new Event('rerender'));
  const setUnit = (unit) => {
    if (view.unit === unit) return;
    Object.assign(view, { unit, offset: 0 });
    rerender();
  };
  const move = (d) => {
    view.offset = Math.min(0, view.offset + d);
    rerender();
  };

  const card = (c) =>
    h(
      'div',
      { class: 'hall-card' },
      h('p', { class: 'hall-title' }, h('span', {}, c.icon), c.name),
      c.top.length
        ? h(
            'ol',
            { class: 'hall-list' },
            c.top.map((r) =>
              h(
                'li',
                { class: 'hall-row p' + r.place + (u && r.id === u.id ? ' me' : '') },
                h('span', { class: 'hall-place' }, r.place),
                h('a', { href: `#/p/${r.id}` }, r.name),
                h('span', { class: 'hall-v' }, c.fmt(r.v))
              )
            ),
            c.more > 0 && h('li', { class: 'hall-extra' }, `공동 순위 외 ${c.more}명`)
          )
        : h('p', { class: 'hall-empty' }, '아직 기록이 없어요')
    );

  const index = Math.min(view.index, cats.length - 1);
  const dots = h('div', { class: 'dots' }, cats.map((_, i) => h('span', { class: i === index ? 'on' : '' })));
  const track = h('div', { class: 'carousel multi hall-track' }, cats.map(card));
  track.addEventListener(
    'scroll',
    () => {
      const w = track.firstElementChild?.offsetWidth || 1;
      const i = Math.max(0, Math.min(cats.length - 1, Math.round(track.scrollLeft / (w + 10))));
      if (i === view.index) return;
      view.index = i;
      [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    },
    { passive: true }
  );
  onMount(() => {
    const el = track.children[index];
    if (el) track.scrollLeft = el.offsetLeft - track.firstElementChild.offsetLeft;
  });
  [...dots.children].forEach((d, i) =>
    d.addEventListener('click', () => {
      const el = track.children[i];
      if (el) track.scrollTo({ left: el.offsetLeft - track.firstElementChild.offsetLeft, behavior: 'smooth' });
    })
  );

  return h(
    'section',
    { class: 'block hall' },
    h(
      'div',
      { class: 'row between' },
      h('h2', { class: 'hall-head' }, '명예의 전당'),
      h(
        'div',
        { class: 'hall-unit' },
        h('button', { class: view.unit === 'week' ? 'on' : '', onclick: () => setUnit('week') }, '주간'),
        h('button', { class: view.unit === 'month' ? 'on' : '', onclick: () => setUnit('month') }, '월간')
      )
    ),
    h(
      'div',
      { class: 'hall-nav' },
      h('button', { class: 'icon-btn', onclick: () => move(-1), 'aria-label': '이전 기간' }, '‹'),
      h('span', {}, range.label),
      h('button', { class: 'icon-btn', onclick: () => move(1), disabled: view.offset === 0, 'aria-label': '다음 기간' }, '›')
    ),
    track,
    // 점 왼쪽 · '전체 순위 보기' 오른쪽 한 줄 (v1.24.8~ 이번 주 매치와 같게)
    h('div', { class: 'sessions-foot' }, dots, h('a', { class: 'link small', href: '#/rank' }, '전체 순위 보기 ›'))
  );
}

export const _hall = { rangeOf, categories, view };
