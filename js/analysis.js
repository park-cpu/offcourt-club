// ─────────────────────────────────────────────────────────────
// 영상 분석 결과 계산 (형식: analyzer/FORMAT.md)
// 화면 없이 숫자만 다룸 — 방향 · 깊이 · 선수별 통계 · 예시 데이터
// ─────────────────────────────────────────────────────────────

// 코트 크기(미터, 원점 = 네트 중앙)
export const COURT = { halfW: 5.485, singlesW: 4.115, halfL: 11.885, service: 6.4 };

export const SHOT_KINDS = {
  serve: '서브',
  fh: '포핸드',
  bh: '백핸드',
  volley: '발리',
  overhead: '스매시',
  unknown: '기타',
};
export const DIRS = { cross: '크로스', line: '스트레이트', middle: '가운데' };
export const DEPTHS = { short: '짧게', mid: '중간', deep: '깊게' };
export const RESULTS = { in: '인', out: '아웃', net: '네트', unknown: '-' };
export const SLOTS = ['P1', 'P2', 'P3', 'P4'];

// 친 선수가 가까운 쪽(y<0)에서 쳤는지 — 위치가 없으면 바운드 반대쪽으로 추정
export const fromNear = (s) => (s.hy != null ? s.hy < 0 : s.by != null ? s.by > 0 : SLOTS.indexOf(s.p) < 2);

// 크로스 · 스트레이트 · 가운데 (바운드가 중앙선 ±1.4m 안이면 가운데)
export function dirOf(s) {
  if (s.bx == null || s.k === 'serve') return null;
  if (Math.abs(s.bx) < 1.4) return 'middle';
  if (s.hx == null || Math.abs(s.hx) < 0.5) return null;
  return Math.sign(s.bx) !== Math.sign(s.hx) ? 'cross' : 'line';
}

// 깊이: 네트에서 바운드까지 거리 (서비스 라인 안 = 짧게, 베이스라인 2.5m 안 = 깊게)
export function depthOf(s) {
  if (s.by == null || s.res !== 'in' || s.k === 'serve') return null;
  const d = Math.abs(s.by);
  return d < COURT.service ? 'short' : d > COURT.halfL - 2.5 ? 'deep' : 'mid';
}

const ratio = (a, b) => (b ? a / b : null);

/** 선수(P1~P4 또는 회원 id 목록)별 통계 */
export function shotStats(shots) {
  const judged = (arr) => arr.filter((s) => s.res === 'in' || s.res === 'out' || s.res === 'net');
  const inRate = (arr) => {
    const j = judged(arr);
    return ratio(j.filter((s) => s.res === 'in').length, j.length);
  };
  const byKind = {};
  for (const k of Object.keys(SHOT_KINDS)) {
    const arr = shots.filter((s) => (s.k || 'unknown') === k);
    if (arr.length) byKind[k] = { n: arr.length, inRate: inRate(arr), out: arr.filter((s) => s.res === 'out').length, net: arr.filter((s) => s.res === 'net').length };
  }
  const ground = shots.filter((s) => s.k === 'fh' || s.k === 'bh');
  const dirs = { cross: 0, line: 0, middle: 0 };
  ground.forEach((s) => {
    const d = dirOf(s);
    if (d) dirs[d]++;
  });
  const depths = { short: 0, mid: 0, deep: 0 };
  shots.forEach((s) => {
    const d = depthOf(s);
    if (d) depths[d]++;
  });
  const j = judged(shots);
  return {
    n: shots.length,
    inRate: inRate(shots),
    out: j.filter((s) => s.res === 'out').length,
    net: j.filter((s) => s.res === 'net').length,
    byKind,
    dirs,
    depths,
  };
}

export function rallyStats(a) {
  const counts = a.rallies.map((_, i) => a.shots.filter((s) => s.r === i).length).filter((n) => n > 0);
  return {
    n: a.rallies.length,
    avg: counts.length ? counts.reduce((x, y) => x + y, 0) / counts.length : 0,
    max: counts.length ? Math.max(...counts) : 0,
  };
}

/** 회원 한 명의 모든 분석 샷 (분석마다 그 회원으로 지정된 슬롯) */
export function memberShots(analyses, playerId) {
  const out = [];
  for (const a of analyses) {
    if (a.status !== 'done') continue;
    const slots = SLOTS.filter((k) => a.players?.[k] === playerId);
    if (!slots.length) continue;
    a.shots.forEach((s) => slots.includes(s.p) && out.push({ ...s, _a: a.id }));
  }
  return out;
}

export const fmtTime = (t) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// ── 예시 데이터 (화면 미리보기용, 저장하지 않음) ─────────────
export function demoAnalysis() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const rallies = [];
  const shots = [];
  let t = 8;
  for (let r = 0; r < 40; r++) {
    const server = SLOTS[Math.floor(r / 6) % 4];
    const len = 1 + Math.floor(rnd() * rnd() * 11);
    const t0 = t;
    let near = SLOTS.indexOf(server) < 2;
    let last = null;
    for (let i = 0; i < len; i++) {
      const p = i === 0 ? server : near ? pick(['P1', 'P2']) : pick(['P3', 'P4']);
      const k = i === 0 ? 'serve' : rnd() < 0.15 ? 'volley' : rnd() < 0.03 ? 'overhead' : rnd() < 0.58 ? 'fh' : 'bh';
      const hx = (rnd() - 0.5) * 8;
      const hy = (near ? -1 : 1) * (k === 'volley' ? 2 + rnd() * 3 : 9 + rnd() * 4);
      const final = i === len - 1;
      const err = final && rnd() < 0.62;
      const res = err ? (rnd() < 0.45 ? 'net' : 'out') : 'in';
      let bx = (rnd() - 0.5) * 2 * (k === 'serve' ? 4 : COURT.singlesW * 0.95);
      let by = (near ? 1 : -1) * (k === 'serve' ? 1.5 + rnd() * 4.6 : 3 + rnd() * 8.5);
      if (res === 'out') {
        if (rnd() < 0.6) by = (near ? 1 : -1) * (COURT.halfL + 0.3 + rnd() * 1.5);
        else bx = Math.sign(bx || 1) * (COURT.singlesW + 0.2 + rnd() * 1.2);
      }
      if (res === 'net') by = 0;
      shots.push({ t: Math.round((t + 0.4) * 10) / 10, r, p, k, hx: +hx.toFixed(2), hy: +hy.toFixed(2), bx: +bx.toFixed(2), by: +by.toFixed(2), res });
      t += 1.1 + rnd() * 0.6;
      last = { near, res };
      near = !near;
    }
    const nearWon = last.res === 'in' ? last.near : !last.near;
    rallies.push({ t0: Math.round(t0 * 10) / 10, t1: Math.round(t * 10) / 10, win: nearWon ? 'near' : 'far', end: last.res === 'in' ? 'winner' : 'error' });
    t += 14 + rnd() * 12;
  }
  return {
    id: 'demo',
    v: 1,
    demo: true,
    title: '예시 분석 (가짜 데이터)',
    date: new Date().toISOString().slice(0, 10),
    video: null,
    duration: Math.round(t),
    status: 'done',
    engine: 'demo',
    players: { P1: null, P2: null, P3: null, P4: null },
    rallies,
    shots,
  };
}
