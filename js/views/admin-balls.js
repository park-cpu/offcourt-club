// ─────────────────────────────────────────────────────────────
// 관리자: 볼 적립 · 주간 미션 설정
//   저장하면 settings.ballRules에 "오늘부터 적용" 버전을 하나 추가 (지난 기록은 그때 규칙 그대로)
// ─────────────────────────────────────────────────────────────
import { h, toast, select, confirmSheet, field } from '../ui.js';
import { state, me, derived, settings, today, weekStart, ballRulesAt, weekRules, fmtShort } from '../store.js';
import { put, remove, batch, uid } from '../db.js';
import { MISSION_KINDS, missionLabel, RULES } from '../rules.js';
import { pageHead, backLink } from './common.js';

const MAX_MISSIONS = 6;

export function ballsAdmin() {
  const now = ballRulesAt(today());
  const draft = {
    attend: now.attend,
    play: now.play,
    win: now.win,
    weekly: weekRules(weekStart(today())).weekly.map((m) => ({ id: m.id, kind: m.kind, goal: m.goal, reward: m.reward })),
  };

  const num = (v, min, onInput) =>
    h('input', { class: 'input num', type: 'number', inputmode: 'numeric', min, value: v, oninput: (e) => onInput(Math.max(min, Math.round(Number(e.target.value) || 0))) });
  const labeled = (label, input) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);

  const list = h('div', { class: 'stack' });
  const renderList = () => {
    list.replaceChildren(
      ...draft.weekly.map((m, i) => {
        const kind = select({ class: 'input' }, MISSION_KINDS, m.kind);
        const title = h('strong', {}, missionLabel(m));
        kind.addEventListener('change', () => {
          m.kind = kind.value;
          title.textContent = missionLabel(m);
        });
        return h(
          'div',
          { class: 'mission-edit' },
          h('div', { class: 'row between' }, title, h('button', { class: 'btn ghost small danger-text', onclick: () => { draft.weekly.splice(i, 1); renderList(); } }, '삭제')),
          h(
            'div',
            { class: 'grid3' },
            labeled('종류', kind),
            labeled('목표 (번)', num(m.goal, 1, (v) => { m.goal = v; title.textContent = missionLabel(m); })),
            labeled('보상 (볼)', num(m.reward, 0, (v) => (m.reward = v)))
          )
        );
      }),
      draft.weekly.length < MAX_MISSIONS
        ? h('button', { class: 'btn ghost block', onclick: () => { draft.weekly.push({ id: uid('ms_'), kind: 'play', goal: 3, reward: 20 }); renderList(); } }, '+ 미션 추가')
        : h('p', { class: 'muted small' }, `미션은 ${MAX_MISSIONS}개까지 만들 수 있어요.`)
    );
  };
  renderList();

  const save = async () => {
    const t = today();
    const ok = await confirmSheet(
      '오늘부터 적용할까요?',
      `${fmtShort(t)}부터 새 규칙으로 볼이 쌓여요.\n· 주간 미션은 이번 주(${fmtShort(weekStart(t))}~)부터 바로 바뀌어요\n· 지난주까지 받은 볼은 그대로예요`,
      '적용'
    );
    if (!ok) return;
    const st = settings();
    const versions = (st.ballRules || []).filter((r) => r.from !== t);
    versions.push({ from: t, attend: draft.attend, play: draft.play, win: draft.win, weekly: draft.weekly.map((m) => ({ ...m })) });
    versions.sort((a, b) => a.from.localeCompare(b.from));
    await put('settings', { ...st, ballRules: versions });
    toast('저장했어요');
  };

  const history = [...(settings().ballRules || [])].sort((a, b) => b.from.localeCompare(a.from));
  const ruleText = (r) => `출석 +${r.attend} · 경기 +${r.play} · 승리 +${r.win} · 미션 ${r.weekly.length}개`;

  return h(
    'div',
    { class: 'page' },
    backLink('#/admin', '관리자'),
    pageHead('볼 지급 · 미션 설정', 'Balls'),
    grantSection(),
    h('p', { class: 'muted small' }, '바꾼 날부터 적용돼요. 지난 기록으로 받은 볼은 바뀌지 않아요. 미션 성공은 출석 · 경기 기록으로 자동 체크돼요.'),
    h(
      'section',
      { class: 'block' },
      h('h2', {}, '기본 적립'),
      h(
        'div',
        { class: 'grid3' },
        labeled('도착 체크', num(draft.attend, 0, (v) => (draft.attend = v))),
        labeled('경기 1번', num(draft.play, 0, (v) => (draft.play = v))),
        labeled('승리 추가', num(draft.win, 0, (v) => (draft.win = v)))
      ),
      h('p', { class: 'muted small' }, '경기 볼은 친선전도 포함, 승리 볼은 친선전 제외예요.')
    ),
    h('section', { class: 'block' }, h('h2', {}, '주간 미션'), h('p', { class: 'muted small' }, '월~일 한 주 동안 목표를 채우면 보상 볼이 자동으로 들어가요.'), list),
    h('button', { class: 'btn primary block', onclick: save }, '저장 (오늘부터 적용)'),
    h(
      'details',
      { class: 'block' },
      h('summary', {}, h('h2', { class: 'inline' }, `변경 기록 ${history.length}개`)),
      history.length
        ? h('ul', { class: 'ledger' }, history.map((r) => h('li', {}, h('span', { class: 'muted small' }, `${fmtShort(r.from)}부터`), h('span', { class: 'grow' }, ruleText(r)))))
        : h('p', { class: 'muted small' }, '아직 바꾼 적 없어요. 처음 규칙을 쓰고 있어요.'),
      history.length > 0 &&
        h('p', { class: 'muted small' }, `처음 규칙: ${ruleText(RULES.balls)} (${RULES.balls.weekly.map((m) => `${missionLabel(m)} +${m.reward}`).join(' · ')})`)
    )
  );
}

// ── 관리자: 회원에게 볼 지급 · 회수 (ballLogs) ──
function grantSection() {
  const { balls } = derived();
  const bal = (id) => balls.bal.get(id) ?? 0;
  const list = state.players.filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const picked = new Set();
  const amount = h('input', { class: 'input', type: 'number', value: 100, step: 10 });
  const reason = h('input', { class: 'input', value: '관리자 지급', maxLength: 30 });
  const chips = list.map((p) =>
    h('button', { class: 'chip big', onclick: (e) => { picked.has(p.id) ? picked.delete(p.id) : picked.add(p.id); e.currentTarget.classList.toggle('on', picked.has(p.id)); } }, p.name, h('small', {}, ` ${bal(p.id)}`))
  );
  const all = () => {
    const on = picked.size < list.length;
    picked.clear();
    if (on) list.forEach((p) => picked.add(p.id));
    chips.forEach((c) => c.classList.toggle('on', on));
  };
  const submit = async () => {
    const n = Math.trunc(Number(amount.value));
    if (!picked.size) return toast('회원을 선택해 주세요');
    if (!n) return toast('수량을 입력해 주세요');
    const ok = await confirmSheet('볼 지급', `${picked.size}명에게 볼 ${n > 0 ? '+' : ''}${n}개씩 ${n > 0 ? '지급' : '회수'}할까요?`, '확인');
    if (!ok) return;
    const t = today();
    await batch([...picked].map((pid) => ({ type: 'put', col: 'ballLogs', doc: { id: uid('bl_'), playerId: pid, amount: n, reason: reason.value.trim() || '관리자 지급', date: t, by: me().id, at: Date.now() } })));
    toast('반영했어요');
  };
  const logs = [...(state.ballLogs || [])].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 20);
  const nameOf = (id) => state.players.find((p) => p.id === id)?.name || '?';
  return h(
    'section',
    { class: 'block' },
    h('h2', {}, '회원에게 볼 지급'),
    h('p', { class: 'muted small' }, `모든 회원은 처음에 볼 ${RULES.balls.start}개를 받고 시작해요. 여기서 추가로 주거나(+) 회수(−)할 수 있어요. 숫자 = 지금 가진 볼`),
    h('div', { class: 'row between' }, h('strong', { class: 'small' }, '회원 선택'), h('button', { class: 'link small', onclick: all }, '전체 선택 / 해제')),
    h('div', { class: 'pick-grid' }, chips),
    h('div', { class: 'grid2' }, field('수량 (회수는 음수)', amount), field('사유', reason)),
    h('button', { class: 'btn primary block', onclick: submit }, '지급'),
    logs.length > 0 &&
      h(
        'details',
        {},
        h('summary', { class: 'small' }, `최근 지급 내역 ${logs.length}개`),
        h('ul', { class: 'ledger' }, logs.map((l) => h('li', {}, h('span', { class: 'muted small' }, fmtShort(l.date)), h('span', { class: 'grow' }, `${nameOf(l.playerId)} · ${l.reason}`), h('strong', {}, (l.amount > 0 ? '+' : '') + l.amount), h('button', { class: 'link danger small', onclick: async () => (await confirmSheet('내역 삭제', '이 지급 내역을 삭제할까요? 볼도 같이 빠져요.', '삭제', true)) && remove('ballLogs', l.id) }, '삭제'))))
      )
  );
}
