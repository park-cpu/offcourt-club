import { h, fmtShortRange, onMount } from '../ui.js';
import { state, me, today, attendanceOf, rosterOf, capacityOf, countText, derived, currentSeason, seasonStats, courtsOf, dowOf, parseYmd, weekStart, addDays } from '../store.js';
import { toggleRsvp } from './schedule.js';
import { weatherChip } from '../weather.js';
import { rankList } from './rank.js';

export function homeView() {
  const t = today();
  const u = me();
  const season = currentSeason();

  // 상단: 얇은 브랜드 바 (로고 비중 축소)
  const hero = h(
    'header',
    { class: 'home-bar' },
    h('img', { class: 'wordmark-img', src: 'assets/wordmark.png', alt: 'Offcourt' }),
    h('div', { class: 'home-bar-meta' }, h('strong', {}, season ? season.name : 'Season —'), h('span', {}, u ? `${u.name}님` : h('a', { href: '#/me' }, '로그인 ›')))
  );

  const sessions = sessionsBlock(t, u);

  // 내 현황: 코인 · 공식전 순위 · 공식전 전적 · 레이팅 한 줄
  let mineCard = null;
  const ranks = season ? rankList(season) : null;
  if (u) {
    const { coins, ratings } = derived();
    const st = season ? seasonStats(season, 'official').get(u.id) : null;
    const pos = ranks ? ranks.ranked.findIndex((r) => r.id === u.id) : -1;
    mineCard = h(
      'a',
      { class: 'block stats4', href: `#/p/${u.id}` },
      stat('코인', coins.bal.get(u.id) ?? 0, (coins.bal.get(u.id) ?? 0) <= 0 ? 'warn' : ''),
      stat('공식전 순위', pos >= 0 ? `${pos + 1}위` : '-'),
      stat('공식전 전적', st && st.games ? `${st.wins}-${st.losses}` : '-'),
      stat('레이팅', Math.round(ratings.get(u.id) || 0))
    );
  }

  // 시즌 Top 3: 가로 3칸
  const top = ranks && u ? ranks.ranked.slice(0, 3) : [];
  const podium =
    top.length > 0 &&
    h(
      'section',
      { class: 'block podium' },
      h('div', { class: 'row between' }, h('p', { class: 'eyebrow' }, `${season.name} 공식전 Top 3`), h('a', { class: 'small link', href: '#/rank' }, '전체 순위 ›')),
      h(
        'div',
        { class: 'podium-cols' },
        top.map((r, i) =>
          h('a', { class: 'podium-col' + (u && r.id === u.id ? ' me' : ''), href: `#/p/${r.id}` }, h('span', { class: 'rank-num' }, i + 1), h('strong', {}, r.name), h('span', { class: 'muted small' }, `${Math.round(r.sp)} pt`))
        )
      )
    );

  const game = h('a', { class: 'game-banner', href: '#/rally' }, h('span', { class: 'game-px' }, 'RALLY'), h('span', {}, h('strong', {}, '랠리 게임'), h('small', {}, '타이밍 · 힘 · 방향으로 혼자 랠리 연습')), h('span', { class: 'muted' }, '›'));
  return h('div', { class: 'page' }, hero, sessions, mineCard, podium, game);
}

const stat = (label, value, cls = '') => h('div', { class: 'stat ' + cls }, h('span', { class: 'stat-v' }, value), h('span', { class: 'stat-l' }, label));

// ── 주간 일정 카드 (좌우로 넘기기) ─────────────────────
// 화면이 다시 그려져도 보던 주·카드 위치를 유지
const view = { offset: 0, index: null, key: '' };

function sessionsBlock(t, u) {
  const start = addDays(weekStart(t), view.offset * 7);
  const end = addDays(start, 6);
  const list = state.schedules
    .filter((s) => s.date >= start && s.date <= end)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const label = view.offset === 0 ? '이번 주' : view.offset === 1 ? '다음 주' : `${view.offset}주 뒤`;
  const setOffset = (n) => {
    view.offset = n;
    view.index = null;
    window.dispatchEvent(new Event('rerender'));
  };
  const head = h(
    'div',
    { class: 'row between' },
    h('p', { class: 'eyebrow' }, `${label} · ${fmtShortRange(start, end)}`),
    view.offset > 0 && h('button', { class: 'link small', onclick: () => setOffset(0) }, '‹ 이번 주')
  );

  if (!list.length) {
    return h(
      'section',
      { class: 'block' },
      head,
      h('p', { class: 'big-muted' }, view.offset === 0 ? '이번주 일정은 없습니다' : `${label} 일정은 없습니다`),
      h(
        'div',
        { class: 'row gap' },
        h('button', { class: 'btn primary grow', onclick: () => setOffset(view.offset + 1) }, view.offset === 0 ? '다음주 일정 보기' : '그다음 주 보기'),
        h('a', { class: 'btn ghost', href: `#/week/${start}` }, '일정 등록')
      )
    );
  }

  // 처음엔 오늘 이후 첫 일정부터 보여줌 (모두 지났으면 마지막)
  const key = view.offset + ':' + list.map((s) => s.id).join(',');
  if (view.index == null || view.key !== key) {
    const firstUpcoming = list.findIndex((s) => s.date >= t);
    view.index = firstUpcoming >= 0 ? firstUpcoming : list.length - 1;
    view.key = key;
  }

  const dots = h('div', { class: 'dots' }, list.map((_, i) => h('span', { class: i === view.index ? 'on' : '' })));
  const counter = h('span', { class: 'muted small' }, `${view.index + 1} / ${list.length}`);
  const track = h('div', { class: 'carousel' + (list.length > 1 ? ' multi' : '') }, list.map((s) => slide(s, t, u)));
  const update = () => {
    const w = track.firstElementChild?.offsetWidth || 1;
    const i = Math.max(0, Math.min(list.length - 1, Math.round(track.scrollLeft / (w + 10))));
    if (i === view.index) return;
    view.index = i;
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    counter.textContent = `${i + 1} / ${list.length}`;
  };
  track.addEventListener('scroll', update, { passive: true });
  // 그려진 뒤 보던 카드로 이동
  onMount(() => {
    const el = track.children[view.index];
    if (el) track.scrollLeft = el.offsetLeft - track.firstElementChild.offsetLeft;
  });
  const go = (d) => {
    const el = track.children[Math.max(0, Math.min(list.length - 1, view.index + d))];
    if (el) track.scrollTo({ left: el.offsetLeft - track.firstElementChild.offsetLeft, behavior: 'smooth' });
  };

  return h(
    'section',
    { class: 'block sessions' },
    head,
    track,
    list.length > 1 &&
      h(
        'div',
        { class: 'carousel-nav' },
        h('button', { class: 'icon-btn', onclick: () => go(-1), 'aria-label': '이전 일정' }, '‹'),
        h('div', { class: 'carousel-pos' }, dots, counter),
        h('button', { class: 'icon-btn', onclick: () => go(1), 'aria-label': '다음 일정' }, '›')
      ),
    view.offset === 0 && h('button', { class: 'link small center-self', onclick: () => setOffset(1) }, '다음주 일정 보기 ›')
  );
}

function slide(s, t, u) {
  const att = rosterOf(s);
  const myRow = u && att.find((a) => a.playerId === u.id);
  const mine = !!myRow;
  const full = capacityOf(s) > 0 && att.length >= capacityOf(s);
  const d = parseYmd(s.date);
  const isToday = s.date === t;
  const past = s.date < t;
  const days = Math.round((parseYmd(s.date) - parseYmd(t)) / 864e5);
  const tag = isToday ? 'Today' : past ? '지난 일정' : `D-${days}`;
  let action;
  if (!u && (isToday || past)) action = h('a', { class: 'btn ghost grow', href: `#/s/${s.id}` }, '일정 보기');
  else if (isToday) action = h('a', { class: 'btn primary grow', href: `#/play/${s.id}` }, '경기 시작하기');
  else if (past) action = h('a', { class: 'btn ghost grow', href: `#/play/${s.id}/done` }, '결과 보기');
  else action = h('button', { class: 'btn grow ' + (mine ? 'ghost' : 'primary'), onclick: () => toggleRsvp(s) }, mine ? (myRow.waiting ? '대기 취소' : '참가 취소') : full ? '대기 신청' : '참가하기');
  return h(
    'div',
    { class: 'slide' + (past ? ' past' : '') + (isToday ? ' today' : '') },
    h('div', { class: 'row between' }, h('span', { class: 'slide-tag' }, tag), mine && h('span', { class: 'type ' + (myRow.waiting ? 'type-friendly' : 'type-official') }, myRow.waiting ? `대기 ${myRow.waitNo}번` : '참가 중')),
    h(
      'a',
      { class: 'next-main', href: `#/s/${s.id}` },
      h('div', { class: 'next-date' }, h('span', { class: 'num' }, d.getDate()), h('span', {}, `${d.getMonth() + 1}월 · ${dowOf(s.date)}`)),
      h(
        'div',
        { class: 'next-info' },
        h('strong', {}, s.venue),
        h('span', {}, `${s.start}–${s.end}`),
        h('span', {}, `코트 ${courtsOf(s).join(', ') || '-'} · 예약 ${s.booker || '-'}`),
        weatherChip(s)
      ),
      h('div', { class: 'next-count' }, h('span', { class: 'num' }, countText(s)), h('span', {}, capacityOf(s) ? '정원' : '명'))
    ),
    h('div', { class: 'row gap' }, action)
  );
}
