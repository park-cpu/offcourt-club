// ─────────────────────────────────────────────────────────────
// 자동 대진 생성
// 1) 오늘 경기 수가 적은 사람 → 오래 쉰 사람 순으로 우선 선발
// 2) 선발된 인원을 코트·팀으로 나누되 아래 비용이 가장 낮은 조합 선택
//    - 두 팀 평균 레이팅 차이 (NTRP 기반 레이팅)
//    - 오늘 같은 파트너 반복 (큰 페널티)
//    - 오늘 같은 상대 반복 (작은 페널티)
// ─────────────────────────────────────────────────────────────

const PARTNER_PENALTY = 80;
const OPPONENT_PENALTY = 25;
const ITERATIONS = 1500;

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

/**
 * @param {object} o
 * @param {string[]} o.pool        대진 가능 선수 id (도착 · 귀가X · 경기중X)
 * @param {string[]} o.courts      비어 있는 코트 이름
 * @param {'doubles'|'mixed'|'singles'} o.format   mixed = 혼복 (각 팀 남1·여1)
 * @param {Map<string,'M'|'F'>} [o.genders]
 * @param {Map<string,number>} o.ratings
 * @param {object[]} o.todayMatches 오늘(이 일정) 경기들
 * @returns {{court:string, teamA:string[], teamB:string[]}[]}
 */
/** 이 조건으로 몇 코트를 채울 수 있는지 */
export function capacity({ pool, courts, format, genders }) {
  if (format === 'mixed') {
    const m = pool.filter((id) => genders.get(id) === 'M').length;
    const f = pool.filter((id) => genders.get(id) === 'F').length;
    return Math.min(courts.length, Math.floor(m / 2), Math.floor(f / 2));
  }
  return Math.min(courts.length, Math.floor(pool.length / (format === 'singles' ? 2 : 4)));
}

export function generate({ pool, courts, format, ratings, todayMatches, genders = new Map() }) {
  const mixed = format === 'mixed';
  const per = format === 'singles' ? 2 : 4;
  const n = capacity({ pool, courts, format, genders });
  if (n < 1) return [];

  // 오늘 기록
  const played = new Map();
  const lastAt = new Map();
  const partners = new Map();
  const opponents = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (const m of todayMatches) {
    for (const id of [...m.teamA, ...m.teamB]) {
      bump(played, id);
      lastAt.set(id, Math.max(lastAt.get(id) || 0, m.createdAt || 0));
    }
    for (const t of [m.teamA, m.teamB]) if (t.length === 2) bump(partners, key(t[0], t[1]));
    for (const a of m.teamA) for (const b of m.teamB) bump(opponents, key(a, b));
  }

  // 1) 선발: 경기 수 적은 순 → 오래 쉰 순 (동률은 랜덤)
  const priority = (list) =>
    shuffle(list).sort((a, b) => (played.get(a) || 0) - (played.get(b) || 0) || (lastAt.get(a) || 0) - (lastAt.get(b) || 0));
  const men = mixed ? priority(pool.filter((id) => genders.get(id) === 'M')).slice(0, n * 2) : [];
  const women = mixed ? priority(pool.filter((id) => genders.get(id) === 'F')).slice(0, n * 2) : [];
  const picked = mixed ? [...men, ...women] : priority(pool).slice(0, n * per);

  const r = (id) => ratings.get(id) ?? 1000;
  const avg = (t) => t.reduce((s, id) => s + r(id), 0) / t.length;

  const teamCost = (A, B) => {
    let c = Math.abs(avg(A) - avg(B));
    if (A.length === 2) c += (partners.get(key(A[0], A[1])) || 0) * PARTNER_PENALTY;
    if (B.length === 2) c += (partners.get(key(B[0], B[1])) || 0) * PARTNER_PENALTY;
    for (const a of A) for (const b of B) c += (opponents.get(key(a, b)) || 0) * OPPONENT_PENALTY;
    return c;
  };

  // 한 코트 4명 → 가능한 3가지 팀 구성 중 최선
  const bestSplit = (g) => {
    if (mixed) {
      // g = [남, 남, 여, 여] → 남1여1 팀 두 가지 경우
      const opts = [
        [[g[0], g[2]], [g[1], g[3]]],
        [[g[0], g[3]], [g[1], g[2]]],
      ];
      let best = null;
      for (const [A, B] of opts) {
        const cost = teamCost(A, B);
        if (!best || cost < best.cost) best = { A, B, cost };
      }
      return best;
    }
    if (g.length === 2) return { A: [g[0]], B: [g[1]], cost: teamCost([g[0]], [g[1]]) };
    const opts = [
      [[g[0], g[1]], [g[2], g[3]]],
      [[g[0], g[2]], [g[1], g[3]]],
      [[g[0], g[3]], [g[1], g[2]]],
    ];
    let best = null;
    for (const [A, B] of opts) {
      const cost = teamCost(A, B);
      if (!best || cost < best.cost) best = { A, B, cost };
    }
    return best;
  };

  // 2) 코트 배분 최적화 (랜덤 탐색)
  let best = null;
  const iters = n === 1 ? 1 : ITERATIONS;
  for (let i = 0; i < iters; i++) {
    const order = i === 0 ? picked : shuffle(picked);
    const om = i === 0 ? men : shuffle(men);
    const ow = i === 0 ? women : shuffle(women);
    const plan = [];
    let total = 0;
    for (let c = 0; c < n; c++) {
      const g = mixed ? [om[c * 2], om[c * 2 + 1], ow[c * 2], ow[c * 2 + 1]] : order.slice(c * per, c * per + per);
      const s = bestSplit(g);
      plan.push(s);
      total += s.cost;
    }
    if (!best || total < best.total) best = { plan, total };
  }

  return best.plan.map((s, i) => ({
    court: courts[i],
    teamA: s.A,
    teamB: s.B,
    gap: Math.round(Math.abs(avg(s.A) - avg(s.B))),
  }));
}
