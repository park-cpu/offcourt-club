// ─────────────────────────────────────────────────────────────
// 영상 분석 화면 (v1.15.0~)
//   #/analysis            목록 · 분석 요청 · 결과 파일 넣기(관리자)
//   #/analysis/demo       예시 데이터로 둘러보기 (저장 안 함)
//   #/analysis/{id}/{tab} 랠리 · 바운드 지도 · 통계
// 결과 형식: analyzer/FORMAT.md, 계산: js/analysis.js
// ─────────────────────────────────────────────────────────────
import { h, sheet, toast, field, select, confirmSheet, empty, pct } from '../ui.js';
import { state, me, isAdmin, person, fmtDate, activePlayers, today, addDays, isGuestId } from '../store.js';
import { put, remove, uid } from '../db.js';
import { pageHead, backLink, requireLogin, teamNames } from './common.js';
import { COURT, SHOT_KINDS, DIRS, DEPTHS, RESULTS, SLOTS, dirOf, fromNear, shotStats, rallyStats, fmtTime, youtubeId, demoAnalysis } from '../analysis.js';

const STATUS = { queued: '분석 대기', processing: '분석 중', done: '완료', error: '오류' };
const view = { pick: 'all', kind: 'all', demo: null };
const slotName = (a, k) => (a.players?.[k] ? person(a.players[k]).name : k);
const canEdit = (a) => {
  const u = me();
  if (!u) return false;
  if (a.demo || isAdmin() || a.createdBy === u.id) return true;
  const m = a.matchId && state.matches.find((x) => x.id === a.matchId);
  return !!m && [...m.teamA, ...m.teamB].includes(u.id);
};

export function analysisView(id, tab) {
  if (!id) return listView();
  const a = id === 'demo' ? (view.demo ||= demoAnalysis()) : state.analyses.find((x) => x.id === id);
  if (!a) return h('div', { class: 'page' }, backLink('#/analysis', '영상 분석'), empty('없는 분석이에요'));
  if (view.id !== a.id) Object.assign(view, { id: a.id, pick: 'all', kind: 'all' });
  if (a.status !== 'done') return pendingView(a);
  return detailView(a, tab || 'rally');
}

// ── 목록 ──────────────────────────────────────────────
function listView() {
  const list = [...state.analyses].sort((x, y) => (y.date || '').localeCompare(x.date || '') || (y.createdAt || 0) - (x.createdAt || 0));
  const row = (a) =>
    h(
      'a',
      { class: 'link-row', href: `#/analysis/${a.id}` },
      h('span', {}, h('strong', {}, a.title || '영상 분석'), h('br'), h('span', { class: 'muted small' }, `${a.date ? fmtDate(a.date) : ''}${a.status === 'done' ? ` · 랠리 ${a.rallies.length} · 샷 ${a.shots.length}` : ''}`)),
      h('span', { class: 'an-status st-' + a.status }, STATUS[a.status] || a.status)
    );
  return h(
    'div',
    { class: 'page' },
    pageHead('영상 분석', 'Video'),
    h('p', { class: 'muted' }, '경기 영상을 올리면 공 궤적 · 바운드 위치 · 샷 종류를 찾아 기록해요. 지금은 시험 운영 중이라 관리자가 분석 결과를 넣어요.'),
    h(
      'div',
      { class: 'row gap' },
      h('button', { class: 'btn primary grow', onclick: requestSheet }, '+ 분석 요청'),
      h('a', { class: 'btn ghost grow', href: '#/analysis/demo' }, '예시로 둘러보기')
    ),
    isAdmin() && h('button', { class: 'btn ghost block', onclick: () => importSheet() }, '결과 파일 넣기 (관리자)'),
    list.length ? h('nav', { class: 'menu' }, list.map(row)) : empty('아직 분석한 영상이 없어요'),
    h('p', { class: 'muted small' }, '촬영 팁: 베이스라인 뒤 높은 곳에 삼각대로 고정 · 코트 전체가 보이게 · 가로 · 1080p 30fps')
  );
}

const recentMatches = () =>
  state.matches
    .filter((m) => m.status === 'done' && m.date >= addDays(today(), -30))
    .sort((x, y) => (y.date + (y.recordedAt || 0)).localeCompare(x.date + (x.recordedAt || 0)));

const matchLabel = (m) => `${m.date.slice(5).replace('-', '/')} 코트 ${m.court || '-'} · ${[m.teamA, m.teamB].map((t) => t.map((id) => person(id).name).join('·')).join(' vs ')}`;

function requestSheet() {
  if (!requireLogin(requestSheet)) return;
  sheet('분석 요청', (close) => {
    const link = h('input', { class: 'input', type: 'url', placeholder: 'https://youtu.be/…', inputMode: 'url' });
    const ms = recentMatches();
    const match = select({ class: 'input' }, [['', '연결 안 함'], ...ms.map((m) => [m.id, matchLabel(m)])], '');
    const title = h('input', { class: 'input', placeholder: '비우면 날짜 + 경기로 자동' });
    const save = async () => {
      const yid = youtubeId(link.value);
      if (!yid) return toast('유튜브 링크를 넣어 주세요');
      const m = ms.find((x) => x.id === match.value);
      const date = m?.date || today();
      const doc = {
        id: uid('a_'),
        v: 1,
        title: title.value.trim() || `${fmtDate(date)} 경기 영상`,
        date,
        matchId: m?.id || null,
        scheduleId: m?.scheduleId || null,
        video: { kind: 'youtube', id: yid },
        status: 'queued',
        players: autoPlayers(m),
        rallies: [],
        shots: [],
        createdBy: me().id,
        createdAt: Date.now(),
      };
      await put('analyses', doc);
      close();
      toast('요청했어요. 분석이 끝나면 목록에 표시돼요');
    };
    return h(
      'div',
      { class: 'stack' },
      field('유튜브 링크', link, '일부 공개로 올린 영상도 돼요. 앱에서 파일 올리기는 서버 연결 후 열려요'),
      field('어떤 경기인가요?', match, '연결하면 경기 카드에 분석 버튼이 생겨요'),
      field('제목', title),
      h('button', { class: 'btn primary block', onclick: save }, '요청하기')
    );
  });
}

// 경기 참가자로 선수 칸 미리 채우기 (A팀 = 가까운 쪽 가정, 나중에 바꿀 수 있음)
const autoPlayers = (m) => {
  const out = { P1: null, P2: null, P3: null, P4: null };
  if (!m) return out;
  const near = m.teamA;
  const far = m.teamB;
  [near[0], near[1], far[0], far[1]].forEach((id, i) => id && !isGuestId(id) && (out[SLOTS[i]] = id));
  return out;
};

// 관리자: 분석기가 만든 JSON을 넣기 (대기 중인 요청에 채우거나 새로 만들기)
function importSheet(target) {
  sheet('결과 파일 넣기', (close) => {
    const queued = state.analyses.filter((a) => a.status !== 'done' || a.id === target?.id);
    const into = select({ class: 'input' }, [['', '새 분석으로 저장'], ...queued.map((a) => [a.id, `${a.title} (${STATUS[a.status]})`])], target?.id || queued[0]?.id || '');
    const file = h('input', { class: 'input', type: 'file', accept: '.json,application/json' });
    const save = async () => {
      const f = file.files[0];
      if (!f) return toast('JSON 파일을 골라 주세요');
      let r;
      try {
        r = JSON.parse(await f.text());
      } catch {
        return toast('JSON 파일이 아니에요');
      }
      if (r.v !== 1 || !Array.isArray(r.shots) || !Array.isArray(r.rallies)) return toast('형식이 맞지 않아요 (analyzer/FORMAT.md)');
      const base = state.analyses.find((a) => a.id === into.value);
      const doc = {
        ...r,
        ...(base ? { id: base.id, title: base.title, date: base.date, matchId: base.matchId, scheduleId: base.scheduleId, players: base.players, createdBy: base.createdBy, createdAt: base.createdAt, video: base.video || r.video } : {}),
        id: base?.id || uid('a_'),
        title: base?.title || r.title || '영상 분석',
        date: base?.date || r.date || today(),
        players: base?.players || r.players || { P1: null, P2: null, P3: null, P4: null },
        status: 'done',
        analyzedAt: Date.now(),
        createdBy: base?.createdBy || me().id,
        createdAt: base?.createdAt || Date.now(),
      };
      if (JSON.stringify(doc).length > 900000) return toast('결과가 너무 커요 (900KB 초과)');
      await put('analyses', doc);
      close();
      toast(`넣었어요 · 랠리 ${doc.rallies.length} · 샷 ${doc.shots.length}`);
      location.hash = `#/analysis/${doc.id}`;
    };
    return h('div', { class: 'stack' }, field('어디에 넣을까요?', into), field('결과 파일', file, 'Mac 분석기가 만든 .json'), h('button', { class: 'btn primary block', onclick: save }, '넣기'));
  });
}

function pendingView(a) {
  return h(
    'div',
    { class: 'page' },
    backLink('#/analysis', '영상 분석'),
    pageHead(a.title || '영상 분석', a.date ? fmtDate(a.date) : ''),
    videoBox(a),
    h('section', { class: 'block center' }, h('p', { class: 'an-status big st-' + a.status }, STATUS[a.status]), h('p', { class: 'muted small' }, a.status === 'error' ? a.error || '분석하지 못했어요' : '분석이 끝나면 이 화면에 결과가 나와요.')),
    isAdmin() && h('button', { class: 'btn ghost block', onclick: () => importSheet(a) }, '결과 파일 넣기'),
    (isAdmin() || a.createdBy === me()?.id) && h('button', { class: 'btn ghost block danger-text', onclick: () => del(a) }, '요청 삭제')
  );
}

async function del(a) {
  if (!(await confirmSheet('분석 삭제', `${a.title}을(를) 삭제할까요?`, '삭제', true))) return;
  await remove('analyses', a.id);
  location.hash = '#/analysis';
}

// ── 영상 (다시 그려져도 끊기지 않게 같은 요소 재사용) ─────────────
let player = { key: null, el: null };
function videoBox(a) {
  const v = a.video;
  if (!v) return h('div', { class: 'an-video empty-video' }, h('span', {}, '예시 데이터는 영상이 없어요 · 샷을 누르면 이 자리에서 그 장면이 재생돼요'));
  const key = a.id + (v.id || v.url);
  if (player.key !== key) {
    const el =
      v.kind === 'youtube'
        ? h('iframe', { src: `https://www.youtube-nocookie.com/embed/${v.id}?enablejsapi=1&playsinline=1&rel=0`, allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true, title: '경기 영상' })
        : h('video', { src: v.url, controls: true, playsinline: true, preload: 'metadata' });
    player = { key, el, kind: v.kind };
  }
  return h('div', { class: 'an-video' }, player.el);
}
function seek(t) {
  const el = player.el;
  if (!el) return toast(`${fmtTime(t)} 장면 (예시 데이터라 영상이 없어요)`);
  const at = Math.max(0, t - 1.5);
  if (player.kind === 'youtube') {
    const send = (func, args = []) => el.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    send('seekTo', [at, true]);
    send('playVideo');
  } else {
    el.currentTime = at;
    el.play?.().catch(() => {});
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── 상세 ──────────────────────────────────────────────
function detailView(a, tab) {
  const rerender = () => window.dispatchEvent(new Event('rerender'));
  const base = `#/analysis/${a.id}`;
  const tabs = [
    ['rally', '랠리'],
    ['map', '바운드 지도'],
    ['stats', '통계'],
  ];
  const chips = h(
    'div',
    { class: 'an-chips' },
    [['all', '전체'], ...SLOTS.filter((k) => a.shots.some((s) => s.p === k)).map((k) => [k, slotName(a, k)])].map(([k, l]) =>
      h('button', { class: 'chip' + (view.pick === k ? ' on' : ''), onclick: () => { view.pick = k; rerender(); } }, l)
    ),
    canEdit(a) && h('button', { class: 'chip ghost', onclick: () => mapSheet(a) }, '선수 지정')
  );
  const body = tab === 'map' ? mapTab(a) : tab === 'stats' ? statsTab(a) : rallyTab(a);
  return h(
    'div',
    { class: 'page' },
    backLink('#/analysis', '영상 분석'),
    pageHead(a.title || '영상 분석', a.date ? fmtDate(a.date) : 'Video'),
    a.demo && h('p', { class: 'warn' }, '예시 화면이에요. 숫자는 가짜 데이터예요.'),
    videoBox(a),
    chips,
    h('nav', { class: 'seg' }, tabs.map(([k, l]) => h('a', { class: k === tab ? 'on' : '', href: a.demo ? `#/analysis/demo/${k}` : `${base}/${k}` }, l))),
    body,
    !a.demo && isAdmin() && h('button', { class: 'btn ghost block danger-text', onclick: () => del(a) }, '분석 삭제')
  );
}

const picked = (a) => (view.pick === 'all' ? a.shots : a.shots.filter((s) => s.p === view.pick));

function mapSheet(a) {
  sheet('영상 속 선수 지정', (close) => {
    const opts = [['', '모름 · 게스트'], ...activePlayers().map((p) => [p.id, p.name])];
    const sel = Object.fromEntries(SLOTS.map((k) => [k, select({ class: 'input' }, opts, a.players?.[k] || '')]));
    const m = a.matchId && state.matches.find((x) => x.id === a.matchId);
    const save = async () => {
      const players = Object.fromEntries(SLOTS.map((k) => [k, sel[k].value || null]));
      if (a.demo) Object.assign(a, { players });
      else await put('analyses', { ...a, players });
      close();
      window.dispatchEvent(new Event('rerender'));
    };
    return h(
      'div',
      { class: 'stack' },
      h('p', { class: 'muted small' }, 'P1 · P2 = 처음에 카메라 가까운 쪽, P3 · P4 = 먼 쪽 선수예요.'),
      m && h('p', { class: 'muted small' }, '경기: ', teamNames(m.teamA), ' vs ', teamNames(m.teamB)),
      h('div', { class: 'grid2' }, SLOTS.map((k) => field(k, sel[k]))),
      h('button', { class: 'btn primary block', onclick: save }, '저장')
    );
  });
}

// 랠리 탭: 랠리마다 샷 흐름. 샷을 누르면 영상이 그 장면으로
function rallyTab(a) {
  const st = rallyStats(a);
  const rows = a.rallies
    .map((r, i) => ({ r, i, shots: a.shots.filter((s) => s.r === i) }))
    .filter((x) => x.shots.length && (view.pick === 'all' || x.shots.some((s) => s.p === view.pick)));
  const shotChip = (s) =>
    h(
      'button',
      { class: 'an-shot res-' + (s.res || 'unknown') + (view.pick !== 'all' && s.p !== view.pick ? ' dim' : ''), onclick: () => seek(s.t) },
      h('b', {}, slotName(a, s.p)),
      ` ${SHOT_KINDS[s.k] || '기타'}`,
      dirOf(s) && h('small', {}, ` ${DIRS[dirOf(s)]}`),
      s.res !== 'in' && h('em', {}, ` ${RESULTS[s.res] || ''}`)
    );
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'summary3' }, sum('랠리', st.n), sum('평균 샷', st.avg.toFixed(1)), sum('최장 랠리', `${st.max}구`)),
    rows.length
      ? rows.map(({ r, i, shots }) =>
          h(
            'section',
            { class: 'an-rally' },
            h('button', { class: 'an-rally-head', onclick: () => seek(r.t0) }, h('strong', {}, `랠리 ${i + 1}`), h('span', { class: 'muted small' }, `${fmtTime(r.t0)} · ${shots.length}구${r.end === 'winner' ? ' · 위너' : r.end === 'error' ? ' · 실수로 끝' : ''}`), h('span', { class: 'muted' }, '▶')),
            h('div', { class: 'an-flow' }, shots.map(shotChip))
          )
        )
      : empty('이 선수의 샷이 없어요')
  );
}
const sum = (l, v) => h('div', {}, h('strong', {}, v), h('span', {}, l));

// ── 바운드 지도 (SVG) ─────────────────────────────────
// 친 사람이 아래쪽에서 위쪽으로 친 것처럼 뒤집어서 그림 → 내 공이 상대 코트 어디에 떨어졌는지 한눈에
export function bounceMap(shots, { size = 'big' } = {}) {
  const W = COURT.halfW + 1.8;
  const L = COURT.halfL + 2;
  const S = 20; // 1m = 20px
  const vw = W * 2 * S;
  const BOT = 3.2; // 친 쪽은 네트 앞 3m만 보여줌 (공은 모두 위쪽 상대 코트에 떨어지니까)
  const vh = (L + BOT) * S;
  const X = (x) => (x + W) * S;
  const Y = (y) => (L - y) * S; // 위쪽이 +y (상대 코트)
  const line = (x1, y1, x2, y2, cls = '') => `<line x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}" class="${cls}"/>`;
  const { halfW: dw, singlesW: sw, halfL: hl, service: sv } = COURT;
  let svg = `<rect x="${X(-dw)}" y="${Y(hl)}" width="${dw * 2 * S}" height="${hl * 2 * S}" class="ct-fill"/>`;
  svg += [line(-dw, hl, dw, hl), line(-dw, -hl, dw, -hl), line(-dw, hl, -dw, -hl), line(dw, hl, dw, -hl), line(-sw, hl, -sw, -hl), line(sw, hl, sw, -hl), line(-sw, sv, sw, sv), line(-sw, -sv, sw, -sv), line(0, sv, 0, -sv), line(-dw - 0.9, 0, dw + 0.9, 0, 'ct-net')].join('');
  const dots = shots
    .filter((s) => s.res === 'net' || s.by != null)
    .map((s) => {
      const flip = !fromNear(s);
      let bx = s.bx ?? 0;
      let by = s.by;
      if (flip) {
        bx = -bx;
        by = -by;
      }
      if (s.res === 'net') by = -0.45; // 네트에 걸린 공은 네트 바로 아래(친 쪽)에
      const cls = s.res === 'in' ? 'd-in' : s.res === 'net' ? 'd-net' : s.res === 'out' ? 'd-out' : 'd-unk';
      return `<circle cx="${X(Math.max(-W + 0.3, Math.min(W - 0.3, bx)))}" cy="${Y(Math.max(-BOT + 0.3, Math.min(L - 0.3, by)))}" r="${size === 'big' ? 7 : 9}" class="${cls}"><title>${SHOT_KINDS[s.k] || ''} ${RESULTS[s.res] || ''} ${fmtTime(s.t)}</title></circle>`;
    })
    .join('');
  const el = h('div', { class: 'an-court ' + size });
  el.innerHTML = `<svg viewBox="0 0 ${vw} ${vh}" role="img" aria-label="바운드 지도">${svg}${dots}</svg>`;
  return el;
}

function mapTab(a) {
  const rerender = () => window.dispatchEvent(new Event('rerender'));
  const all = picked(a);
  const kinds = ['all', ...Object.keys(SHOT_KINDS).filter((k) => all.some((s) => s.k === k))];
  const shots = view.kind === 'all' ? all : all.filter((s) => s.k === view.kind);
  const n = (r) => shots.filter((s) => s.res === r).length;
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'an-chips' }, kinds.map((k) => h('button', { class: 'chip' + (view.kind === k ? ' on' : ''), onclick: () => { view.kind = k; rerender(); } }, k === 'all' ? '모든 샷' : SHOT_KINDS[k]))),
    h('section', { class: 'block' }, bounceMap(shots), h('div', { class: 'an-legend' }, h('span', { class: 'lg in' }, `인 ${n('in')}`), h('span', { class: 'lg out' }, `아웃 ${n('out')}`), h('span', { class: 'lg net' }, `네트 ${n('net')}`))),
    h('p', { class: 'muted small' }, '친 사람이 아래쪽에 있는 것처럼 돌려서 보여줘요. 위쪽 코트에 점이 고르게 깊이 찍힐수록 좋아요.')
  );
}

// ── 통계 ──────────────────────────────────────────────
export function statsBlock(st, { title } = {}) {
  // 막대 안에는 색만, 이름 · 비율은 아래 줄에 (좁은 칸에서 글자가 잘리지 않게)
  const bar = (parts) => [
    h('div', { class: 'an-bar' }, parts.filter((p) => p.v > 0).map((p) => h('i', { class: p.cls, style: `flex:${p.v}` }))),
    h('div', { class: 'an-bar-key' }, parts.map((p) => h('span', { class: p.cls }, `${p.label} ${Math.round(p.r * 100)}%`))),
  ];
  const dirTotal = st.dirs.cross + st.dirs.line + st.dirs.middle;
  const depTotal = st.depths.short + st.depths.mid + st.depths.deep;
  return h(
    'section',
    { class: 'block' },
    title && h('h2', {}, title),
    h('div', { class: 'summary3' }, sum('샷', st.n), sum('성공률', st.inRate == null ? '-' : pct(st.inRate)), sum('실수', `${st.out + st.net}`)),
    h(
      'table',
      { class: 'an-table' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, '횟수'), h('th', {}, '성공률'), h('th', {}, '아웃'), h('th', {}, '네트'))),
      h('tbody', {}, Object.entries(st.byKind).map(([k, v]) => h('tr', {}, h('td', {}, SHOT_KINDS[k]), h('td', {}, v.n), h('td', {}, h('strong', {}, v.inRate == null ? '-' : pct(v.inRate))), h('td', {}, v.out), h('td', {}, v.net))))
    ),
    dirTotal > 0 && [h('p', { class: 'eyebrow' }, '스트로크 방향'), bar(Object.entries(DIRS).map(([k, l], i) => ({ label: l, v: st.dirs[k], r: st.dirs[k] / dirTotal, cls: 'c' + i })))],
    depTotal > 0 && [h('p', { class: 'eyebrow' }, '깊이 (들어간 공)'), bar(Object.entries(DEPTHS).map(([k, l], i) => ({ label: l, v: st.depths[k], r: st.depths[k] / depTotal, cls: 'c' + i })))]
  );
}

function statsTab(a) {
  const slots = view.pick === 'all' ? SLOTS.filter((k) => a.shots.some((s) => s.p === k)) : [view.pick];
  return h(
    'div',
    { class: 'stack' },
    slots.map((k) => statsBlock(shotStats(a.shots.filter((s) => s.p === k)), { title: slotName(a, k) })),
    h('p', { class: 'muted small' }, '성공률 = 인 ÷ (인 + 아웃 + 네트). 방향 · 깊이는 바운드 위치로 계산해요.')
  );
}
