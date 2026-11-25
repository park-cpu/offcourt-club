// ─────────────────────────────────────────────────────────────
// 카톡 공유: 휴대폰은 공유 창(카카오톡 선택), 안 되면 클립보드 복사
// ─────────────────────────────────────────────────────────────
import { h, toast, sheet } from './ui.js';
import { attendanceOf, rosterOf, capacityOf, matchesOf, courtsOf, person, parseYmd, DOW } from './store.js';
import { weatherFor } from './weather.js';
import { MATCH_TYPES, winnerSide } from './rules.js';

const FORMAT = { doubles: '복식', mixed: '혼복', singles: '단식' };
const appUrl = (hash) => location.origin + location.pathname + hash;
const names = (ids) => ids.map((id) => person(id).name).join('·');
const dateLabel = (s) => {
  const d = parseYmd(s.date);
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
};
const weatherLine = (s) => {
  const w = weatherFor(s.date, s.start, s.end, s);
  if (!w) return null;
  const deg = (n) => `${n}°`;
  return `🌡 ${w.min === w.max ? deg(w.min) : `${deg(w.min)}~${deg(w.max)}`}${w.pop != null ? ` · 강수 ${w.pop}%` : ''}`;
};

export async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // 사용자가 닫음
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('복사했어요. 카톡방에 붙여넣기 하세요');
  } catch {
    // 복사도 안 되는 환경: 직접 길게 눌러 복사
    sheet('공유할 내용', () => h('div', { class: 'stack' }, h('textarea', { class: 'input share-text', readOnly: true, value: text, rows: 10 }), h('p', { class: 'muted small' }, '길게 눌러 전체 선택 후 복사하세요')));
  }
}

// 네이버 지도 링크 (schedule.js의 mapUrlOf와 같은 규칙)
const mapUrlOf = (s) => (s.mapUrl && /^https?:\/\//.test(s.mapUrl) ? s.mapUrl : `https://map.naver.com/p/search/${encodeURIComponent(s.address || s.venue || '')}`);

export function scheduleText(s) {
  const roster = rosterOf(s);
  const cap = capacityOf(s);
  const ok = roster.filter((a) => !a.waiting);
  const wait = roster.filter((a) => a.waiting);
  return [
    `[Offcourt] ${dateLabel(s)} ${s.start}–${s.end}`,
    `📍 ${s.venue} · 코트 ${courtsOf(s).join(', ') || '-'}`,
    s.address ? `🏠 ${s.address}` : null,
    s.venue ? `🗺 지도: ${mapUrlOf(s)}` : null,
    weatherLine(s),
    `👥 참가 ${cap ? `${ok.length}/${cap}` : ok.length}명${ok.length ? ': ' + ok.map((a) => person(a.playerId).name).join(', ') : ''}`,
    wait.length ? `⏳ 대기 ${wait.length}명: ${wait.map((a) => person(a.playerId).name).join(', ')}` : null,
    s.note ? `📝 ${s.note}` : null,
    `👉 참가 신청: ${appUrl('#/s/' + s.id)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function drawText(s) {
  const playing = matchesOf(s.id).filter((m) => m.status === 'playing');
  const busy = new Set(playing.flatMap((m) => [...m.teamA, ...m.teamB]));
  const waiting = attendanceOf(s.id).filter((a) => a.arrived && !a.left && !busy.has(a.playerId));
  return [
    `[Offcourt 대진] ${dateLabel(s)} ${s.venue}`,
    ...playing.map((m) => `🎾 코트 ${m.court} (${FORMAT[m.format] || '복식'}·${MATCH_TYPES[m.type].label})\n   ${names(m.teamA)}  vs  ${names(m.teamB)}`),
    waiting.length ? `⏳ 대기: ${waiting.map((a) => person(a.playerId).name).join(', ')}` : null,
    `👉 ${appUrl('#/play/' + s.id)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function resultsText(s) {
  const done = matchesOf(s.id).filter((m) => m.status === 'done');
  return [
    `[Offcourt 결과] ${dateLabel(s)} ${s.venue} · ${done.length}경기`,
    ...done.map((m, i) => {
      if (m.type === 'friendly') return `${i + 1}. ${names(m.teamA)} vs ${names(m.teamB)} (친선)`;
      const w = winnerSide(m);
      const A = (w === 'A' ? '🏆' : '') + names(m.teamA);
      const B = (w === 'B' ? '🏆' : '') + names(m.teamB);
      return `${i + 1}. ${A} ${m.scoreA}:${m.scoreB} ${B}${m.type === 'coin' ? ' 🪙' : ''}`;
    }),
    `👉 ${appUrl('#/play/' + s.id + '/done')}`,
  ].join('\n');
}

export const shareButton = (label, makeText) => h('button', { class: 'btn small ghost share-btn', onclick: () => shareText(makeText()) }, '↗ ', label);
