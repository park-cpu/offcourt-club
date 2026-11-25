import { h, sheet, toast, field, select, go, fmtNum } from '../ui.js';
import { state, me, isAdmin, session, scheduleById, recordOpen, hashPin, activePlayers, person, isGuestId, derived, fmtDate, settings } from '../store.js';
import { MATCH_TYPES, winnerSide, coinStake } from '../rules.js';
import { put, uid } from '../db.js';

// ── 로그인 ─────────────────────────────────────────────
export function loginSheet(onDone) {
  sheet('로그인', (close) => {
    const players = activePlayers();
    const sel = select({ class: 'input' }, [['', '이름 선택'], ...players.map((p) => [p.id, p.name])], '');
    const pin = h('input', { class: 'input', type: 'password', inputMode: 'numeric', maxLength: 4, placeholder: '숫자 4자리', autocomplete: 'off' });
    const submit = async () => {
      const p = players.find((x) => x.id === sel.value);
      if (!p) return toast('이름을 선택해 주세요');
      if ((await hashPin(pin.value, p.id)) !== p.pinHash) return toast('PIN이 맞지 않아요');
      session.set(p.id);
      close();
      toast(`${p.name}님, 반가워요`);
      onDone?.();
      window.dispatchEvent(new Event('rerender'));
    };
    pin.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    return h(
      'div',
      { class: 'stack' },
      field('이름', sel),
      field('PIN', pin, 'PIN을 잊었다면 관리자에게 초기화를 요청하세요'),
      h('button', { class: 'btn primary block', onclick: submit }, '로그인'),
      h('p', { class: 'muted small center' }, '회원 등록은 관리자에게 요청해 주세요')
    );
  });
}

// 로그인한 회원만 볼 수 있는 화면 (방문자에게는 일정만 공개)
export function membersOnly(title) {
  return h(
    'div',
    { class: 'page' },
    pageHead(title || 'Offcourt', 'Members'),
    h('div', { class: 'empty' }, h('p', {}, '회원만 볼 수 있어요'), h('p', { class: 'muted small' }, '일정은 로그인 없이 볼 수 있어요.'), h('div', { class: 'row gap center' }, h('a', { class: 'btn ghost', href: '#/week' }, '일정 보기'), h('button', { class: 'btn primary', onclick: () => loginSheet() }, '로그인')))
  );
}

export function requireLogin(next) {
  if (me()) return true;
  loginSheet(next);
  return false;
}

// ── 회원 등록/수정 폼 (본인 가입 · 관리자 공용) ─────────────
export function playerForm(existing, { admin = false, onSaved } = {}) {
  const p = existing || {};
  const name = h('input', { class: 'input', value: p.name || '', placeholder: '홍길동', maxLength: 12 });
  const since = h('input', { class: 'input', type: 'month', value: p.since || '' });
  // NTRP는 레이팅 시작점이라 관리자만 수정 (회원 본인은 보기만)
  const canNtrp = admin || isAdmin();
  const ntrp = h('input', { class: 'input', type: 'number', step: '0.5', min: '1', max: '7', value: p.ntrp ?? 2.5, disabled: !canNtrp });
  const pin = h('input', { class: 'input', type: 'password', inputMode: 'numeric', maxLength: 4, placeholder: existing ? '변경할 때만 입력' : '숫자 4자리' });
  const active = h('input', { type: 'checkbox', checked: p.active !== false });
  const gender = genderPicker(p.gender);
  const save = async () => {
    const n = name.value.trim();
    if (!n) return toast('이름을 입력해 주세요');
    if (state.players.some((x) => x.name === n && x.id !== p.id)) return toast('같은 이름이 이미 있어요');
    if (!gender.value()) return toast('성별을 선택해 주세요');
    if (!existing && !/^\d{4}$/.test(pin.value)) return toast('PIN은 숫자 4자리예요');
    if (pin.value && !/^\d{4}$/.test(pin.value)) return toast('PIN은 숫자 4자리예요');
    const id = p.id || uid('p_');
    const doc = {
      ...p,
      id,
      name: n,
      since: since.value || '',
      ntrp: canNtrp ? Math.round(Number(ntrp.value || 2.5) * 10) / 10 : p.ntrp,
      gender: gender.value(),
      active: admin ? active.checked : p.active !== false,
      createdAt: p.createdAt || Date.now(),
    };
    if (pin.value) doc.pinHash = await hashPin(pin.value, id);
    await put('players', doc);
    onSaved?.(doc);
  };
  return {
    node: h(
      'div',
      { class: 'stack' },
      field('이름', name),
      field('성별', gender.node, '혼복 대진에 사용'),
      field('테니스 시작 (구력)', since, '처음 레슨/입문한 연·월'),
      field('NTRP', ntrp, canNtrp ? '모르면 2.5 (입문) · 3.0 (랠리 가능) · 3.5 (경기 운영) · 바꾸면 지난 경기까지 레이팅 재계산' : 'NTRP는 레이팅 시작점이라 관리자만 바꿀 수 있어요. 수정이 필요하면 관리자에게 요청해 주세요'),
      field(existing ? 'PIN 변경' : 'PIN (로그인용)', pin),
      admin && existing && h('label', { class: 'check' }, active, ' 활동 중 (해제하면 목록·대진에서 숨김)'),
      h('button', { class: 'btn primary block', onclick: save }, existing ? '저장' : '등록')
    ),
  };
}

// ── 이름 표시 ─────────────────────────────────────────
/** 남/여 세그먼트 선택 */
export function genderPicker(initial) {
  let v = initial || '';
  const node = h('div', { class: 'seg small' });
  const draw = () =>
    node.replaceChildren(
      ...[['M', '남'], ['F', '여']].map(([k, l]) => h('button', { type: 'button', class: v === k ? 'on' : '', onclick: () => { v = k; draw(); } }, l))
    );
  draw();
  return { node, value: () => v };
}

export const FORMAT_LABEL = { doubles: '복식', mixed: '혼복', singles: '단식' };
export const GENDER_LABEL = { M: '남', F: '여' };

export const nameTag = (id) => {
  const p = person(id);
  return h('span', { class: 'pname' }, p.name, isGuestId(id) && h('span', { class: 'tag-guest' }, 'G'));
};

export const teamNames = (ids) => {
  const out = [];
  ids.forEach((id, i) => {
    if (i) out.push(h('span', { class: 'slash' }, ' · '));
    out.push(nameTag(id));
  });
  return out;
};

// 점수 입력 · 기록 수정: 관리자는 언제나, 참가자는 경기 시간 동안(종료 후 여유 시간까지) (v1.13.0~)
export const canRecord = (m) => {
  const u = me();
  if (!u) return false;
  if (isAdmin()) return true;
  return (m.teamA.includes(u.id) || m.teamB.includes(u.id)) && recordOpen(scheduleById(m.scheduleId));
};
export const recordDeniedMsg = (m) => {
  const u = me();
  if (u && (m.teamA.includes(u.id) || m.teamB.includes(u.id))) return '경기 시간이 끝나 관리자만 수정할 수 있어요';
  return '경기 참가자 또는 관리자만 입력할 수 있어요';
};

// ── 경기 카드 ─────────────────────────────────────────
export function matchCard(m, { onEdit, showDate = false } = {}) {
  const w = winnerSide(m);
  const { deltas } = derived();
  const d = deltas.get(m.id);
  const done = m.status === 'done';
  const side = (ids, score, isWin) =>
    h(
      'div',
      { class: 'mside' + (done && isWin ? ' win' : '') + (done && w && !isWin ? ' lose' : '') },
      h('div', { class: 'mnames' }, ids.map((id) => h('div', {}, nameTag(id), d?.has(id) && h('small', { class: 'delta ' + (d.get(id) >= 0 ? 'up' : 'down') }, fmtNum(d.get(id), 1))))),
      done && m.type !== 'friendly' && h('div', { class: 'mscore' }, score)
    );
  const meta = [
    showDate && fmtDate(m.date),
    `코트 ${m.court || '-'}`,
    FORMAT_LABEL[m.format] || '복식',
  ].filter(Boolean);
  let foot = null;
  if (done && m.type === 'coin' && w) foot = `승리팀 각 +${coinStake(m)} · 패배팀 각 −${coinStake(m)} 코인`;
  if (done && m.type === 'friendly') foot = '친선전 · 승패 기록 없음';
  if (done && m.type !== 'friendly' && [...m.teamA, ...m.teamB].some(isGuestId)) foot = '게스트 포함 경기 · 전적·순위 제외';
  return h(
    'div',
    { class: 'mcard' },
    h('div', { class: 'mhead' }, h('span', { class: 'type type-' + m.type }, MATCH_TYPES[m.type].label), h('span', { class: 'muted small' }, meta.join(' · '))),
    h('div', { class: 'mbody' }, side(m.teamA, m.scoreA, w === 'A'), h('div', { class: 'vs' }, 'vs'), side(m.teamB, m.scoreB, w === 'B')),
    foot && h('div', { class: 'mfoot' }, foot),
    m.recordedBy && h('div', { class: 'mfoot muted' }, `기록 ${person(m.recordedBy).name}${m.history?.length > 1 ? ` · 수정 ${m.history.length - 1}회` : ''}`),
    // 영상 분석이 끝난 경기면 바로가기 (v1.15.0~)
    done && (state.analyses || []).some((a) => a.matchId === m.id && a.status === 'done') && h('a', { class: 'btn small ghost', href: `#/analysis/${state.analyses.find((a) => a.matchId === m.id && a.status === 'done').id}` }, '🎥 영상 분석'),
    onEdit && canRecord(m) && h('button', { class: 'btn small ghost', onclick: () => onEdit(m) }, done ? '기록 수정' : '점수 입력')
  );
}

export const pageHead = (title, sub, right) =>
  h('header', { class: 'page-head' }, h('div', {}, sub && h('p', { class: 'eyebrow' }, sub), h('h1', {}, title)), right);

export const backLink = (hash, label = '뒤로') => h('a', { class: 'back', href: hash }, '‹ ', label);

export const linkRow = (label, hash, right) => h('a', { class: 'link-row', href: hash }, h('span', {}, label), h('span', { class: 'muted' }, right ?? '›'));

export { go };
