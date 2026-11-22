// ─────────────────────────────────────────────────────────────
// 관리자: 볼 적립 · 주간 미션 설정
//   저장하면 settings.ballRules에 "오늘부터 적용" 버전을 하나 추가 (지난 기록은 그때 규칙 그대로)
// ─────────────────────────────────────────────────────────────
import { h, toast, select, confirmSheet } from '../ui.js';
import { settings, today, weekStart, ballRulesAt, weekRules, fmtShort } from '../store.js';
import { put, uid } from '../db.js';
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
    pageHead('미션 · 볼 설정', 'Missions'),
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
