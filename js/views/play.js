import { h, sheet, toast, field, select, go, confirmSheet, empty } from '../ui.js';
import {
  state, me, isAdmin, today, fmtDate, attendanceOf, matchesOf, scheduleById, courtsOf, person, derived, activePlayers, isGuestId, ratingOf, ratingMap, rosterOf, scheduleEnded, scheduleTime,
} from '../store.js';
import { put, remove, batch, uid } from '../db.js';
import { generate, capacity } from '../matchmaker.js';
import { MATCH_TYPES, coinStake, RULES } from '../rules.js';
import { requireLogin, pageHead, nameTag, matchCard, canRecord, recordDeniedMsg, teamNames, FORMAT_LABEL } from './common.js';
import { addGuest } from './schedule.js';
import { shareButton, drawText, resultsText } from '../share.js';

// 대진 옵션은 기기에 기억
const prefs = {
  get: () => {
    try {
      return { format: 'doubles', type: 'coin', ...JSON.parse(localStorage.getItem('offcourt-play') || '{}') };
    } catch {
      return { format: 'doubles', type: 'coin' };
    }
  },
  set: (p) => localStorage.setItem('offcourt-play', JSON.stringify({ ...prefs.get(), ...p })),
};

export function playView(sid, tab) {
  const t = today();
  if (!sid) {
    const todays = state.schedules.filter((s) => s.date === t).sort((a, b) => a.start.localeCompare(b.start));
    if (todays.length === 1) return playView(todays[0].id, tab);
    const recent = state.schedules.filter((s) => s.date < t).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const item = (s) => h('a', { class: 'link-row', href: `#/play/${s.id}` }, h('span', {}, h('strong', {}, fmtDate(s.date)), h('br'), h('span', { class: 'muted small' }, `${s.start}–${s.end} · ${s.venue}`)), h('span', { class: 'muted' }, s.date === t && scheduleEnded(s) ? '종료 ›' : `${attendanceOf(s.id).length}명 ›`));
    return h(
      'div',
      { class: 'page' },
      pageHead('경기', 'Match Day'),
      todays.length
        ? h('section', { class: 'block' }, h('h2', {}, '오늘 일정을 선택하세요'), todays.map(item))
        : empty('오늘 등록된 일정이 없어요', h('a', { class: 'btn primary', href: '#/week' }, '일정 등록하기')),
      recent.length > 0 && h('section', { class: 'block' }, h('h2', {}, '지난 일정 기록하기'), recent.map(item))
    );
  }

  const s = scheduleById(sid);
  if (!s) return h('div', { class: 'page' }, empty('없는 일정이에요'));
  // 경기 시간이 끝난 일정은 결과 탭부터 (v1.13.0~)
  if (!tab) tab = scheduleEnded(s) ? 'done' : 'draw';
  const tabs = [
    ['att', '출석'],
    ['draw', '대진'],
    ['done', '결과'],
  ];
  const body = tab === 'att' ? attendanceTab(s) : tab === 'done' ? resultsTab(s) : drawTab(s);
  return h(
    'div',
    { class: 'page' },
    pageHead(s.venue, `${fmtDate(s.date)} · ${s.start}–${s.end}`, h('a', { class: 'btn small ghost', href: `#/s/${s.id}` }, '일정')),
    h('nav', { class: 'seg' }, tabs.map(([k, l]) => h('a', { class: k === tab ? 'on' : '', href: `#/play/${s.id}/${k}` }, l, k === 'done' ? h('small', {}, ` ${matchesOf(s.id).filter((m) => m.status === 'done').length}`) : null))),
    body
  );
}

// ── 출석 탭 ───────────────────────────────────────────
function attendanceTab(s) {
  const att = rosterOf(s);
  const arrived = att.filter((a) => a.arrived);
  const notIn = activePlayers().filter((p) => !att.some((a) => a.playerId === p.id));
  const coin = state.settings.find((x) => x.id === 'main')?.attendCoin ?? 1;

  const row = (a) =>
    h(
      'li',
      { class: 'att-row' + (a.arrived ? ' on' : '') + (a.left ? ' left' : '') },
      h('button', { class: 'att-toggle', onclick: () => setArrived(a, !a.arrived), 'aria-pressed': a.arrived }, h('span', { class: 'box' }, a.arrived ? '✓' : ''), nameTag(a.playerId)),
      a.arrived
        ? h('button', { class: 'chip' + (a.left ? ' on' : ''), onclick: () => setLeft(a, !a.left) }, a.left ? '귀가함' : '귀가')
        : h('span', { class: 'muted small' }, a.waiting ? `대기 ${a.waitNo}` : '미도착')
    );

  return h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'block' },
      h('div', { class: 'row between' }, h('h2', {}, `도착 ${arrived.length} / ${att.length}명`), h('span', { class: 'muted small' }, `도착 체크 시 코인 +${coin}`)),
      att.length ? h('ul', { class: 'att-list' }, att.map(row)) : h('p', { class: 'muted' }, '참가 신청한 사람이 없어요. 아래에서 바로 추가하세요.'),
      h('p', { class: 'muted small' }, '귀가: 출석은 유지하고 다음 대진에서만 빠져요.')
    ),
    h(
      'section',
      { class: 'block' },
      h('h2', {}, '현장 추가'),
      h(
        'div',
        { class: 'row gap' },
        notIn.length > 0 &&
          h(
            'button',
            { class: 'btn ghost grow', onclick: () => addWalkIn(s, notIn) },
            '+ 회원'
          ),
        h('button', { class: 'btn ghost grow', onclick: () => addGuest(s, { arrived: true }) }, '+ 게스트')
      )
    )
  );
}

async function setArrived(a, v) {
  if (!requireLogin()) return;
  if (!v && matchesOf(a.scheduleId).some((m) => [...m.teamA, ...m.teamB].includes(a.playerId))) return toast('경기 기록이 있어 해제할 수 없어요');
  await put('attendance', { ...a, arrived: v, left: v ? a.left : false, arrivedBy: me().id });
}
async function setLeft(a, v) {
  if (!requireLogin()) return;
  await put('attendance', { ...a, left: v });
}

function addWalkIn(s, notIn) {
  if (!requireLogin(() => addWalkIn(s, notIn))) return;
  sheet('회원 현장 추가', (close) => {
    const picked = new Set();
    const list = h(
      'div',
      { class: 'pick-grid' },
      notIn.map((p) =>
        h('button', { class: 'chip big', onclick: (e) => { picked.has(p.id) ? picked.delete(p.id) : picked.add(p.id); e.currentTarget.classList.toggle('on'); } }, p.name)
      )
    );
    const save = async () => {
      if (!picked.size) return toast('선택한 회원이 없어요');
      await batch(
        [...picked].map((pid) => ({ type: 'put', col: 'attendance', doc: { id: `${s.id}_${pid}`, scheduleId: s.id, date: s.date, playerId: pid, isGuest: false, arrived: true, createdAt: Date.now(), by: me().id } }))
      );
      close();
      toast(`${picked.size}명 도착 처리했어요`);
    };
    return h('div', { class: 'stack' }, list, h('button', { class: 'btn primary block', onclick: save }, '도착 처리'));
  });
}

// ── 대진 탭 ───────────────────────────────────────────
// 경기 시간이 끝난 일정: 새 대진 · 취소는 관리자만 (v1.13.0~)
const drawLocked = (s) => scheduleEnded(s) && !isAdmin();
const hm = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
function endedNotice(s, playing) {
  const until = hm(scheduleTime(s, 'end') + RULES.recordGraceMin * 60000);
  return h(
    'section',
    { class: 'block notice-ended' },
    h('h2', {}, `경기 시간 종료 · ${s.end}`),
    h('p', { class: 'muted small' }, isAdmin() ? '회원은 새 대진을 만들 수 없어요. 관리자는 계속 기록 · 수정할 수 있어요.' : '정해진 경기 시간이 끝나 새 대진을 만들 수 없어요.'),
    playing.length > 0 && h('p', { class: 'muted small' }, `진행 중이던 경기의 점수는 ${until}까지 참가자가 입력할 수 있어요. 그 뒤에는 관리자만 입력해요.`)
  );
}

function drawTab(s) {
  const courts = courtsOf(s).length ? courtsOf(s) : ['1'];
  const att = attendanceOf(s.id);
  const ms = matchesOf(s.id);
  const playing = ms.filter((m) => m.status === 'playing');
  const busy = new Set(playing.flatMap((m) => [...m.teamA, ...m.teamB]));
  const pool = att.filter((a) => a.arrived && !a.left && !busy.has(a.playerId)).map((a) => a.playerId);
  const freeCourts = courts.filter((c) => !playing.some((m) => m.court === c));
  const p = prefs.get();
  const per = p.format === 'singles' ? 2 : 4;
  const genders = genderMap();
  const cap = capacity({ pool, courts: freeCourts, format: p.format, genders });
  const poolM = pool.filter((id) => genders.get(id) === 'M').length;
  const poolF = pool.filter((id) => genders.get(id) === 'F').length;
  const noGender = pool.filter((id) => !genders.get(id)).length;
  const gamesToday = new Map();
  ms.forEach((m) => [...m.teamA, ...m.teamB].forEach((id) => gamesToday.set(id, (gamesToday.get(id) || 0) + 1)));

  const segBtn = (key, val, label) =>
    h('button', { class: p[key] === val ? 'on' : '', onclick: () => { prefs.set({ [key]: val }); window.dispatchEvent(new Event('rerender')); } }, label);

  const courtCards = courts.map((c) => {
    const m = playing.find((x) => x.court === c);
    if (!m) return h('div', { class: 'court empty-court' }, h('span', { class: 'court-no' }, `코트 ${c}`), h('span', { class: 'muted' }, '비어 있음'));
    return h(
      'div',
      { class: 'court' },
      h('div', { class: 'row between' }, h('span', { class: 'court-no' }, `코트 ${c} · ${FORMAT_LABEL[m.format] || '복식'}`), h('span', { class: 'type type-' + m.type }, MATCH_TYPES[m.type].label)),
      h('div', { class: 'court-teams' }, h('div', {}, teamNames(m.teamA)), h('span', { class: 'vs' }, 'vs'), h('div', {}, teamNames(m.teamB))),
      h('div', { class: 'muted small' }, `평균 레이팅 ${avgR(m.teamA)} : ${avgR(m.teamB)}`),
      h(
        'div',
        { class: 'row gap' },
        h('button', { class: 'btn primary grow', onclick: () => (canRecord(m) ? scoreSheet(m) : toast(recordDeniedMsg(m))) }, m.type === 'friendly' ? '경기 종료' : '점수 입력'),
        !drawLocked(s) && h('button', { class: 'btn ghost', onclick: () => cancelMatch(m) }, '취소')
      )
    );
  });

  const canAuto = cap > 0;
  const autoLabel = canAuto
    ? `빈 코트 ${cap}면 자동 ${FORMAT_LABEL[p.format]} 대진`
    : !freeCourts.length
      ? '빈 코트가 없어요'
      : p.format === 'mixed'
        ? '남 2명 · 여 2명 이상 필요해요'
        : `${per}명 이상 도착해야 해요`;
  const ended = scheduleEnded(s);
  return h(
    'div',
    { class: 'stack' },
    ended && endedNotice(s, playing),
    !drawLocked(s) && h(
      'section',
      { class: 'block' },
      h('div', { class: 'summary3' }, sum('대진 가능', pool.length + '명'), sum('빈 코트', `${freeCourts.length}/${courts.length}`), sum('진행 중', playing.length + '경기')),
      h('div', { class: 'seg small' }, segBtn('format', 'doubles', '복식'), segBtn('format', 'mixed', '혼복'), segBtn('format', 'singles', '단식')),
      p.format === 'mixed' && h('p', { class: 'muted small' }, `대기 남 ${poolM} · 여 ${poolF}${noGender ? ` · 성별 미입력 ${noGender}명 제외` : ''}`),
      h('div', { class: 'seg small' }, Object.entries(MATCH_TYPES).map(([k, v]) => segBtn('type', k, v.label))),
      h('p', { class: 'muted small' }, MATCH_TYPES[p.type].desc),
      h('button', { class: 'btn primary block', disabled: !canAuto, onclick: () => autoDraw(s, pool, freeCourts, p) }, autoLabel),
      h('button', { class: 'btn ghost block', onclick: () => manualSheet(s, pool, freeCourts.length ? freeCourts : courts, p) }, '직접 대진 만들기')
    ),
    playing.length > 0 && h('div', { class: 'row end' }, shareButton('대진 카톡 공유', () => drawText(s))),
    h('div', { class: 'courts' }, drawLocked(s) && !playing.length ? h('p', { class: 'muted center' }, '진행 중인 경기가 없어요. 결과 탭에서 기록을 확인하세요.') : courtCards),
    !drawLocked(s) && h(
      'section',
      { class: 'block' },
      h('h2', {}, `대기 ${pool.length}명`),
      pool.length
        ? h('div', { class: 'wait' }, pool.sort((a, b) => (gamesToday.get(a) || 0) - (gamesToday.get(b) || 0)).map((id) => h('span', { class: 'chip' }, person(id).name, h('small', {}, ` ${gamesToday.get(id) || 0}경기`))))
        : h('p', { class: 'muted' }, att.some((a) => a.arrived) ? '모두 경기 중이에요' : '출석 탭에서 도착 체크를 먼저 해주세요', !att.some((a) => a.arrived) && h('a', { class: 'link', href: `#/play/${s.id}/att` }, ' 출석하러 가기 ›'))
    )
  );
}

const genderMap = () => new Map([...state.players, ...state.guests].map((x) => [x.id, x.gender]));
const sum = (l, v) => h('div', {}, h('strong', {}, v), h('span', {}, l));
const avgR = (ids) => Math.round(ids.reduce((a, id) => a + ratingOf(id), 0) / ids.length);

// 코인전 불가 사유 (게스트 포함 / 코인 부족)
function coinBlockReason(ids) {
  if (ids.some(isGuestId)) return '게스트 포함';
  const { coins } = derived();
  const broke = ids.filter((id) => (coins.bal.get(id) ?? 0) < 1);
  if (broke.length) return `${broke.map((id) => person(id).name).join(', ')} 코인 부족`;
  return null;
}

async function autoDraw(s, pool, freeCourts, p) {
  if (!requireLogin()) return;
  if (drawLocked(s)) return toast('경기 시간이 끝나 새 대진을 만들 수 없어요');
  const plan = generate({ pool, courts: freeCourts, format: p.format, ratings: ratingMap(pool), todayMatches: matchesOf(s.id), genders: genderMap() });
  if (!plan.length) return toast('대진을 만들 수 없어요');
  const notes = [];
  const now = Date.now();
  const ops = plan.map((x, i) => {
    let type = p.type;
    if (type === 'coin') {
      const why = coinBlockReason([...x.teamA, ...x.teamB]);
      if (why) {
        type = 'official';
        notes.push(`코트 ${x.court}: ${why} → 공식전`);
      }
    }
    return { type: 'put', col: 'matches', doc: newMatch(s, x.court, p.format, type, x.teamA, x.teamB, now + i) };
  });
  await batch(ops);
  toast(notes.length ? notes.join(' / ') : `${plan.length}코트 대진 완료`);
}

function newMatch(s, court, format, type, teamA, teamB, createdAt = Date.now()) {
  return { id: uid('m_'), scheduleId: s.id, date: s.date, court, format, type, teamA, teamB, scoreA: null, scoreB: null, status: 'playing', createdAt, createdBy: me().id, history: [] };
}

function manualSheet(s, pool, courts, p) {
  if (!requireLogin(() => manualSheet(s, pool, courts, p))) return;
  if (drawLocked(s)) return toast('경기 시간이 끝나 새 대진을 만들 수 없어요');
  const all = attendanceOf(s.id).filter((a) => a.arrived).map((a) => a.playerId);
  if (all.length < 2) return toast('도착한 사람이 2명 이상이어야 해요');
  sheet('직접 대진', (close) => {
    const opts = [['', '선택'], ...all.map((id) => [id, `${person(id).name}${person(id).gender ? ` (${person(id).gender === 'M' ? '남' : '여'})` : ''}${pool.includes(id) ? '' : ' · 경기중/귀가'}`])];
    const court = select({ class: 'input' }, courts.map((c) => [c, `코트 ${c}`]), courts[0]);
    const format = select({ class: 'input' }, Object.entries(FORMAT_LABEL), p.format);
    const type = select({ class: 'input' }, Object.entries(MATCH_TYPES).map(([k, v]) => [k, v.label]), p.type);
    const slots = [0, 1, 2, 3].map(() => select({ class: 'input' }, opts, ''));
    const b2 = h('div', { class: 'grid2' }, h('div', { class: 'team-col' }, h('p', { class: 'eyebrow' }, 'Team A'), slots[0], slots[1]), h('div', { class: 'team-col' }, h('p', { class: 'eyebrow' }, 'Team B'), slots[2], slots[3]));
    const sync = () => {
      const single = format.value === 'singles';
      slots[1].style.display = slots[3].style.display = single ? 'none' : '';
    };
    format.addEventListener('change', sync);
    sync();
    const save = async () => {
      const single = format.value === 'singles';
      const A = (single ? [slots[0]] : [slots[0], slots[1]]).map((x) => x.value);
      const B = (single ? [slots[2]] : [slots[2], slots[3]]).map((x) => x.value);
      const ids = [...A, ...B];
      if (ids.some((x) => !x)) return toast('선수를 모두 선택해 주세요');
      if (new Set(ids).size !== ids.length) return toast('같은 선수가 중복됐어요');
      if (format.value === 'mixed') {
        const g = (id) => person(id).gender;
        const ok = (t) => t.map(g).sort().join('') === 'FM';
        if (!ok(A) || !ok(B)) return toast('혼복은 각 팀이 남 1명 · 여 1명이어야 해요');
      }
      let t = type.value;
      if (t === 'coin') {
        const why = coinBlockReason(ids);
        if (why) {
          t = 'official';
          toast(`${why} → 공식전으로 생성`);
        }
      }
      await put('matches', newMatch(s, court.value, format.value, t, A, B));
      close();
    };
    return h('div', { class: 'stack' }, h('div', { class: 'grid2' }, field('코트', court), field('방식', format)), field('경기 유형', type), b2, h('button', { class: 'btn primary block', onclick: save }, '대진 생성'));
  });
}

async function cancelMatch(m) {
  if (!requireLogin()) return;
  const ok = await confirmSheet('대진 취소', `코트 ${m.court} 대진을 취소할까요?\n선수들은 대기 명단으로 돌아가요.`, '대진 취소', true);
  if (ok) await remove('matches', m.id);
}

// ── 점수 입력 ─────────────────────────────────────────
export function scoreSheet(m) {
  if (!requireLogin(() => scoreSheet(m))) return;
  if (!canRecord(m)) return toast(recordDeniedMsg(m));
  const done = m.status === 'done';
  sheet(done ? '기록 수정' : '점수 입력', (close) => {
    let a = m.scoreA ?? 6;
    let b = m.scoreB ?? (done ? 0 : 4);
    let type = m.type;
    const view = h('div', { class: 'stack' });
    const stepper = (get, set) =>
      h(
        'div',
        { class: 'stepper' },
        h('button', { onclick: () => { set(Math.max(0, get() - 1)); render(); }, 'aria-label': '빼기' }, '−'),
        h('span', { class: 'num' }, get()),
        h('button', { onclick: () => { set(Math.min(9, get() + 1)); render(); }, 'aria-label': '더하기' }, '+')
      );
    const presets = [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 5], [7, 6]];
    const render = () => {
      view.replaceChildren(...h('div', {}, // h()로 배열·false 정리
        h(
          'div',
          { class: 'seg small' },
          Object.entries(MATCH_TYPES).map(([k, v]) =>
            h('button', { class: type === k ? 'on' : '', onclick: () => { if (k === 'coin' && [...m.teamA, ...m.teamB].some(isGuestId)) return toast('게스트가 있어 코인전 불가'); type = k; render(); } }, v.label)
          )
        ),
        type === 'friendly'
          ? h('p', { class: 'muted center' }, '친선전은 승패를 기록하지 않아요. 종료만 표시합니다.')
          : [
              h(
                'div',
                { class: 'score-grid' },
                h('div', { class: 'score-team' + (a > b ? ' win' : '') }, h('div', { class: 'names' }, teamNames(m.teamA)), stepper(() => a, (v) => (a = v))),
                h('div', { class: 'score-team' + (b > a ? ' win' : '') }, h('div', { class: 'names' }, teamNames(m.teamB)), stepper(() => b, (v) => (b = v)))
              ),
              h(
                'div',
                { class: 'presets' },
                presets.map(([x, y]) => h('button', { class: 'chip', onclick: () => { if (b > a) { b = x; a = y; } else { a = x; b = y; } render(); } }, `${x}:${y}`))
              ),
              h('p', { class: 'muted small center' }, '빠른 입력은 현재 이기고 있는 팀 기준으로 적용돼요'),
              a === b && h('p', { class: 'warn' }, '동점은 저장할 수 없어요'),
              type === 'coin' && a !== b && h('p', { class: 'muted center' }, `승리팀 각 +${coinStake({ scoreA: a, scoreB: b })} · 패배팀 각 −${coinStake({ scoreA: a, scoreB: b })} 코인`),
            ],
        h('button', { class: 'btn primary block', disabled: type !== 'friendly' && a === b, onclick: save }, done ? '수정 저장' : '기록 저장'),
        done && h('button', { class: 'btn ghost danger block', onclick: undo }, '결과 취소 (진행 중으로 되돌리기)')
      ).childNodes);
    };
    const save = async () => {
      const entry = { by: me().id, at: Date.now(), scoreA: type === 'friendly' ? null : a, scoreB: type === 'friendly' ? null : b, type };
      await put('matches', {
        ...m,
        type,
        scoreA: entry.scoreA,
        scoreB: entry.scoreB,
        status: 'done',
        recordedBy: me().id,
        recordedAt: Date.now(),
        history: [...(m.history || []), entry],
      });
      close();
      toast(done ? '수정했어요' : '기록 완료');
    };
    const undo = async () => {
      const ok = await confirmSheet('결과 취소', '점수를 지우고 진행 중 경기로 되돌릴까요?\n코인·레이팅도 자동으로 원래대로 돌아가요.', '되돌리기', true);
      if (!ok) return;
      await put('matches', { ...m, status: 'playing', scoreA: null, scoreB: null, history: [...(m.history || []), { by: me().id, at: Date.now(), undo: true }] });
      close();
    };
    render();
    return view;
  });
}

// ── 결과 탭 ───────────────────────────────────────────
function resultsTab(s) {
  const done = matchesOf(s.id).filter((m) => m.status === 'done').reverse();
  if (!done.length) return empty('아직 끝난 경기가 없어요');
  const counts = { coin: 0, official: 0, friendly: 0 };
  done.forEach((m) => counts[m.type]++);
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'row between' }, h('p', { class: 'muted small' }, Object.entries(counts).map(([k, n]) => `${MATCH_TYPES[k].label} ${n}`).join(' · ')), shareButton('결과 카톡 공유', () => resultsText(s))),
    done.map((m) => matchCard(m, { onEdit: scoreSheet }))
  );
}
