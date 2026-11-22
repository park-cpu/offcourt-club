import { h, sheet, toast, field, select, go, confirmSheet, empty, ntrpText } from '../ui.js';
import { state, me, isAdmin, settings, derived, today, fmtShort, careerText, hashPin, session, customItems } from '../store.js';
import { put, remove, batch, uid, db, COLLECTIONS } from '../db.js';
import { pageHead, backLink, linkRow, playerForm, genderPicker, GENDER_LABEL } from './common.js';
import { seedDemo } from '../demo.js';
import { itemsAdmin } from './admin-items.js';
import { ballsAdmin } from './admin-balls.js';

const guard = () => {
  if (isAdmin()) return null;
  return h('div', { class: 'page' }, backLink('#/me'), empty('관리자만 볼 수 있는 화면이에요'));
};

export function adminView(sub) {
  const g = guard();
  if (g) return g;
  if (sub === 'players') return playersAdmin();
  if (sub === 'coins') return coinsAdmin();
  if (sub === 'seasons') return seasonsAdmin();
  if (sub === 'settings') return settingsAdmin();
  if (sub === 'data') return dataAdmin();
  if (sub === 'items') return itemsAdmin();
  if (sub === 'balls') return ballsAdmin();
  const zero = state.players.filter((p) => p.active !== false && (derived().coins.bal.get(p.id) ?? 0) <= 0).length;
  return h(
    'div',
    { class: 'page' },
    backLink('#/me', '내 정보'),
    pageHead('관리자', 'Admin'),
    h(
      'nav',
      { class: 'menu' },
      linkRow('회원 관리', '#/admin/players', `${state.players.filter((p) => p.active !== false).length}명 ›`),
      linkRow('코인 지급 · 회수', '#/admin/coins', zero ? `코인 0개 ${zero}명 ›` : '›'),
      linkRow('시즌 관리', '#/admin/seasons', `${settings().seasons.length}개 ›`),
      linkRow('아바타 아이템', '#/admin/items', `${customItems().length}개 ›`),
      linkRow('미션 · 볼 설정', '#/admin/balls'),
      linkRow('클럽 설정', '#/admin/settings'),
      linkRow('백업 · 복원', '#/admin/data')
    )
  );
}

// ── 회원 ──────────────────────────────────────────────
function playersAdmin() {
  const { coins } = derived();
  const list = [...state.players].sort((a, b) => (a.active === false) - (b.active === false) || a.name.localeCompare(b.name, 'ko'));
  const open = (p) =>
    sheet(p ? `${p.name} 수정` : '회원 추가', (close) =>
      playerForm(p, {
        admin: true,
        onSaved: () => {
          close();
          toast('저장했어요');
        },
      }).node
    );
  return h(
    'div',
    { class: 'page' },
    backLink('#/admin', '관리자'),
    pageHead('회원 관리', 'Members', h('button', { class: 'btn primary small', onclick: () => open(null) }, '+ 추가')),
    h('p', { class: 'muted small' }, 'PIN을 잊은 회원은 수정 → PIN 변경에 새 PIN을 입력해 알려주세요.'),
    h(
      'div',
      { class: 'rank-list' },
      list.map((p) =>
        h(
          'button',
          { class: 'rank-row' + (p.active === false ? ' dim' : ''), onclick: () => open(p) },
          h('span', { class: 'rank-main' }, h('strong', {}, p.name, p.id === settings().adminId ? ' · 관리자' : ''), h('small', {}, `${GENDER_LABEL[p.gender] || '성별 미입력'} · NTRP ${ntrpText(p.ntrp)} · 구력 ${careerText(p.since)}${p.active === false ? ' · 비활성' : ''}`)),
          h('span', { class: 'sp' }, coins.bal.get(p.id) ?? 0, h('small', {}, '코인'))
        )
      )
    )
  );
}

// ── 코인 ──────────────────────────────────────────────
function coinsAdmin() {
  const { coins } = derived();
  const list = state.players.filter((p) => p.active !== false).sort((a, b) => (coins.bal.get(a.id) ?? 0) - (coins.bal.get(b.id) ?? 0));
  const picked = new Set();
  const amount = h('input', { class: 'input', type: 'number', value: 3, step: 1 });
  const reason = h('input', { class: 'input', value: '관리자 지급', maxLength: 30 });
  const submit = async () => {
    const n = Math.trunc(Number(amount.value));
    if (!picked.size) return toast('회원을 선택해 주세요');
    if (!n) return toast('수량을 입력해 주세요');
    const ok = await confirmSheet('코인 조정', `${picked.size}명에게 ${n > 0 ? '+' : ''}${n}개씩 ${n > 0 ? '지급' : '회수'}할까요?`, '확인');
    if (!ok) return;
    await batch([...picked].map((pid) => ({ type: 'put', col: 'coinLogs', doc: { id: uid('c_'), playerId: pid, amount: n, reason: reason.value.trim() || '관리자 조정', date: today(), by: me().id, at: Date.now() } })));
    toast('반영했어요');
  };
  const logs = [...state.coinLogs].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 20);
  return h(
    'div',
    { class: 'page' },
    backLink('#/admin', '관리자'),
    pageHead('코인 지급 · 회수', 'Coins'),
    h(
      'section',
      { class: 'block' },
      h('h2', {}, '1. 회원 선택 (잔액 적은 순)'),
      h(
        'div',
        { class: 'pick-grid' },
        list.map((p) =>
          h(
            'button',
            { class: 'chip big' + ((coins.bal.get(p.id) ?? 0) <= 0 ? ' alert' : ''), onclick: (e) => { picked.has(p.id) ? picked.delete(p.id) : picked.add(p.id); e.currentTarget.classList.toggle('on'); } },
            p.name,
            h('small', {}, ` ${coins.bal.get(p.id) ?? 0}`)
          )
        )
      ),
      h('h2', {}, '2. 수량 · 사유'),
      h('div', { class: 'grid2' }, field('수량 (회수는 음수)', amount), field('사유', reason)),
      h('button', { class: 'btn primary block', onclick: submit }, '반영')
    ),
    logs.length > 0 &&
      h(
        'section',
        { class: 'block' },
        h('h2', {}, '최근 조정 내역'),
        h('ul', { class: 'ledger' }, logs.map((l) => h('li', {}, h('span', { class: 'muted small' }, fmtShort(l.date)), h('span', { class: 'grow' }, `${state.players.find((p) => p.id === l.playerId)?.name || '?'} · ${l.reason}`), h('strong', {}, (l.amount > 0 ? '+' : '') + l.amount), h('button', { class: 'link danger small', onclick: async () => (await confirmSheet('내역 삭제', '이 조정 내역을 삭제할까요?', '삭제', true)) && remove('coinLogs', l.id) }, '삭제'))))
      )
  );
}

// ── 시즌 ──────────────────────────────────────────────
function seasonsAdmin() {
  const st = settings();
  const seasons = [...st.seasons].sort((a, b) => b.start.localeCompare(a.start));
  const save = (next) => put('settings', { ...st, seasons: next });
  const open = (s) =>
    sheet(s ? '시즌 수정' : '시즌 추가', (close) => {
      const y = new Date().getFullYear();
      const name = h('input', { class: 'input', value: s?.name || `${y} S${new Date().getMonth() < 6 ? 1 : 2}` });
      const start = h('input', { class: 'input', type: 'date', value: s?.start || today() });
      const end = h('input', { class: 'input', type: 'date', value: s?.end || `${y}-12-31` });
      const ok = async () => {
        if (!name.value.trim() || !start.value || !end.value) return toast('모두 입력해 주세요');
        if (end.value < start.value) return toast('종료일이 시작일보다 빨라요');
        const doc = { id: s?.id || uid('season_'), name: name.value.trim(), start: start.value, end: end.value };
        const overlap = st.seasons.find((x) => x.id !== doc.id && !(doc.end < x.start || doc.start > x.end));
        if (overlap) return toast(`${overlap.name} 기간과 겹쳐요`);
        await save([...st.seasons.filter((x) => x.id !== doc.id), doc]);
        close();
      };
      return h('div', { class: 'stack' }, field('이름', name), h('div', { class: 'grid2' }, field('시작', start), field('종료', end)), h('button', { class: 'btn primary block', onclick: ok }, '저장'));
    });
  return h(
    'div',
    { class: 'page' },
    backLink('#/admin', '관리자'),
    pageHead('시즌 관리', 'Seasons', h('button', { class: 'btn primary small', onclick: () => open(null) }, '+ 추가')),
    h('p', { class: 'muted small' }, '시즌 기간 안의 공식전은 공식전 순위, 코인전은 코인전 순위에 따로 반영돼요. 레이팅과 코인은 시즌과 상관없이 누적됩니다.'),
    seasons.length
      ? h(
          'nav',
          { class: 'menu' },
          seasons.map((s) =>
            h(
              'div',
              { class: 'link-row' },
              h('span', {}, h('strong', {}, s.name), h('br'), h('small', { class: 'muted' }, `${s.start} ~ ${s.end}`)),
              h('span', { class: 'row gap' }, h('button', { class: 'btn small ghost', onclick: () => open(s) }, '수정'), h('button', { class: 'btn small ghost danger', onclick: async () => (await confirmSheet('시즌 삭제', `${s.name}을(를) 삭제할까요? 경기 기록은 지워지지 않아요.`, '삭제', true)) && save(st.seasons.filter((x) => x.id !== s.id)) }, '삭제'))
            )
          )
        )
      : empty('시즌이 없어요')
  );
}

// ── 설정 ──────────────────────────────────────────────
function settingsAdmin() {
  const st = settings();
  const f = {
    initialCoins: h('input', { class: 'input', type: 'number', min: 0, value: st.initialCoins }),
    attendCoin: h('input', { class: 'input', type: 'number', min: 0, value: st.attendCoin }),
    minGames: h('input', { class: 'input', type: 'number', min: 0, value: st.minGames }),
    loanAmount: h('input', { class: 'input', type: 'number', min: 1, value: st.loanAmount }),
    admin: select({ class: 'input' }, state.players.filter((p) => p.active !== false).map((p) => [p.id, p.name]), st.adminId),
  };
  const save = async () => {
    const next = {
      ...st,
      initialCoins: Number(f.initialCoins.value) || 0,
      attendCoin: Number(f.attendCoin.value) || 0,
      minGames: Number(f.minGames.value) || 0,
      loanAmount: Math.max(1, Number(f.loanAmount.value) || 3),
    };
    if (f.admin.value !== st.adminId) {
      const ok = await confirmSheet('관리자 변경', `관리자를 ${state.players.find((p) => p.id === f.admin.value)?.name}님으로 넘길까요?\n저장 후 내 관리자 권한은 사라져요.`, '넘기기', true);
      if (!ok) return;
      next.adminId = f.admin.value;
    }
    await put('settings', next);
    toast('저장했어요');
    if (next.adminId !== st.adminId) go('#/me');
  };
  return h(
    'div',
    { class: 'page' },
    backLink('#/admin', '관리자'),
    pageHead('클럽 설정', 'Settings'),
    h(
      'section',
      { class: 'block stack' },
      h('div', { class: 'grid2' }, field('가입 지급 코인', f.initialCoins), field('출석 코인', f.attendCoin)),
      field('순위 최소 경기 수', f.minGames),
      field('대출 1회 지급 코인', f.loanAmount, '잔액 0 이하 · 남은 대출 없을 때 신청 가능'),
      field('관리자', f.admin, '관리자는 1명입니다'),
      h('p', { class: 'muted small' }, '가입·출석 코인 값을 바꾸면 과거 내역도 새 값으로 다시 계산돼요.'),
      h('button', { class: 'btn primary block', onclick: save }, '저장')
    )
  );
}

// ── 백업 ──────────────────────────────────────────────
function dataAdmin() {
  const exportJson = () => {
    const data = Object.fromEntries(COLLECTIONS.map((c) => [c, state[c]]));
    const blob = new Blob([JSON.stringify({ app: 'offcourt', at: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `offcourt-backup-${today()}.json` });
    a.click();
  };
  const file = h('input', { type: 'file', accept: 'application/json', class: 'input' });
  const importJson = async () => {
    const f = file.files[0];
    if (!f) return toast('파일을 선택해 주세요');
    let parsed;
    try {
      parsed = JSON.parse(await f.text());
    } catch {
      return toast('올바른 백업 파일이 아니에요');
    }
    if (parsed.app !== 'offcourt') return toast('Offcourt 백업 파일이 아니에요');
    const ok = await confirmSheet('복원', '현재 모든 데이터를 지우고 백업 파일 내용으로 바꿀까요?\n되돌릴 수 없어요. 먼저 현재 데이터를 백업해 두세요.', '복원', true);
    if (!ok) return;
    await db.replaceAll(parsed.data);
    toast('복원했어요');
  };
  return h(
    'div',
    { class: 'page' },
    backLink('#/admin', '관리자'),
    pageHead('백업 · 복원', 'Data'),
    h('section', { class: 'block stack' }, h('h2', {}, '백업 내려받기'), h('p', { class: 'muted small' }, '시즌이 끝날 때마다 받아 두는 걸 추천해요.'), h('button', { class: 'btn primary block', onclick: exportJson }, 'JSON 백업 다운로드')),
    h('section', { class: 'block stack' }, h('h2', {}, '백업에서 복원'), file, h('button', { class: 'btn ghost danger block', onclick: importJson }, '복원하기')),
    db.mode === 'local' &&
      h(
        'section',
        { class: 'block stack' },
        h('h2', {}, '체험 모드'),
        h('p', { class: 'muted small' }, '지금은 이 브라우저에만 저장돼요. 회원끼리 공유하려면 README의 Firebase 연결을 진행하세요.'),
        h('button', { class: 'btn ghost danger block', onclick: async () => { if (await confirmSheet('초기화', '이 기기의 모든 데이터를 삭제할까요?', '삭제', true)) { await db.replaceAll({}); session.clear(); go('#/'); } } }, '이 기기 데이터 초기화')
      )
  );
}

// ── 첫 실행 설정 ───────────────────────────────────────
export function setupView() {
  const name = h('input', { class: 'input', placeholder: '관리자 이름' });
  const since = h('input', { class: 'input', type: 'month' });
  const ntrp = h('input', { class: 'input', type: 'number', step: '0.5', value: '3.0' });
  const pin = h('input', { class: 'input', type: 'password', inputMode: 'numeric', maxLength: 4, placeholder: '숫자 4자리' });
  const gender = genderPicker('');
  const seasonName = h('input', { class: 'input', value: `${new Date().getFullYear()} S${new Date().getMonth() < 6 ? 1 : 2}` });
  const go1 = async () => {
    if (!name.value.trim()) return toast('이름을 입력해 주세요');
    if (!gender.value()) return toast('성별을 선택해 주세요');
    if (!/^\d{4}$/.test(pin.value)) return toast('PIN은 숫자 4자리예요');
    const id = uid('p_');
    const y = new Date().getFullYear();
    const half = new Date().getMonth() < 6;
    await batch([
      { type: 'put', col: 'players', doc: { id, name: name.value.trim(), since: since.value, ntrp: Number(ntrp.value) || 3, gender: gender.value(), active: true, createdAt: Date.now(), pinHash: await hashPin(pin.value, id) } },
      { type: 'put', col: 'settings', doc: { ...settings(), id: 'main', adminId: id, seasons: [{ id: uid('season_'), name: seasonName.value.trim() || `${y}`, start: half ? `${y}-01-01` : `${y}-07-01`, end: half ? `${y}-06-30` : `${y}-12-31` }] } },
    ]);
    session.set(id);
    toast('클럽 개설 완료!');
    go('#/');
  };
  return h(
    'div',
    { class: 'page setup' },
    h('section', { class: 'hero' }, h('div', { class: 'hero-top' }, h('span', {}, 'Setup'), h('span', {}, 'Step 1/1')), h('div', { class: 'wordmark' }, h('em', {}, 'Off'), 'court'), h('div', { class: 'hero-bottom' }, h('span', {}, '클럽 첫 설정'), h('span', {}, ''))),
    h(
      'section',
      { class: 'block stack' },
      h('h2', {}, '관리자 등록'),
      h('p', { class: 'muted small' }, '처음 등록하는 사람이 관리자가 됩니다. 나중에 다른 회원에게 넘길 수 있어요.'),
      field('이름', name),
      field('성별', gender.node),
      h('div', { class: 'grid2' }, field('구력 (시작 연월)', since), field('NTRP', ntrp)),
      field('PIN', pin),
      field('첫 시즌 이름', seasonName),
      h('button', { class: 'btn primary block', onclick: go1 }, '시작하기')
    ),
    db.mode === 'local' &&
      h('section', { class: 'block stack' }, h('h2', {}, '먼저 둘러보기'), h('p', { class: 'muted small' }, '가상의 회원 14명과 경기 기록이 들어간 데모로 시작합니다. 관리자 PIN은 0000.'), h('button', { class: 'btn ghost block', onclick: async () => { await seedDemo(); go('#/'); } }, '데모 데이터로 체험하기'))
  );
}
