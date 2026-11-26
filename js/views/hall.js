// ─────────────────────────────────────────────────────────────
// 홈 아래 '명예의 전당' (v1.24.0~)
//   주간 · 월간을 골라 ‹ › 로 지난 기간도 보고, 항목(연승왕 · 출석왕 …)은 좌우로 넘김
//   모두 경기 · 출석 기록에서 매번 계산 (저장 안 함). 게스트 낀 경기 · 친선전은 '최다 경기'에만 셈
// ─────────────────────────────────────────────────────────────
import { h, onMount } from '../ui.js';
import { state, derived, playersMap, activePlayers, me, weekStart, addDays, ymd, parseYmd } from '../store.js';
import { computeStats, coinStake, winnerSide } from '../rules.js';
import { withPlaces } from './rank.js';

// 화면이 다시 그려져도 보던 기간 · 항목 유지
const view = { unit: 'week', offset: 0, index: 0 };

function rangeOf(t) {
  if (view.unit === 'week') {
    const start = addDays(weekStart(t), view.offset * 7);
    const end = addDays(start, 6);
    const [a, b] = [parseYmd(start), parseYmd(end)];
    const lab = view.offset === 0 ? '이번 주' : view.offset === -1 ? '지난주' : `${a.getMonth() + 1}.${a.getDate()} – ${b.getMonth() + 1}.${b.getDate()}`;
    return { start, end, label: lab };
  }
  const d = parseYmd(t);
  const first = new Date(d.getFullYear(), d.getMonth() + view.offset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const lab = view.offset === 0 ? '이번 달' : `${first.getFullYear()}년 ${first.getMonth() + 1}월`;
  return { start: ymd(first), end: ymd(last), label: lab };
}

// 항목별 [회원 id, 값] 목록. 값이 클수록 위
function categories(range) {
  const players = playersMap();
  const active = new Set(activePlayers().map((p) => p.id));
  const inR = (date) => date >= range.start && date <= range.end;
  const { deltas } = derived();
  // 실제 레이팅 변동(deltas)을 넘기면 적응 기간 경기도 모두 셈
  const st = computeStats(players, state.matches, deltas, range);
  const coin = computeStats(players, state.matches, deltas, range, 'coin');
  const from = (fn) => [...st.entries()].map(([id, s]) => [id, fn(s, id)]);

  const attend = new Map();
  for (const a of state.attendance) if (a.arrived && !a.isGuest && inR(a.date || '')) attend.set(a.playerId, (attend.get(a.playerId) || 0) + 1);
  // 친선전 · 게스트 경기까지 모든 끝난 경기
  const played = new Map();
  const bagel = new Map();
  for (const m of state.matches) {
    if (m.status !== 'done' || !inR(m.date || '')) continue;
    [...m.teamA, ...m.teamB].forEach((id) => played.set(id, (played.get(id) || 0) + 1));
    const w = winnerSide(m);
    if (w && m.type !== 'friendly' && coinStake(m) === 2) (w === 'A' ? m.teamA : m.teamB).forEach((id) => bagel.set(id, (bagel.get(id) || 0) + 1));
  }
  const ofMap = (mp) => [...mp.entries()];

  return [
    { key: 'streak', icon: '🔥', name: '연승왕', rows: from((s) => s.best), fmt: (v) => `${v}연승`, min: 2 },
    { key: 'attend', icon: '📅', name: '출석왕', rows: ofMap(attend), fmt: (v) => `${v}회` },
    { key: 'played', icon: '🎾', name: '최다 경기', rows: ofMap(played), fmt: (v) => `${v}경기` },
    { key: 'wins', icon: '🏆', name: '다승왕', rows: from((s) => s.wins), fmt: (v) => `${v}승` },
    { key: 'rise', icon: '📈', name: '레이팅 급상승', rows: from((s) => Math.round(s.sp - s.games)), fmt: (v) => `+${v}` },
    { key: 'bagel', icon: '🥯', name: '베이글 메이커', rows: ofMap(bagel), fmt: (v) => `${v}회` },
    { key: 'coin', icon: '🪙', name: '코인 사냥꾼', rows: [...coin.entries()].map(([id, s]) => [id, s.coins]), fmt: (v) => `+${v}` },
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

const MEDAL = ['🥇', '🥈', '🥉'];

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
                h('span', { class: 'hall-medal' }, MEDAL[r.place - 1]),
                h('a', { href: `#/p/${r.id}` }, r.name),
                h('span', { class: 'hall-v' }, c.fmt(r.v))
              )
            ),
            c.more > 0 && h('li', { class: 'hall-extra' }, `공동 순위 외 ${c.more}명`)
          )
        : h('p', { class: 'hall-empty' }, '아직 기록이 없어요')
    );

  const index = Math.min(view.index, cats.length - 1);
  const dots = h('div', { class: 'dots hall-dots' }, cats.map((_, i) => h('span', { class: i === index ? 'on' : '' })));
  const track = h('div', { class: 'carousel hall-track' }, cats.map(card));
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
      h('p', { class: 'hall-head' }, '👑 명예의 전당'),
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
      h('span', {}, range.label, view.offset === 0 && h('small', {}, ' · 진행 중')),
      h('button', { class: 'icon-btn', onclick: () => move(1), disabled: view.offset === 0, 'aria-label': '다음 기간' }, '›')
    ),
    track,
    dots,
    h('a', { class: 'hall-more', href: '#/rank' }, '전체 순위 자세히 보기 ›')
  );
}

export const _hall = { rangeOf, categories, view };
