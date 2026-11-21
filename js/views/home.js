import { h } from '../ui.js';
import { state, me, today, fmtDate, attendanceOf, derived, currentSeason, seasonStats, settings, courtsOf, dowOf, parseYmd } from '../store.js';
import { toggleRsvp } from './schedule.js';
import { rankList } from './rank.js';

export function homeView() {
  const t = today();
  const u = me();
  const upcoming = state.schedules
    .filter((s) => s.date >= t)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const next = upcoming[0];
  const season = currentSeason();

  const hero = h(
    'section',
    { class: 'hero' },
    h('div', { class: 'hero-top' }, h('span', {}, 'Social Nets Tennis Club'), h('span', {}, season ? season.name : 'Season —')),
    h('div', { class: 'wordmark' }, h('em', {}, 'Off'), 'court', h('sup', {}, '™')),
    h('div', { class: 'hero-bottom' }, h('span', {}, u ? `${u.name}님` : '로그인하면 참가·기록이 가능해요'), h('span', {}, 'Est. 2026'))
  );

  let nextCard;
  if (!next) {
    nextCard = h('section', { class: 'block' }, h('p', { class: 'eyebrow' }, 'Next Session'), h('p', { class: 'big-muted' }, '예정된 일정이 없어요'), h('a', { class: 'btn primary block', href: '#/week' }, '일정 등록하러 가기'));
  } else {
    const att = attendanceOf(next.id);
    const mine = u && att.some((a) => a.playerId === u.id);
    const d = parseYmd(next.date);
    const isToday = next.date === t;
    nextCard = h(
      'section',
      { class: 'block next' },
      h('p', { class: 'eyebrow' }, isToday ? 'Today' : 'Next Session'),
      h(
        'a',
        { class: 'next-main', href: `#/s/${next.id}` },
        h('div', { class: 'next-date' }, h('span', { class: 'num' }, d.getDate()), h('span', {}, `${d.getMonth() + 1}월 · ${dowOf(next.date)}`)),
        h(
          'div',
          { class: 'next-info' },
          h('strong', {}, next.venue),
          h('span', {}, `${next.start}–${next.end}`),
          h('span', {}, `코트 ${courtsOf(next).join(', ') || '-'} · 예약 ${next.booker || '-'}`)
        ),
        h('div', { class: 'next-count' }, h('span', { class: 'num' }, att.length), h('span', {}, '명'))
      ),
      h(
        'div',
        { class: 'row gap' },
        isToday
          ? h('a', { class: 'btn primary grow', href: `#/play/${next.id}` }, '경기 시작하기')
          : h('button', { class: 'btn grow ' + (mine ? 'ghost' : 'primary'), onclick: () => toggleRsvp(next) }, mine ? '참가 취소' : '참가하기'),
        h('a', { class: 'btn ghost', href: '#/week' }, '이번 주')
      ),
      upcoming.length > 1 && h('p', { class: 'muted small center' }, `이후 일정 ${upcoming.length - 1}개 더`)
    );
  }

  let mineCard = null;
  if (u) {
    const { coins, ratings } = derived();
    const st = season ? seasonStats(season).get(u.id) : null;
    mineCard = h(
      'a',
      { class: 'block stats3', href: `#/p/${u.id}` },
      stat('코인', coins.bal.get(u.id) ?? 0),
      stat('시즌 전적', st ? `${st.wins}승 ${st.losses}패` : '-'),
      stat('레이팅', Math.round(ratings.get(u.id) || 0))
    );
  }

  const top = season ? rankList(season).ranked.slice(0, 3) : [];
  const podium =
    top.length > 0 &&
    h(
      'section',
      { class: 'block' },
      h('div', { class: 'row between' }, h('p', { class: 'eyebrow' }, `${season.name} Top 3`), h('a', { class: 'small', href: '#/rank' }, '전체 순위 ›')),
      top.map((r, i) => h('a', { class: 'podium-row', href: `#/p/${r.id}` }, h('span', { class: 'rank-num' }, i + 1), h('span', { class: 'grow' }, r.name), h('span', { class: 'sp' }, Math.round(r.sp), h('small', {}, ' pt'))))
    );

  return h('div', { class: 'page' }, hero, nextCard, mineCard, podium);
}

const stat = (label, value) => h('div', { class: 'stat' }, h('span', { class: 'stat-v' }, value), h('span', { class: 'stat-l' }, label));
