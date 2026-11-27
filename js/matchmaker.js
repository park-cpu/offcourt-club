// ─────────────────────────────────────────────────────────────
// 자동 대진 생성
// 1) 오늘 경기 수(+ 연속 출전 벌점)가 적은 사람 → 오래 쉰 사람 순으로 우선 선발
// 2) 선발된 인원을 코트·팀으로 나누되 아래 비용이 낮은 조합 선택
//    - 두 팀 평균 레이팅 차이 (NTRP 기반 레이팅)
//    - 오늘 같은 파트너 반복 (큰 페널티)
//    - 오늘 같은 상대 반복 (작은 페널티)
// 3) 가장 좋은 조합과 거의 같은(NEAR_BEST 안) 조합 중 무작위로 하나 → 다시 돌리면 대진이 바뀜 (v1.28.0~)
//
// 성별 규칙 (v1.28.0~, 사용자 지정)
//   복식 = 같은 성별끼리만: 남 2:2 또는 여 2:2
//   혼복 = 한 코트 4명에 남 · 여가 섞임: 남3 · 여1(남남 vs 남녀) / 남2 · 여2(남녀 vs 남녀) / 남1 · 여3(남녀 vs 여여)
//   성별을 모르는 사람(성별 미입력 게스트 등)은 복식 · 혼복 자동 대진에서 빠짐
// ─────────────────────────────────────────────────────────────

const PARTNER_PENALTY = 80;
const OPPONENT_PENALTY = 25;
// 연속 출전 벌점 (v1.27.9~): 방금 경기를 마친 사람은 '경기 1개 더 한 사람'만큼 뒤로 → 쉬던 사람이 먼저 들어감
//   사람이 모자라면 그래도 들어감 (금지가 아니라 '되도록 피하기')
export const REST_PENALTY = 1;
// 공평하게 뛰는 게 실력 균형보다 먼저: 경기 수 1 차이 = 레이팅 차이 300만큼
const LOAD_WEIGHT = 300;
// 최선 조합과 레이팅 30점(약 NTRP 0.15) 안으로 차이 나는 조합은 '거의 같은 조합'으로 보고 무작위로 고름
export const NEAR_BEST = 30;
const ITERATIONS = 600;

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const sexOf = (genders, id) => {
  const g = genders.get(id);
  return g === 'M' || g === 'F' ? g : null;
};

/** 대진에 넣을 수 있는 사람 (복식 · 혼복은 성별 있는 사람만) */
export function eligible(pool, format, genders = new Map()) {
  return format === 'singles' ? pool.slice() : pool.filter((id) => sexOf(genders, id));
}

/** 이 조건으로 몇 코트를 채울 수 있는지 */
export function capacity({ pool, courts, format, genders = new Map() }) {
  if (format === 'singles') return Math.min(courts.length, Math.floor(pool.length / 2));
  const m = pool.filter((id) => sexOf(genders, id) === 'M').length;
  const f = pool.filter((id) => sexOf(genders, id) === 'F').length;
  if (format === 'mixed') return Math.min(courts.length, Math.floor((m + f) / 4), m, f);
  return Math.min(courts.length, Math.floor(m / 4) + Math.floor(f / 4));
}

/** 4명(단식 2명)이 이 방식으로 한 코트에 들어갈 수 있는지 */
export function groupOk(g, format, genders = new Map()) {
  if (format === 'singles') return g.length === 2;
  if (g.length !== 4) return false;
  const m = g.filter((id) => sexOf(genders, id) === 'M').length;
  const f = g.filter((id) => sexOf(genders, id) === 'F').length;
  if (format === 'doubles') return m === 4 || f === 4;
  return m >= 1 && f >= 1 && m + f === 4;
}

/** 한 코트 선수로 만들 수 있는 팀 나누기 (성별 규칙에 맞는 것만) */
export function splitsOf(g, format, genders = new Map()) {
  if (format === 'singles') return [[[g[0]], [g[1]]]];
  if (format === 'mixed') {
    const men = g.filter((id) => sexOf(genders, id) === 'M');
    const women = g.filter((id) => sexOf(genders, id) === 'F');
    // 남2 · 여2 → 남녀 vs 남녀
    if (men.length === 2)
      return [
        [[men[0], women[0]], [men[1], women[1]]],
        [[men[0], women[1]], [men[1], women[0]]],
      ];
    // 남3 · 여1 → 여자와 짝이 될 남자 1명을 고름 (남남 vs 남녀), 남1 · 여3은 반대
    const [one, many] = men.length === 3 ? [women[0], men] : [men[0], women];
    return many.map((x, i) => [[one, x], many.filter((_, j) => j !== i)]);
  }
  return [
    [[g[0], g[1]], [g[2], g[3]]],
    [[g[0], g[2]], [g[1], g[3]]],
    [[g[0], g[3]], [g[1], g[2]]],
  ];
}

/**
 * @param {object} o
 * @param {string[]} o.pool        대진 가능 선수 id (도착 · 귀가X · 경기중X)
 * @param {string[]} o.courts      비어 있는 코트 이름
 * @param {'doubles'|'mixed'|'singles'} o.format
 * @param {Map<string,'M'|'F'>} [o.genders]
 * @param {Map<string,number>} o.ratings
 * @param {object[]} o.todayMatches 오늘(이 일정) 경기들
 * @param {Set<string>} [o.justPlayed] 방금 경기를 마친 사람 (연속 출전 벌점)
 * @returns {{court:string, teamA:string[], teamB:string[], gap:number}[]}
 */
export function generate({ pool, courts, format, ratings, todayMatches, genders = new Map(), justPlayed = new Set() }) {
  const per = format === 'singles' ? 2 : 4;
  const people = eligible(pool, format, genders);
  const n = capacity({ pool: people, courts, format, genders });
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

  // 1) 우선순위: 경기 수(+ 연속 출전 벌점) 적은 순 → 오래 쉰 순 (동률은 랜덤)
  const load = (id) => (played.get(id) || 0) + (justPlayed.has(id) ? REST_PENALTY : 0);
  const base = shuffle(people).sort((a, b) => load(a) - load(b) || (lastAt.get(a) || 0) - (lastAt.get(b) || 0));
  const rank = new Map(base.map((id, i) => [id, i]));

  const r = (id) => ratings.get(id) ?? 1000;
  const avg = (t) => t.reduce((s, id) => s + r(id), 0) / t.length;
  const teamCost = (A, B) => {
    let c = Math.abs(avg(A) - avg(B));
    if (A.length === 2) c += (partners.get(key(A[0], A[1])) || 0) * PARTNER_PENALTY;
    if (B.length === 2) c += (partners.get(key(B[0], B[1])) || 0) * PARTNER_PENALTY;
    for (const a of A) for (const b of B) c += (opponents.get(key(a, b)) || 0) * OPPONENT_PENALTY;
    return c;
  };

  // 우선순위 순서대로 코트를 채움. 성별 규칙상 지금 코트에 못 들어가는 사람은 건너뛰고 다음 코트에서 먼저 봄
  const fill = (order) => {
    const groups = [];
    if (format === 'doubles') {
      const bucket = { M: [], F: [] };
      for (const id of order) {
        const b = bucket[sexOf(genders, id)];
        b.push(id);
        if (b.length === 4) groups.push(b.splice(0));
        if (groups.length === n) break;
      }
      return groups.length === n ? groups : null;
    }
    const rest = order.slice();
    while (groups.length < n) {
      const cur = [];
      for (let i = 0; i < rest.length && cur.length < per; i++) {
        const id = rest[i];
        // 혼복: 4번째 자리에 이미 있는 3명과 같은 성별이면 남자만 · 여자만 코트가 되므로 건너뜀
        if (format === 'mixed' && cur.length === 3 && cur.every((x) => sexOf(genders, x) === sexOf(genders, id))) continue;
        cur.push(id);
        rest.splice(i--, 1);
      }
      if (!groupOk(cur, format, genders)) return null;
      groups.push(cur);
    }
    return groups;
  };

  // 2) 순서를 조금씩 흔들어(같은 경기 수 안에서만) 여러 조합을 만들어 봄
  const plans = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const order = i === 0 ? base : base.map((id) => [id, load(id) + Math.random() * 0.9]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    const groups = fill(order);
    if (!groups) continue;
    let total = 0;
    const plan = shuffle(groups).map((g) => {
      // 그 코트 안 팀 나누기도 거의 같은 것 중 무작위
      const opts = splitsOf(g, format, genders).map(([A, B]) => ({ A, B, cost: teamCost(A, B) }));
      const min = Math.min(...opts.map((o) => o.cost));
      const s = pickRandom(opts.filter((o) => o.cost <= min + NEAR_BEST));
      total += s.cost + g.reduce((acc, id) => acc + load(id) * LOAD_WEIGHT + rank.get(id) * 0.5, 0);
      return s;
    });
    plans.push({ plan, total });
  }
  if (!plans.length) return [];

  // 3) 가장 좋은 조합과 거의 같은 것 중 무작위
  const bestTotal = Math.min(...plans.map((p) => p.total));
  const pick = pickRandom(plans.filter((p) => p.total <= bestTotal + NEAR_BEST * n));
  return pick.plan.map((s, i) => ({
    court: courts[i],
    teamA: s.A,
    teamB: s.B,
    gap: Math.round(Math.abs(avg(s.A) - avg(s.B))),
  }));
}
