import { h, sheet, toast, field, go, confirmSheet, empty, ntrpText, select } from '../ui.js';
import {
  state, me, isAdmin, today, weekStart, addDays, parseYmd, DOW, fmtDate, attendanceOf, scheduleById, courtsOf, person, matchesOf, rosterOf, capacityOf, countText,
} from '../store.js';
import { put, remove, batch, uid } from '../db.js';
import { weatherChip, WEATHER_PLACE } from '../weather.js';
import { shareButton, scheduleText } from '../share.js';

// 네이버 지도: 일정에 넣은 지도 링크가 있으면 그것, 없으면 경기장명으로 검색
export const mapUrlOf = (s) => (s.mapUrl && /^https?:\/\//.test(s.mapUrl) ? s.mapUrl : `https://map.naver.com/p/search/${encodeURIComponent(s.venue || '')}`);
export const mapLink = (s, cls = '') => s.venue && h('a', { class: 'map-link ' + cls, href: mapUrlOf(s), target: '_blank', rel: 'noopener' }, '지도 ›');
// 일정 수정 · 삭제: 등록한 사람 (+ 관리자)
export const canEditSchedule = (s) => { const u = me(); return !!u && (s.createdBy === u.id || isAdmin()); };

import { requireLogin, pageHead, backLink, nameTag, genderPicker, GENDER_LABEL } from './common.js';

// ── 주간 일정 ─────────────────────────────────────────
export function weekView(param) {
  const t = today();
  const start = weekStart(param || t);
  const end = addDays(start, 6);
  const s0 = parseYmd(start);
  const s1 = parseYmd(end);
  const label = `${s0.getMonth() + 1}.${s0.getDate()} – ${s1.getMonth() + 1}.${s1.getDate()}`;

  const nav = h(
    'div',
    { class: 'week-nav' },
    h('a', { class: 'icon-btn', href: `#/week/${addDays(start, -7)}`, 'aria-label': '이전 주' }, '‹'),
    h('button', { class: 'week-label', onclick: () => go('#/week') }, label, start <= t && t <= end ? '' : h('small', {}, ' · 이번 주로')),
    h('a', { class: 'icon-btn', href: `#/week/${addDays(start, 7)}`, 'aria-label': '다음 주' }, '›')
  );

  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const d = parseYmd(date);
    const list = state.schedules.filter((s) => s.date === date).sort((a, b) => a.start.localeCompare(b.start));
    days.push(
      h(
        'div',
        { class: 'day' + (date === t ? ' is-today' : '') + (date < t ? ' is-past' : '') + (d.getDay() === 0 ? ' sun' : d.getDay() === 6 ? ' sat' : '') },
        h('div', { class: 'day-date' }, h('span', { class: 'dow' }, DOW[d.getDay()]), h('span', { class: 'num' }, d.getDate())),
        h(
          'div',
          { class: 'day-items' },
          list.length
            ? list.map((s) => {
                const mine = me() && attendanceOf(s.id).some((a) => a.playerId === me().id);
                return h(
                  'a',
                  { class: 'sch' + (mine ? ' mine' : ''), href: `#/s/${s.id}` },
                  h('div', {}, h('strong', {}, `${s.start}–${s.end}`), h('span', {}, `${s.venue} · 코트 ${courtsOf(s).join(',') || '-'}`), weatherChip(s)),
                  h('span', { class: 'cnt' + (capacityOf(s) && attendanceOf(s.id).length >= capacityOf(s) ? ' full' : '') }, countText(s), h('small', {}, '명'))
                );
              })
            : h('button', { class: 'day-empty', onclick: () => editSchedule(null, date) }, date < t ? '—' : '+ 일정 추가')
        )
      )
    );
  }

  return h(
    'div',
    { class: 'page' },
    pageHead('일정', 'Weekly', h('button', { class: 'btn primary small', onclick: () => editSchedule(null, t > start && t <= end ? t : start < t ? t : start) }, '+ 등록')),
    nav,
    h('div', { class: 'week' }, days),
    h('p', { class: 'muted small center' }, '굵은 테두리 = 내가 참가한 일정')
  );
}

// ── 일정 상세 ─────────────────────────────────────────
export function scheduleView(id) {
  const s = scheduleById(id);
  if (!s) return h('div', { class: 'page' }, backLink('#/week'), empty('삭제되었거나 없는 일정이에요'));
  const u = me();
  const att = rosterOf(s);
  const cap = capacityOf(s);
  const confirmed = att.filter((a) => !a.waiting);
  const waiting = att.filter((a) => a.waiting);
  const myRow = u && att.find((a) => a.playerId === u.id);
  const mine = !!myRow;
  const full = cap > 0 && att.length >= cap;
  const canEdit = canEditSchedule(s);
  const d = parseYmd(s.date);
  const t = today();

  return h(
    'div',
    { class: 'page' },
    backLink(`#/week/${s.date}`, '주간 일정'),
    h(
      'section',
      { class: 'hero hero-sch' },
      h('div', { class: 'hero-top' }, h('span', {}, `${d.getFullYear()}`), h('span', {}, s.date === t ? 'TODAY' : DOW[d.getDay()] + '요일')),
      h('div', { class: 'sch-big' }, h('span', { class: 'num' }, `${d.getMonth() + 1}.${d.getDate()}`), h('span', { class: 'time' }, `${s.start}–${s.end}`)),
      h(
        'dl',
        { class: 'sch-dl' },
        h('dt', {}, '경기장'), h('dd', {}, s.venue, ' ', mapLink(s, 'on-blue')),
        h('dt', {}, '코트'), h('dd', {}, courtsOf(s).join(', ') || '-'),
        h('dt', {}, '예약자'), h('dd', {}, s.booker || '-'),
        cap > 0 && [h('dt', {}, '정원'), h('dd', {}, `${cap}명`)],
        weatherChip(s) && [h('dt', {}, '날씨'), h('dd', {}, weatherChip(s, 'on-blue'), h('small', { class: 'wx-src' }, ` ${WEATHER_PLACE.name}`))],
        s.note && [h('dt', {}, '메모'), h('dd', {}, s.note)]
      )
    ),
    h(
      'div',
      { class: 'row gap' },
      s.date >= t && h('button', { class: 'btn grow ' + (mine ? 'ghost' : 'primary'), onclick: () => toggleRsvp(s) }, rsvpLabel(mine, myRow, full)),
      s.date <= t && u && h('a', { class: 'btn primary grow', href: `#/play/${s.id}` }, '출석 · 대진 ›')
    ),
    h(
      'section',
      { class: 'block' },
      h(
        'div',
        { class: 'row between' },
        h('h2', {}, cap ? `참가 ${confirmed.length}/${cap}명` : `참가 ${att.length}명`),
        h('div', { class: 'row gap' }, shareButton('카톡 공유', () => scheduleText(s)), h('button', { class: 'btn small ghost', onclick: () => addGuest(s) }, '+ 게스트'))
      ),
      att.length ? h('ul', { class: 'people' }, confirmed.map((a) => personRow(a, u))) : h('p', { class: 'muted' }, '아직 참가자가 없어요'),
      waiting.length > 0 && [h('h2', { class: 'sub' }, `대기 ${waiting.length}명`), h('ul', { class: 'people waiting' }, waiting.map((a) => personRow(a, u)))],
      cap > 0 && h('p', { class: 'muted small' }, '정원이 차면 대기로 신청돼요. 누가 취소하면 먼저 신청한 대기자부터 자동으로 확정돼요.')
    ),
    !canEdit && u && s.createdBy && h('p', { class: 'muted small center' }, `일정 수정은 등록한 ${person(s.createdBy).name}님만 할 수 있어요`),
    canEdit &&
      h(
        'div',
        { class: 'row gap' },
        h('button', { class: 'btn ghost grow', onclick: () => editSchedule(s) }, '일정 수정'),
        h('button', { class: 'btn ghost danger grow', onclick: () => deleteSchedule(s) }, '삭제')
      )
  );
}

const personRow = (a, u) => {
  const p = person(a.playerId);
  const info = a.isGuest
    ? `게스트 · ${GENDER_LABEL[p.gender] || ''} · ${ntrpText(p.ntrp)} · 초대 ${person(p.invitedBy).name}`
    : `${GENDER_LABEL[p.gender] || ''} · NTRP ${ntrpText(p.ntrp)}`;
  return h(
    'li',
    {},
    a.waiting && h('span', { class: 'wait-no' }, `대기 ${a.waitNo}`),
    nameTag(a.playerId),
    h('span', { class: 'muted small' }, info),
    a.isGuest && u && h('button', { class: 'link danger small', onclick: () => removeAttendance(a) }, '삭제')
  );
};

const rsvpLabel = (mine, myRow, full) => (mine ? (myRow.waiting ? '대기 취소' : '참가 취소') : full ? '대기 신청' : '참가하기');

export async function toggleRsvp(s) {
  if (!requireLogin(() => toggleRsvp(s))) return;
  const u = me();
  const id = `${s.id}_${u.id}`;
  const existing = state.attendance.find((a) => a.id === id);
  if (existing) {
    if (matchesOf(s.id).some((m) => [...m.teamA, ...m.teamB].includes(u.id)))
      return toast('이미 경기 기록이 있어 취소할 수 없어요');
    await remove('attendance', id);
    toast('취소했어요');
  } else {
    const cap = capacityOf(s);
    const n = attendanceOf(s.id).length;
    if (cap && n >= cap && !(await confirmSheet('정원 마감', `정원 ${cap}명이 다 찼어요.\n대기 ${n - cap + 1}번으로 신청할까요?\n누가 취소하면 순서대로 자동 확정돼요.`, '대기 신청'))) return;
    await put('attendance', { id, scheduleId: s.id, date: s.date, playerId: u.id, isGuest: false, arrived: false, createdAt: Date.now(), by: u.id });
    toast(cap && n >= cap ? `대기 ${n - cap + 1}번으로 신청했어요` : '참가 완료');
  }
}

async function removeAttendance(a) {
  if (matchesOf(a.scheduleId).some((m) => [...m.teamA, ...m.teamB].includes(a.playerId))) return toast('경기 기록이 있어 삭제할 수 없어요');
  await remove('attendance', a.id);
}

export function addGuest(s, { arrived = false } = {}) {
  if (!requireLogin(() => addGuest(s, { arrived }))) return;
  sheet('게스트 추가', (close) => {
    const name = h('input', { class: 'input', placeholder: '게스트 이름', maxLength: 12 });
    const ntrp = h('input', { class: 'input', type: 'number', step: '0.5', min: '1', max: '7', value: '2.5' });
    const gender = genderPicker('');
    const save = async () => {
      if (!name.value.trim()) return toast('이름을 입력해 주세요');
      if (!gender.value()) return toast('성별을 선택해 주세요');
      const gid = uid('g_');
      const u = me();
      await batch([
        { type: 'put', col: 'guests', doc: { id: gid, name: name.value.trim(), ntrp: Number(ntrp.value) || 2.5, gender: gender.value(), invitedBy: u.id, scheduleId: s.id, createdAt: Date.now() } },
        { type: 'put', col: 'attendance', doc: { id: `${s.id}_${gid}`, scheduleId: s.id, date: s.date, playerId: gid, isGuest: true, arrived, createdAt: Date.now(), by: u.id } },
      ]);
      close();
      toast('게스트를 추가했어요');
    };
    return h(
      'div',
      { class: 'stack' },
      field('이름', name),
      field('성별', gender.node),
      field('NTRP (대진 밸런스용)', ntrp),
      h('p', { class: 'muted small' }, '게스트가 낀 경기는 코인전이 불가하고, 승패·순위·레이팅에 반영되지 않아요.'),
      h('button', { class: 'btn primary block', onclick: save }, '추가')
    );
  });
}

export function editSchedule(s, date) {
  if (!requireLogin(() => editSchedule(s, date))) return;
  if (s && !canEditSchedule(s)) return toast('일정을 등록한 사람만 수정할 수 있어요');
  const last = [...state.schedules].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  const base = s || { date: date || today(), start: last?.start || '07:00', end: last?.end || '09:00', venue: last?.venue || '', mapUrl: last?.mapUrl || '', courts: last?.courts || '', capacity: last?.capacity || '', booker: me().name };
  sheet(s ? '일정 수정' : '일정 등록', (close) => {
    const venues = [...new Set(state.schedules.map((x) => x.venue).filter(Boolean))];
    const f = {
      date: h('input', { class: 'input', type: 'date', value: base.date }),
      start: h('input', { class: 'input', type: 'time', value: base.start, step: 1800 }),
      end: h('input', { class: 'input', type: 'time', value: base.end, step: 1800 }),
      venue: h('input', { class: 'input', value: base.venue, placeholder: '예) 법원읍 테니스장', list: 'venue-list' }),
      mapUrl: h('input', { class: 'input', type: 'url', value: base.mapUrl || '', placeholder: '비우면 경기장명으로 네이버 지도 검색' }),
      courts: h('input', { class: 'input', value: base.courts, placeholder: '예) 3, 4' }),
      capacity: h('input', { class: 'input', type: 'number', min: 0, inputMode: 'numeric', value: base.capacity || '', placeholder: '비우면 제한 없음' }),
      repeat: select({ class: 'input' }, [[1, '반복 안 함'], [2, '매주 · 2주'], [4, '매주 · 4주'], [8, '매주 · 8주'], [12, '매주 · 12주']], 1),
      booker: h('input', { class: 'input', value: base.booker || '' }),
      note: h('input', { class: 'input', value: base.note || '', placeholder: '선택 사항' }),
    };
    f.venue.addEventListener('change', () => {
      if (f.mapUrl.value.trim()) return;
      const prev = [...state.schedules].filter((x) => x.venue === f.venue.value.trim() && x.mapUrl).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
      if (prev) f.mapUrl.value = prev.mapUrl;
    });
    const save = async () => {
      if (!f.venue.value.trim()) return toast('경기장명을 입력해 주세요');
      if (!f.date.value) return toast('날짜를 선택해 주세요');
      if (f.end.value <= f.start.value) return toast('종료 시간이 시작보다 늦어야 해요');
      const doc = {
        ...(s || {}),
        id: s?.id || uid('s_'),
        date: f.date.value,
        start: f.start.value,
        end: f.end.value,
        venue: f.venue.value.trim(),
        courts: f.courts.value.trim(),
        capacity: Math.max(0, parseInt(f.capacity.value, 10) || 0),
        booker: f.booker.value.trim(),
        note: f.note.value.trim(),
        mapUrl: f.mapUrl.value.trim(),
        createdBy: s?.createdBy || me().id,
        createdAt: s?.createdAt || Date.now(),
      };
      const ops = [{ type: 'put', col: 'schedules', doc }];
      // 날짜가 바뀌면 출석/경기 날짜도 맞춰줌
      if (s && s.date !== doc.date) {
        attendanceOf(s.id).forEach((a) => ops.push({ type: 'put', col: 'attendance', doc: { ...a, date: doc.date } }));
        matchesOf(s.id).forEach((m) => ops.push({ type: 'put', col: 'matches', doc: { ...m, date: doc.date } }));
      }
      // 반복 등록: 같은 요일·시간으로 매주 생성
      const times = s ? 1 : Number(f.repeat.value) || 1;
      for (let k = 1; k < times; k++) {
        ops.push({ type: 'put', col: 'schedules', doc: { ...doc, id: uid('s_'), date: addDays(doc.date, 7 * k), createdAt: doc.createdAt + k } });
      }
      await batch(ops);
      close();
      toast(s ? '수정했어요' : times > 1 ? `매주 ${times}개 일정을 등록했어요` : '일정을 등록했어요. 참가하려면 참가하기를 눌러 주세요');
      go(`#/s/${doc.id}`);
    };
    return h(
      'div',
      { class: 'stack' },
      h('datalist', { id: 'venue-list' }, venues.map((v) => h('option', { value: v }))),
      field('날짜', f.date),
      h('div', { class: 'row gap' }, field('시작', f.start), field('종료', f.end)),
      field('경기장명', f.venue),
      field('네이버 지도 링크', f.mapUrl, '네이버 지도 앱에서 경기장 → 공유 → 링크 복사 후 붙여넣기'),
      field('코트 번호', f.courts, '여러 면이면 쉼표로 구분 → 자동 대진 코트 수'),
      field('정원', f.capacity, '코트 수 × 4명 추천 (예: 2면 → 8명). 넘으면 대기로 받아요'),
      !s && field('반복', f.repeat, '같은 요일·시간으로 매주 등록'),
      field('예약자', f.booker),
      field('메모', f.note),
      h('button', { class: 'btn primary block', onclick: save }, s ? '저장' : '등록')
    );
  });
}

async function deleteSchedule(s) {
  if (!canEditSchedule(s)) return toast('일정을 등록한 사람만 삭제할 수 있어요');
  const ms = matchesOf(s.id);
  if (ms.some((m) => m.status === 'done' && m.type !== 'friendly'))
    return toast('기록된 경기가 있는 일정은 삭제할 수 없어요');
  const ok = await confirmSheet('일정 삭제', `${fmtDate(s.date)} ${s.venue} 일정과 참가 명단을 삭제할까요?`, '삭제', true);
  if (!ok) return;
  await batch([
    { type: 'del', col: 'schedules', id: s.id },
    ...attendanceOf(s.id).map((a) => ({ type: 'del', col: 'attendance', id: a.id })),
    ...ms.map((m) => ({ type: 'del', col: 'matches', id: m.id })),
  ]);
  go(`#/week/${s.date}`);
}
