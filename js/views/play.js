import { h, sheet, toast, field, select, go, confirmSheet, empty } from '../ui.js';
import {
  state, me, isAdmin, today, fmtDate, attendanceOf, matchesOf, scheduleById, courtsOf, person, derived, activePlayers, isGuestId, ratingOf, ratingMap, rosterOf, scheduleEnded, scheduleTime, addDays,
} from '../store.js';
import { put, remove, batch, uid, db } from '../db.js';
import { generate, capacity, groupOk, splitsOf } from '../matchmaker.js';
import { MATCH_TYPES, coinStake, RULES } from '../rules.js';
import { requireLogin, pageHead, nameTag, matchCard, canRecord, recordDeniedMsg, teamNames, FORMAT_LABEL } from './common.js';
import { addGuest } from './schedule.js';
import { shareButton, drawText, resultsText } from '../share.js';
import { featureOn } from '../features.js';

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
    // 경기 시간이 끝난 일정은 '오늘 일정'에서 빠지고 지난 일정으로 (v1.13.3~)
    const todays = state.schedules.filter((s) => s.date === t && !scheduleEnded(s)).sort((a, b) => a.start.localeCompare(b.start));
    if (todays.length === 1) return playView(todays[0].id, tab);
    // 지난 일정 결과는 최근 7일만 (v1.13.4~)
    const from = addDays(t, -7);
    const recent = state.schedules.filter((s) => s.date >= from && s.date <= t && scheduleEnded(s)).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
    const item = (s) => h('a', { class: 'link-row', href: scheduleEnded(s) ? `#/play/${s.id}/done` : `#/play/${s.id}` }, h('span', {}, h('strong', {}, fmtDate(s.date)), h('br'), h('span', { class: 'muted small' }, `${s.start}–${s.end} · ${s.venue}`)), h('span', { class: 'muted' }, scheduleEnded(s) ? `${matchesOf(s.id).filter((m) => m.status === 'done').length}경기 ›` : `${attendanceOf(s.id).length}명 ›`));
    return h(
      'div',
      { class: 'page' },
      pageHead('경기', 'Match Day'),
      todays.length
        ? h('section', { class: 'block' }, h('h2', {}, '오늘 일정을 선택하세요'), todays.map(item))
        : empty('지금 진행 중인 일정이 없어요', h('a', { class: 'btn primary', href: '#/week' }, '일정 보기')),
      recent.length > 0 && h('section', { class: 'block' }, h('h2', {}, '지난 일정 결과'), h('p', { class: 'muted small' }, '최근 일주일'), recent.map(item)),
      featureOn('analysis') && h('nav', { class: 'menu' }, h('a', { class: 'link-row', href: '#/analysis' }, h('span', {}, '🎥 영상 분석'), h('span', { class: 'muted' }, `${state.analyses.filter((a) => a.status === 'done').length}개 ›`)))
    );
  }

  const s = scheduleById(sid);
  if (!s) return h('div', { class: 'page' }, empty('없는 일정이에요'));
  cleanQueue(s);
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
    h('div', { class: 'sticky-bar' }, h('nav', { class: 'seg' }, tabs.map(([k, l]) => h('a', { class: k === tab ? 'on' : '', href: `#/play/${s.id}/${k}` }, l, k === 'done' ? h('small', {}, ` ${matchesOf(s.id).filter((m) => m.status === 'done').length}`) : null)))),
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
  const mine = matchesOf(a.scheduleId).filter((m) => [...m.teamA, ...m.teamB].includes(a.playerId));
  // 실제로 뛴(진행 중 · 끝난) 경기가 있을 때만 막음. 다음 경기(대진표)에만 있으면 풀 수 있음 (v1.27.9~)
  if (!v && mine.some((m) => m.status !== 'queued')) return toast('경기 기록이 있어 해제할 수 없어요');
  await put('attendance', { ...a, arrived: v, left: v ? a.left : false, arrivedBy: me().id });
  if (!v && mine.length) toast(`다음 경기 ${mine.length}개에 들어 있어요. 대진 탭에서 수정하거나 '남은 대진표 다시 짜기'를 눌러 주세요`);
}
async function setLeft(a, v) {
  if (!requireLogin()) return;
  await put('attendance', { ...a, left: v });
  const n = queueOf(matchesOf(a.scheduleId)).filter((m) => ids(m).includes(a.playerId)).length;
  if (v && n) toast(`다음 경기 ${n}개에 들어 있어요. 대진 탭에서 '남은 대진표 다시 짜기'를 눌러 주세요`);
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
  const queued = queueOf(ms);
  const busy = new Set(playing.flatMap((m) => [...m.teamA, ...m.teamB]));
  const here = att.filter((a) => a.arrived && !a.left).map((a) => a.playerId);
  const pool = here.filter((id) => !busy.has(id));
  const freeCourts = courts.filter((c) => !playing.some((m) => m.court === c));
  const p = prefs.get();
  const per = p.format === 'singles' ? 2 : 4;
  const genders = genderMap();
  // 대진표는 도착한 사람 전체 · 코트 전체 기준으로 짬 (지금 경기 중인 사람은 다음 경기부터)
  const cap = capacity({ pool: here, courts, format: p.format, genders });
  const poolM = pool.filter((id) => genders.get(id) === 'M').length;
  const poolF = pool.filter((id) => genders.get(id) === 'F').length;
  const noGender = pool.filter((id) => !genders.get(id)).length;
  const gamesToday = new Map();
  ms.filter((m) => m.status !== 'queued').forEach((m) => [...m.teamA, ...m.teamB].forEach((id) => gamesToday.set(id, (gamesToday.get(id) || 0) + 1)));
  // 대진표에 잡힌(예정) 경기 수 (v1.27.9~)
  const planned = new Map();
  queued.forEach((m) => ids(m).forEach((id) => planned.set(id, (planned.get(id) || 0) + 1)));

  const segBtn = (key, val, label) =>
    h('button', { class: p[key] === val ? 'on' : '', onclick: () => { prefs.set({ [key]: val }); window.dispatchEvent(new Event('rerender')); } }, label);

  const courtCards = courts.map((c) => {
    const m = playing.find((x) => x.court === c);
    if (!m) {
      // 다음 경기 선수가 아직 다른 코트에서 뛰는 중이라 기다리는 코트 → 쉬는 사람으로 바로 한 경기 (v1.27.8~)
      const ready = queued.some((q) => ids(q).every((id) => here.includes(id) && !busy.has(id)));
      const now = !drawLocked(s) && !ready && capacity({ pool, courts: [c], format: p.format, genders }) > 0;
      return h(
        'div',
        { class: 'court empty-court' },
        h('span', { class: 'court-no' }, `코트 ${c}`),
        h('span', { class: 'muted' }, queued.length && !ready ? '다음 경기 선수가 경기 중이라 기다리는 중' : '비어 있음'),
        now && h('button', { class: 'btn small ghost', onclick: () => fillNow(s, c, pool, p) }, '쉬는 사람으로 바로 한 경기')
      );
    }
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
        !drawLocked(s) && h('button', { class: 'btn ghost', onclick: () => manualSheet(s, pool, courts, p, m) }, '수정'),
        !drawLocked(s) && h('button', { class: 'btn ghost', onclick: () => cancelMatch(m) }, '취소')
      )
    );
  });

  const canAuto = cap > 0;
  const autoLabel = canAuto
    ? `${FORMAT_LABEL[p.format]} 대진표 ${PLAN_GAMES}경기 자동 만들기${queued.length ? ' (뒤에 추가)' : ''}`
    : p.format === 'mixed'
        ? '남 · 여가 섞여 4명 이상(남 1명 · 여 1명 이상) 필요해요'
        : p.format === 'doubles'
          ? '같은 성별 4명(남 4명 또는 여 4명) 이상 필요해요'
          : `${per}명 이상 도착해야 해요`;
  const ended = scheduleEnded(s);
  return h(
    'div',
    { class: 'stack' },
    ended && endedNotice(s, playing),
    !drawLocked(s) && h(
      'section',
      { class: 'block' },
      h('div', { class: 'row between' }, h('h2', {}, '대진 만들기'), h('button', { class: 'link small', onclick: guideSheet }, '처음이세요? 만드는 순서 ›')),
      h('div', { class: 'summary3' }, sum('대진 가능', pool.length + '명'), sum('빈 코트', `${freeCourts.length}/${courts.length}`), sum('진행 중', playing.length + '경기')),
      h('div', { class: 'seg small' }, segBtn('format', 'doubles', '복식'), segBtn('format', 'mixed', '혼복'), segBtn('format', 'singles', '단식')),
      p.format !== 'singles' && h('p', { class: 'muted small' }, `${p.format === 'mixed' ? '혼복: 남3·여1 / 남2·여2 / 남1·여3' : '복식: 남 2:2 · 여 2:2 (성별 안 섞음)'} · 대기 남 ${poolM} · 여 ${poolF}${noGender ? ` · 성별 미입력 ${noGender}명 제외` : ''}`),
      // 복식인데 한 성별이 1~3명뿐이면 그 사람들은 자동 대진에 못 들어감 → 미리 알림
      p.format === 'doubles' &&
        (() => {
          const cnt = (g) => here.filter((id) => genders.get(id) === g).length;
          const few = [['남', cnt('M')], ['여', cnt('F')]].filter(([, c]) => c > 0 && c < 4);
          return few.length ? h('p', { class: 'warn small' }, `${few.map(([g, c]) => `${g} ${c}명`).join(' · ')}은 같은 성별 4명이 안 돼 복식 자동 대진에 못 들어가요. 혼복으로 바꾸거나 직접 대진으로 넣어 주세요`) : null;
        })(),
      h('div', { class: 'seg small' }, Object.entries(MATCH_TYPES).map(([k, v]) => segBtn('type', k, v.label))),
      h('p', { class: 'muted small' }, MATCH_TYPES[p.type].desc),
      h('button', { class: 'btn primary block', disabled: !canAuto, onclick: () => autoDraw(s, p) }, autoLabel),
      h('button', { class: 'btn ghost block', onclick: () => manualSheet(s, pool, freeCourts.length ? freeCourts : courts, p) }, '직접 대진 만들기')
    ),
    playing.length > 0 && h('div', { class: 'row end' }, shareButton('대진 카톡 공유', () => drawText(s))),
    h('div', { class: 'courts' }, drawLocked(s) && !playing.length ? h('p', { class: 'muted center' }, '진행 중인 경기가 없어요. 결과 탭에서 기록을 확인하세요.') : courtCards),
    queued.length > 0 && queueBlock(s, queued, { playing, busy, here, courts, pool, p, gamesToday, planned }),
    !drawLocked(s) && h(
      'section',
      { class: 'block' },
      h('h2', {}, `대기 ${pool.length}명`),
      pool.length
        ? h('div', { class: 'wait' }, pool.sort((a, b) => (gamesToday.get(a) || 0) - (gamesToday.get(b) || 0)).map((id) => h('span', { class: 'chip' }, person(id).name, h('small', {}, ` ${gamesToday.get(id) || 0}경기${planned.get(id) ? ` +${planned.get(id)}예정` : ''}`))))
        : h('p', { class: 'muted' }, att.some((a) => a.arrived) ? '모두 경기 중이에요' : '출석 탭에서 도착 체크를 먼저 해주세요', !att.some((a) => a.arrived) && h('a', { class: 'link', href: `#/play/${s.id}/att` }, ' 출석하러 가기 ›'))
    )
  );
}

// 처음 쓰는 회원을 위한 '매치 만드는 순서' 안내 (v1.25.0~)
const GUIDE = [
  ['출석 체크', '위 \'출석\' 탭에서 코트에 온 사람을 \'도착\'으로 표시해요. 도착한 사람만 대진에 들어가요. 게스트도 여기서 추가해요.'],
  ['방식 고르기', '복식(남 2:2 · 여 2:2, 성별 안 섞음) · 혼복(남3·여1 / 남2·여2 / 남1·여3) · 단식 중에서 골라요.'],
  ['경기 유형 고르기', '코인전(승패 · 레이팅 · 코인) · 공식전(승패 · 레이팅) · 친선전(기록 없음). 코인이 1개 미만이거나 게스트가 있으면 코인전은 공식전으로 바뀌어요.'],
  ['대진 만들기', '\'대진표 8경기 자동 만들기\'를 누르면 비슷한 실력끼리, 오늘 덜 뛴 사람부터 8경기를 미리 짜요. 빈 코트엔 바로 시작하고 나머지는 \'다음 경기\'로 줄 서요. 마음에 안 들면 \'수정\'으로 선수를 바꾸고, 원하는 짝은 \'직접 대진 만들기\'로 골라요.'],
  ['점수 입력', '경기가 끝나면 코트 카드의 \'점수 입력\'을 눌러 게임 수(예: 6:4)를 넣어요. 선수들은 다시 대기 명단으로 돌아가요.'],
  ['다음 경기', '점수를 넣으면 그 코트에서 다음 경기가 자동으로 시작돼요. 대진표를 다 쓰면 4번을 다시 눌러요. 오늘 기록은 \'결과\' 탭에서 볼 수 있어요.'],
];
function guideSheet() {
  sheet('매치 만드는 순서', (close) =>
    h(
      'div',
      { class: 'stack' },
      h('ol', { class: 'guide-list' }, GUIDE.map(([t, d], i) => h('li', {}, h('span', { class: 'guide-no' }, i + 1), h('div', {}, h('strong', {}, t), h('p', { class: 'muted small' }, d))))),
      h('p', { class: 'muted small' }, `점수는 경기한 사람이 직접 입력하고, 일정이 끝난 뒤 ${RULES.recordGraceMin}분까지 고칠 수 있어요.`),
      h('button', { class: 'btn primary block', onclick: close }, '알겠어요')
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

// 자동 대진표 (v1.27.8~): 한 번에 PLAN_GAMES경기를 미리 짬
//   빈 코트 · 쉬는 사람으로 바로 시작할 경기 → 'playing', 나머지는 순서대로 'queued'(다음 경기)
//   코트가 비면(점수 입력 · 취소) 다음 경기 중 선수가 모두 쉬고 있는 첫 경기를 그 코트에서 자동 시작
export const PLAN_GAMES = 8;
// 업데이트 직후 예전 db.js가 섞여 있으면(claim 없음) 그냥 저장
const claim = (col, id, fn, offline) => (db.claim ? db.claim(col, id, fn, offline) : put(col, offline).then(() => true));
const ids = (m) => [...m.teamA, ...m.teamB];
const queueOf = (ms) => ms.filter((m) => m.status === 'queued').sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || (a.createdAt || 0) - (b.createdAt || 0));

// 코인전인데 게스트 · 코인 부족이면 공식전으로
function fixType(type, teamIds, notes, where) {
  if (type !== 'coin') return type;
  const why = coinBlockReason(teamIds);
  if (!why) return type;
  notes?.push(`${where}: ${why} → 공식전`);
  return 'official';
}

// replace = '남은 대진표 다시 짜기': 진행 중 경기는 두고 다음 경기만 지금 인원으로 새로 (v1.27.9~)
async function autoDraw(s, p, replace = false) {
  if (!requireLogin()) return;
  if (drawLocked(s)) return toast('경기 시간이 끝나 새 대진을 만들 수 없어요');
  const old = queueOf(matchesOf(s.id));
  if (replace) {
    if (!(await confirmSheet('남은 대진표 다시 짜기', `다음 경기 ${old.length}개를 지금 도착한 사람으로 새로 짤까요?\n진행 중인 경기는 그대로예요.`, '다시 짜기'))) return;
  } else if (old.length && !(await confirmSheet('대진표 더 만들기', `아직 다음 경기가 ${old.length}개 남아 있어요.\n그 뒤에 ${PLAN_GAMES}경기를 더 만들까요?`, '더 만들기'))) return;
  // 여러 사람이 동시에 누르면 한 번만 (일정 문서에 15초 잠금, 내가 건 잠금은 통과)
  const at = Date.now();
  const by = me().id;
  const got = await claim('schedules', s.id, (cur) => (cur && !(cur.planAt > at - 15000 && cur.planBy !== by) ? { ...cur, planAt: at, planBy: by } : null), { ...s, planAt: at, planBy: by });
  if (!got) return toast('방금 다른 사람이 대진표를 만들었어요. 잠시 뒤 다시 확인해 주세요');
  const courts = courtsOf(s).length ? courtsOf(s) : ['1'];
  const ms = matchesOf(s.id).filter((m) => !(replace && m.status === 'queued'));
  const playing = ms.filter((m) => m.status === 'playing');
  const here = attendanceOf(s.id).filter((a) => a.arrived && !a.left).map((a) => a.playerId);
  const genders = genderMap();
  const ratings = ratingMap(here);
  const queued = queueOf(ms);
  const total = replace ? Math.max(old.length, 1) : PLAN_GAMES;
  let seq = queued.length ? (queued[queued.length - 1].seq ?? 0) + 1 : 0;
  const sim = [...ms];
  const out = [];
  const notes = [];
  let t = Date.now();
  // 코트 흐름을 흉내 내며 한 경기씩 짬: 코트가 하나 비면(가장 먼저 시작한 경기가 끝나면) 그때 다른 코트에서
  //   뛰고 있을 사람을 빼고 다음 경기를 고름 → 한 코트가 먼저 끝나도 다음 경기 선수가 대부분 쉬고 있음
  //   방금 끝난 경기의 선수는 연속 출전 벌점(justPlayed)으로 되도록 쉬게 함
  const active = [...[...playing].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)), ...queued].slice(-courts.length);
  const freeNow = queued.length ? [] : courts.filter((c) => !playing.some((m) => m.court === c));
  for (let guard = 0; out.length < total && guard < total * 4; guard++) {
    let court;
    let now = false;
    let justPlayed = new Set();
    if (freeNow.length) {
      court = freeNow.shift();
      now = true;
    } else if (active.length) {
      const fin = active.shift();
      court = fin.court || courts[0];
      justPlayed = new Set(ids(fin));
    } else court = courts[0];
    const busyNow = new Set(active.flatMap(ids));
    const plan = generate({ pool: here.filter((id) => !busyNow.has(id)), courts: [court], format: p.format, ratings, todayMatches: sim, genders, justPlayed });
    if (!plan.length) {
      if (!active.length && !freeNow.length) break;
      continue;
    }
    const x = plan[0];
    const m = newMatch(s, court, p.format, p.type, x.teamA, x.teamB, t++);
    if (now) m.type = fixType(p.type, ids(m), notes, `코트 ${court}`);
    else Object.assign(m, { status: 'queued', seq: seq++ });
    out.push(m);
    sim.push(m);
    active.push(m);
  }
  if (!out.length) return toast('대진을 만들 수 없어요');
  await batch([...(replace ? old.map((m) => ({ type: 'del', col: 'matches', id: m.id })) : []), ...out.map((doc) => ({ type: 'put', col: 'matches', doc }))]);
  const now = out.filter((m) => m.status === 'playing').length;
  toast(notes.length ? notes.join(' / ') : `${out.length}경기 대진표 ${replace ? '다시 짰어요' : '완료'}${now ? ` · ${now}경기 바로 시작` : ''}`);
}

// 코트가 비었을 때 다음 경기 시작. freed = 방금 끝난(취소된) 경기 id — 저장 반영 전이라 직접 뺌
//   방금 빈 코트부터, 그 밖에 비어서 기다리던 코트까지 모두 채움 (다음 경기 선수가 다른 코트에서 뛰는 중이면
//   그 코트는 기다렸다가, 그 경기가 끝날 때 같이 시작)
export async function startNext(s, court, freed) {
  if (!s) return;
  const ms = matchesOf(s.id).filter((m) => m.id !== freed);
  const playing = ms.filter((m) => m.status === 'playing');
  const busy = new Set(playing.flatMap(ids));
  const here = new Set(attendanceOf(s.id).filter((a) => a.arrived && !a.left).map((a) => a.playerId));
  const all = courtsOf(s).length ? courtsOf(s) : ['1'];
  const free = [court, ...all.filter((c) => c !== court)].filter((c) => c && !playing.some((m) => m.court === c));
  const queue = queueOf(ms);
  const used = new Set();
  const notes = [];
  const said = [];
  for (const c of free) {
    for (const next of queue) {
      if (used.has(next.id) || !ids(next).every((id) => here.has(id) && !busy.has(id))) continue;
      used.add(next.id);
      if (!(await claimStart(next, c, notes))) continue; // 다른 기기가 먼저 시작함 → 그다음 경기
      ids(next).forEach((id) => busy.add(id));
      said.push(`코트 ${c} ${teamText(next.teamA)} vs ${teamText(next.teamB)}`);
      break;
    }
  }
  if (!said.length) {
    if (queue.length) toast('다음 경기 선수가 아직 경기 중이에요. 끝나면 같이 시작돼요');
    return;
  }
  toast(`다음 경기 시작 · ${said.join(' / ')}${notes.length ? ' (' + notes.join(', ') + ')' : ''}`);
}

// 다음 경기 하나를 코트에서 시작. 서버의 최신 문서가 아직 'queued'일 때만 (여러 기기 동시 시작 방지, v1.27.9~)
async function claimStart(m, court, notes) {
  const type = fixType(m.type, ids(m), notes, `코트 ${court}`);
  const doc = { ...m, status: 'playing', court, type, createdAt: Date.now() };
  return claim('matches', m.id, (cur) => (cur && cur.status === 'queued' ? { ...cur, status: 'playing', court, type, createdAt: doc.createdAt } : null), doc);
}
const teamText = (t) => t.map((id) => person(id).name).join('·');

// 빈 코트 하나를 지금 쉬는 사람으로 바로 채움 (대진표와 따로)
async function fillNow(s, court, pool, p) {
  if (!requireLogin()) return;
  const plan = generate({ pool, courts: [court], format: p.format, ratings: ratingMap(pool), todayMatches: matchesOf(s.id), genders: genderMap() });
  if (!plan.length) return toast('대진을 만들 수 없어요');
  const notes = [];
  const x = plan[0];
  const m = newMatch(s, court, p.format, p.type, x.teamA, x.teamB);
  m.type = fixType(p.type, ids(m), notes, `코트 ${court}`);
  await put('matches', m);
  toast(notes[0] || `코트 ${court} 시작 · ${teamText(x.teamA)} vs ${teamText(x.teamB)}`);
}

// 끝난 일정(종료 + 기록 마감 시간 지남)에 남은 다음 경기는 지움 (v1.27.9~, 화면을 연 사람 기기에서 한 번)
const cleaned = new Set();
function cleanQueue(s) {
  if (cleaned.has(s.id) || !me()) return;
  if (Date.now() < scheduleTime(s, 'end') + RULES.recordGraceMin * 60000) return;
  cleaned.add(s.id);
  const left = matchesOf(s.id).filter((m) => m.status === 'queued');
  if (left.length) batch(left.map((m) => ({ type: 'del', col: 'matches', id: m.id }))).catch((e) => console.warn('cleanQueue', e));
}

// 다음 경기 목록
function queueBlock(s, queued, { playing, busy, here, courts, pool, p, gamesToday, planned }) {
  const free = courts.filter((c) => !playing.some((m) => m.court === c));
  const hereSet = new Set(here);
  const locked = drawLocked(s);
  return h(
    'section',
    { class: 'block' },
    h('div', { class: 'row between' }, h('h2', {}, `다음 경기 ${queued.length}`), h('span', { class: 'muted small' }, '코트가 비면 순서대로 자동 시작')),
    !locked && h('button', { class: 'btn ghost block small', onclick: () => autoDraw(s, p, true) }, '↻ 남은 대진표 다시 짜기 (늦게 온 · 귀가한 사람 반영)'),
    h(
      'ol',
      { class: 'queue-list' },
      queued.map((m, i) => {
        const gone = ids(m).filter((id) => !hereSet.has(id));
        const ready = !gone.length && ids(m).every((id) => !busy.has(id));
        return h(
          'li',
          { class: 'queue-row' },
          h('span', { class: 'queue-no' }, i + 1),
          h(
            'div',
            { class: 'grow' },
            h('div', { class: 'court-teams' }, h('div', {}, teamNames(m.teamA)), h('span', { class: 'vs' }, 'vs'), h('div', {}, teamNames(m.teamB))),
            h('div', { class: 'muted small' }, `${MATCH_TYPES[m.type].label} · ${FORMAT_LABEL[m.format] || '복식'} · 평균 ${avgR(m.teamA)} : ${avgR(m.teamB)}`),
            gone.length > 0 && h('p', { class: 'warn small' }, `${gone.map((id) => person(id).name).join(', ')} 귀가 · 미도착 → 수정하거나 다시 짜 주세요`)
          ),
          !locked &&
            h(
              'div',
              { class: 'queue-btns' },
              ready && free.length > 0 && h('button', { class: 'btn small primary', onclick: () => startQueued(s, m, free[0]) }, '시작'),
              h('button', { class: 'btn small ghost', onclick: () => manualSheet(s, pool, courts, p, m) }, '수정'),
              h('button', { class: 'btn small ghost', onclick: () => dropQueued(m) }, '빼기')
            )
        );
      })
    ),
    // 사람별 오늘 경기 수 = 한 경기(진행 중 포함) + 예정 → 공평하게 짜였는지 한눈에 (v1.27.9~)
    h('h3', { class: 'eyebrow' }, '사람별 오늘 경기 수 (한 경기 + 예정)'),
    h(
      'div',
      { class: 'wait' },
      [...here]
        .map((id) => ({ id, done: gamesToday.get(id) || 0, plan: planned.get(id) || 0 }))
        .sort((a, b) => b.done + b.plan - (a.done + a.plan) || person(a.id).name.localeCompare(person(b.id).name, 'ko'))
        .map((x) => h('span', { class: 'chip' }, person(x.id).name, h('small', {}, ` ${x.done + x.plan} (${x.done}+${x.plan})`)))
    )
  );
}

async function startQueued(s, m, court) {
  if (!requireLogin()) return;
  const notes = [];
  if (!(await claimStart(m, court, notes))) return toast('이미 다른 기기에서 시작했어요');
  if (notes.length) toast(notes[0]);
}

async function dropQueued(m) {
  if (!requireLogin()) return;
  const ok = await confirmSheet('다음 경기 빼기', `${teamText(m.teamA)} vs ${teamText(m.teamB)}\n이 경기를 대진표에서 뺄까요?`, '빼기', true);
  if (ok) await remove('matches', m.id);
}

function newMatch(s, court, format, type, teamA, teamB, createdAt = Date.now()) {
  return { id: uid('m_'), scheduleId: s.id, date: s.date, court, format, type, teamA, teamB, scoreA: null, scoreB: null, status: 'playing', createdAt, createdBy: me().id, history: [] };
}

// edit = 이미 만든 경기(진행 중 · 다음 경기)를 고칠 때 (v1.27.8~)
function manualSheet(s, pool, courts, p, edit) {
  if (!requireLogin(() => manualSheet(s, pool, courts, p, edit))) return;
  if (drawLocked(s)) return toast('경기 시간이 끝나 새 대진을 만들 수 없어요');
  const all = attendanceOf(s.id).filter((a) => a.arrived).map((a) => a.playerId);
  // 고칠 경기의 선수는 (귀가했더라도) 목록에 남김
  if (edit) ids(edit).forEach((id) => !all.includes(id) && all.push(id));
  if (all.length < 2) return toast('도착한 사람이 2명 이상이어야 해요');
  const queuedEdit = edit?.status === 'queued';
  const free = new Set(edit ? [...pool, ...ids(edit)] : pool);
  // 진행 중 경기를 고칠 땐 다른 경기가 쓰는 코트는 뺌
  const courtList = edit && !queuedEdit
    ? (courtsOf(s).length ? courtsOf(s) : ['1']).filter((c) => c === edit.court || !matchesOf(s.id).some((m) => m.status === 'playing' && m.court === c))
    : courts;
  sheet(edit ? (queuedEdit ? '다음 경기 수정' : `코트 ${edit.court} 대진 수정`) : '직접 대진', (close) => {
    const label = (id) => `${person(id).name}${person(id).gender ? ` (${person(id).gender === 'M' ? '남' : '여'})` : ''}${queuedEdit || free.has(id) ? '' : ' · 경기중/귀가'}`;
    const opts = [['', '선택'], ...all.map((id) => [id, label(id)])];
    const court = select({ class: 'input' }, courtList.map((c) => [c, `코트 ${c}`]), edit?.court && courtList.includes(edit.court) ? edit.court : courtList[0]);
    const format = select({ class: 'input' }, Object.entries(FORMAT_LABEL), edit?.format || p.format);
    const type = select({ class: 'input' }, Object.entries(MATCH_TYPES).map(([k, v]) => [k, v.label]), edit?.type || p.type);
    const pre = edit ? (edit.teamA.length === 1 ? [edit.teamA[0], '', edit.teamB[0], ''] : [...edit.teamA, ...edit.teamB]) : ['', '', '', ''];
    const slots = pre.map((v) => select({ class: 'input' }, opts, v));
    const b2 = h('div', { class: 'grid2' }, h('div', { class: 'team-col' }, h('p', { class: 'eyebrow' }, 'Team A'), slots[0], slots[1]), h('div', { class: 'team-col' }, h('p', { class: 'eyebrow' }, 'Team B'), slots[2], slots[3]));
    // 다른 칸에서 이미 고른 선수는 회색 · 선택 불가 (v1.27.8~, 예전엔 목록에서 뺌)
    //   목록 순서가 그대로라 찾기 쉬움. 단식으로 바꾸면 숨은 칸(2 · 4번)의 선수는 다시 고를 수 있음
    const refill = () => {
      const single = format.value === 'singles';
      const used = (k) => new Set(slots.filter((x, j) => j !== k && x.value && !(single && (j === 1 || j === 3))).map((x) => x.value));
      slots.forEach((el, k) => {
        const cur = el.value;
        const taken = used(k);
        el.replaceChildren(...opts.map(([v, l]) => h('option', { value: v, selected: v === cur && !taken.has(v), disabled: !!v && taken.has(v), class: v && taken.has(v) ? 'taken' : '' }, v && taken.has(v) ? `${l} · 선택됨` : l)));
        el.value = taken.has(cur) ? '' : cur;
      });
    };
    slots.forEach((el) => el.addEventListener('change', refill));
    const sync = () => {
      const single = format.value === 'singles';
      slots[1].style.display = slots[3].style.display = single ? 'none' : '';
      refill();
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
      // 성별 규칙 (v1.28.0~): 복식 = 남 2:2 · 여 2:2, 혼복 = 남3·여1(남남 vs 남녀) / 남2·여2(남녀 vs 남녀) / 남1·여3(남녀 vs 여여)
      //   성별 모르는 사람(미입력 게스트)이 있으면 검사하지 않음
      const gm = new Map(ids.map((id) => [id, person(id).gender]));
      if (!single && ids.every((id) => gm.get(id) === 'M' || gm.get(id) === 'F')) {
        if (format.value === 'doubles' && !groupOk(ids, 'doubles', gm)) return toast('복식은 같은 성별끼리만 (남 2:2 · 여 2:2). 섞이면 혼복으로 골라 주세요');
        if (format.value === 'mixed') {
          if (!groupOk(ids, 'mixed', gm)) return toast('혼복은 남 · 여가 섞여야 해요. 같은 성별이면 복식으로 골라 주세요');
          const same = (x, y) => x.length === y.length && x.every((v) => y.includes(v));
          const ok = splitsOf(ids, 'mixed', gm).some(([x, y]) => (same(x, A) && same(y, B)) || (same(x, B) && same(y, A)));
          if (!ok) return toast(ids.filter((id) => gm.get(id) === 'M').length === 2 ? '남2 · 여2 혼복은 팀마다 남 1명 · 여 1명이에요' : '혼복은 한 팀에 남 · 여가 1명씩, 다른 팀이 같은 성별 2명이에요');
        }
      }
      let t = type.value;
      if (t === 'coin' && !queuedEdit) {
        const why = coinBlockReason(ids);
        if (why) {
          t = 'official';
          toast(`${why} → 공식전으로 ${edit ? '저장' : '생성'}`);
        }
      }
      if (edit) {
        await put('matches', { ...edit, court: queuedEdit ? edit.court : court.value, format: format.value, type: t, teamA: A, teamB: B, history: [...(edit.history || []), { by: me().id, at: Date.now(), edit: true }] });
        toast('대진을 고쳤어요');
      } else {
        // 고른 코트에 경기가 진행 중이거나 쉬지 않는 선수가 있으면 '다음 경기'로 줄 세움
        const ms = matchesOf(s.id);
        const playing = ms.filter((m) => m.status === 'playing');
        const wait = playing.some((m) => m.court === court.value) || ids.some((id) => playing.some((m) => [...m.teamA, ...m.teamB].includes(id)));
        const doc = newMatch(s, court.value, format.value, t, A, B);
        if (wait) {
          const q = queueOf(ms);
          Object.assign(doc, { status: 'queued', seq: q.length ? (q[q.length - 1].seq ?? 0) + 1 : 0 });
          toast('코트 · 선수가 경기 중이라 다음 경기로 넣었어요');
        }
        await put('matches', doc);
      }
      close();
    };
    return h(
      'div',
      { class: 'stack' },
      h('div', { class: 'grid2' }, queuedEdit ? null : field('코트', court), field('방식', format)),
      field('경기 유형', type),
      b2,
      h('button', { class: 'btn primary block', onclick: save }, edit ? '수정 저장' : '대진 생성')
    );
  });
}

async function cancelMatch(m) {
  if (!requireLogin()) return;
  const ok = await confirmSheet('대진 취소', `코트 ${m.court} 대진을 취소할까요?\n선수들은 대기 명단으로 돌아가요.`, '대진 취소', true);
  if (!ok) return;
  await remove('matches', m.id);
  await startNext(scheduleById(m.scheduleId), m.court, m.id);
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
      // 코트가 비었으니 다음 경기 시작 (v1.27.8~)
      if (!done) await startNext(scheduleById(m.scheduleId), m.court, m.id);
    };
    const undo = async () => {
      const ok = await confirmSheet('결과 취소', '점수를 지우고 진행 중 경기로 되돌릴까요?\n코인·레이팅도 자동으로 원래대로 돌아가요.', '되돌리기', true);
      if (!ok) return;
      // 그 코트에 이미 다음 경기가 시작됐으면 이 경기는 다음 경기 맨 앞으로
      const taken = matchesOf(m.scheduleId).some((x) => x.id !== m.id && x.status === 'playing' && x.court === m.court);
      const first = queueOf(matchesOf(m.scheduleId))[0];
      const back = taken ? { status: 'queued', seq: (first?.seq ?? 0) - 1 } : { status: 'playing' };
      await put('matches', { ...m, ...back, scoreA: null, scoreB: null, history: [...(m.history || []), { by: me().id, at: Date.now(), undo: true }] });
      if (taken) toast(`코트 ${m.court}에 다음 경기가 진행 중이라 이 경기는 '다음 경기' 맨 앞으로 갔어요`);
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
