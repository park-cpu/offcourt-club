// ─────────────────────────────────────────────────────────────
// 레이팅 · 시즌 포인트 · 코인 계산 규칙
// 모든 수치는 "저장된 경기 기록"에서 매번 다시 계산됩니다.
// 그래서 점수를 수정/취소하면 코인·레이팅·순위가 자동으로 바로잡힙니다.
// ─────────────────────────────────────────────────────────────

export const RULES = {
  // NTRP → 시작 레이팅. NTRP 3.0 = 1000, 0.5 차이마다 100점
  ratingBase: 1000,
  ratingPerNtrp: 200,
  // K 계수: 처음 10경기는 빠르게 자리 잡도록 크게
  kProvisional: 32,
  kNormal: 20,
  provisionalGames: 10,
  // 시즌 포인트는 경기 수와 상관없이 모두 같은 K로 계산 (신입 포인트 부풀림 방지)
  kSeason: 20,
  // 시즌 포인트: 경기 참여 보너스
  participationBonus: 1,
  // 코인전 랭킹: 코인 순수익 1개당 더하는 점수
  coinPoint: 10,
  // 아바타 꾸미기용 '볼' (코인전 코인과 별개)
  balls: {
    start: 300, // 모든 회원 기본 지급 (v1.8.0~)
    attend: 10, // 도착 체크 1번
    play: 5, // 경기 1번 (친선전·게스트 경기 포함)
    win: 5, // 승리 1번 추가 (친선전 제외)
    weekly: [
      { id: 'attend2', label: '이번 주 2번 출석', kind: 'attend', goal: 2, reward: 20 },
      { id: 'play6', label: '이번 주 6경기', kind: 'play', goal: 6, reward: 20 },
      { id: 'win3', label: '이번 주 3승', kind: 'win', goal: 3, reward: 30 },
    ],
  },
};

export const MATCH_TYPES = {
  coin: { label: '코인전', short: 'COIN', desc: '승패 · 레이팅 · 코인' },
  official: { label: '공식전', short: 'OFFICIAL', desc: '승패 · 레이팅' },
  friendly: { label: '친선전', short: 'FRIENDLY', desc: '기록 없음 · 출석만' },
};

const localYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const ntrpToRating = (ntrp) =>
  RULES.ratingBase + ((Number(ntrp) || 3) - 3) * RULES.ratingPerNtrp;

export const ratingToNtrp = (r) => {
  const n = 3 + (r - RULES.ratingBase) / RULES.ratingPerNtrp;
  return Math.max(1, Math.min(7, Math.round(n * 10) / 10));
};

export const expected = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

// 점수차 가중치: 7:6 / 6:5 → 1.0, 6:4 → 1.1 … 6:0 → 1.5
export const marginMult = (a, b) => {
  const d = Math.abs((a || 0) - (b || 0));
  return 1 + 0.1 * Math.max(0, Math.min(d, 6) - 1);
};

// 코인전 판돈: 기본 1개, 베이글(6:0 등 패자 0게임)이면 2개
export const coinStake = (m) => {
  const lo = Math.min(m.scoreA, m.scoreB);
  const hi = Math.max(m.scoreA, m.scoreB);
  return lo === 0 && hi >= 6 ? 2 : 1;
};

export const winnerSide = (m) =>
  m.scoreA > m.scoreB ? 'A' : m.scoreB > m.scoreA ? 'B' : null;

export const hasGuest = (m, players) => [...m.teamA, ...m.teamB].some((id) => !players.has(id));

// 레이팅·전적·순위에 반영되는 경기: 완료 + 코인전/공식전 + 승패 있음 + 게스트 없음
export const isRated = (m, players) =>
  m.status === 'done' && (m.type === 'coin' || m.type === 'official') && !!winnerSide(m) && !hasGuest(m, players);

// 경기 정렬 키 (날짜 → 생성 순)
export const matchOrder = (a, b) =>
  (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0);

/**
 * 전체 경기를 시간순으로 돌며 레이팅을 갱신.
 * @returns {ratings, deltas: Map<matchId, Map<playerId, number>>, spDeltas: 시즌 포인트용(고정 K) 변동, expectations}
 */
export function computeRatings(players, guests, matches) {
  const ratings = new Map();
  const games = new Map();
  const seed = (id) => {
    if (!ratings.has(id)) {
      const p = players.get(id) || guests.get(id);
      ratings.set(id, ntrpToRating(p ? p.ntrp : 3));
      games.set(id, 0);
    }
    return ratings.get(id);
  };
  const isGuest = (id) => !players.has(id);
  const deltas = new Map();
  const spDeltas = new Map();
  const expectations = new Map();

  const rated = matches.filter((m) => isRated(m, players)).sort(matchOrder);
  for (const m of rated) {
    const ra = avg(m.teamA.map(seed));
    const rb = avg(m.teamB.map(seed));
    const ea = expected(ra, rb);
    expectations.set(m.id, ea);
    const sa = winnerSide(m) === 'A' ? 1 : 0;
    const mult = marginMult(m.scoreA, m.scoreB);
    const d = new Map();
    const sd = new Map();
    const apply = (id, s, e) => {
      if (isGuest(id)) return; // 게스트 레이팅은 고정
      const k = games.get(id) < RULES.provisionalGames ? RULES.kProvisional : RULES.kNormal;
      const delta = k * mult * (s - e);
      ratings.set(id, ratings.get(id) + delta);
      games.set(id, games.get(id) + 1);
      d.set(id, delta);
      sd.set(id, RULES.kSeason * mult * (s - e));
    };
    m.teamA.forEach((id) => apply(id, sa, ea));
    m.teamB.forEach((id) => apply(id, 1 - sa, 1 - ea));
    deltas.set(m.id, d);
    spDeltas.set(m.id, sd);
  }
  for (const id of players.keys()) seed(id);
  return { ratings, deltas, spDeltas, expectations };
}

const avg = (arr) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);

/** 선수별 전적(기간 필터 가능) + 시즌 포인트 */
/**
 * 전적 · 시즌 포인트
 * type: 생략 = 코인전+공식전 전체 / 'official' = 공식전만 / 'coin' = 코인전만
 * 코인전 포인트 = 레이팅 변동 + 경기당 1점 + 코인 순수익 × coinPoint
 * deltas 에는 시즌 포인트용(고정 K) 변동(spDeltas)을 넘김
 */
export function computeStats(players, matches, deltas, range, type) {
  const stats = new Map();
  for (const id of players.keys())
    stats.set(id, { games: 0, wins: 0, losses: 0, gw: 0, gl: 0, sp: 0, coins: 0, streak: 0, best: 0, form: [] });
  const inRange = (m) => !range || ((!range.start || m.date >= range.start) && (!range.end || m.date <= range.end));
  // type 'singles' = 단식(1:1) 공식전 · 코인전 합산
  const typeOk = (m) => !type || (type === 'singles' ? m.teamA.length === 1 && m.teamB.length === 1 && (m.type === 'official' || m.type === 'coin') : m.type === type);
  const list = matches.filter((m) => isRated(m, players) && inRange(m) && typeOk(m)).sort(matchOrder);
  for (const m of list) {
    const w = winnerSide(m);
    const d = deltas.get(m.id) || new Map();
    const stake = m.type === 'coin' ? coinStake(m) : 0;
    const side = (ids, me, them, won) =>
      ids.forEach((id) => {
        const s = stats.get(id);
        if (!s) return;
        s.games++;
        won ? s.wins++ : s.losses++;
        s.gw += me;
        s.gl += them;
        const c = won ? stake : -stake;
        s.coins += c;
        s.sp += (d.get(id) || 0) + RULES.participationBonus + (type === 'coin' ? c * RULES.coinPoint : 0);
        s.streak = won ? Math.max(1, s.streak + 1) : Math.min(-1, s.streak - 1);
        s.best = Math.max(s.best, s.streak);
        s.form.push(won ? 'W' : 'L');
      });
    side(m.teamA, m.scoreA, m.scoreB, w === 'A');
    side(m.teamB, m.scoreB, m.scoreA, w === 'B');
  }
  for (const s of stats.values()) {
    s.winRate = s.games ? s.wins / s.games : 0;
    s.form = s.form.slice(-5);
  }
  return stats;
}

/**
 * 코인 잔액 = 초기 지급 + 출석 + 관리자 지급/회수 + 코인전 정산 + 대출
 * 모든 이벤트를 시간순으로 처리합니다 (대출 상환이 순서에 따라 달라지므로).
 *
 * 대출 규칙
 *  - 잔액 0 이하 + 남은 대출 없음 → 대출 신청 가능 (settings.loanAmount 개)
 *  - 대출 중에는 출석 코인이 잔액 대신 대출 상환에 쓰임
 *  - 잔액으로 직접 상환 가능 / 관리자가 탕감 가능
 * coinLogs.kind: undefined(관리자 조정) | 'loan' | 'repay' | 'forgive'
 */
export function computeCoins(players, attendance, coinLogs, matches, settings) {
  const bal = new Map();
  const debt = new Map();
  const loans = new Map();
  const ledger = new Map();
  const events = [];
  const ev = (date, at, fn) => events.push({ date: date || '', at: at || 0, fn });
  const entry = (id, amount, reason, date, ref) => ledger.get(id).push({ amount, reason, date, ref });

  for (const [id, p] of players) {
    bal.set(id, 0);
    debt.set(id, 0);
    loans.set(id, 0);
    ledger.set(id, []);
    const d = p.createdAt ? localYmd(new Date(p.createdAt)) : '';
    ev(d, -1, () => {
      bal.set(id, bal.get(id) + (settings.initialCoins ?? 3));
      entry(id, settings.initialCoins ?? 3, '가입 지급', d);
    });
  }
  const coin = settings.attendCoin ?? 1;
  for (const a of attendance) {
    if (!a.arrived || a.isGuest || !players.has(a.playerId)) continue;
    ev(a.date, a.createdAt, () => {
      const id = a.playerId;
      const repay = Math.min(coin, debt.get(id));
      if (repay > 0) {
        debt.set(id, debt.get(id) - repay);
        entry(id, coin - repay, `출석 (대출 상환 ${repay})`, a.date, a.scheduleId);
      } else entry(id, coin, '출석', a.date, a.scheduleId);
      bal.set(id, bal.get(id) + coin - repay);
    });
  }
  for (const c of coinLogs) {
    if (!players.has(c.playerId)) continue;
    ev(c.date, c.at, () => {
      const id = c.playerId;
      if (c.kind === 'loan') {
        bal.set(id, bal.get(id) + c.amount);
        debt.set(id, debt.get(id) + c.amount);
        loans.set(id, loans.get(id) + 1);
        entry(id, c.amount, '대출', c.date, c.id);
      } else if (c.kind === 'repay') {
        const n = Math.min(c.amount, debt.get(id));
        bal.set(id, bal.get(id) - n);
        debt.set(id, debt.get(id) - n);
        entry(id, -n, '대출 상환', c.date, c.id);
      } else if (c.kind === 'forgive') {
        entry(id, 0, `대출 탕감 (${debt.get(id)})`, c.date, c.id);
        debt.set(id, 0);
      } else {
        bal.set(id, bal.get(id) + c.amount);
        entry(id, c.amount, c.reason || '관리자 조정', c.date, c.id);
      }
    });
  }
  for (const m of matches) {
    if (m.type !== 'coin' || m.status !== 'done' || hasGuest(m, players)) continue;
    const w = winnerSide(m);
    if (!w) continue;
    ev(m.date, m.createdAt, () => {
      const stake = coinStake(m);
      const label = `코인전 ${m.scoreA}:${m.scoreB}`;
      (w === 'A' ? m.teamA : m.teamB).forEach((id) => {
        bal.set(id, bal.get(id) + stake);
        entry(id, stake, label + ' 승', m.date, m.id);
      });
      (w === 'A' ? m.teamB : m.teamA).forEach((id) => {
        bal.set(id, bal.get(id) - stake);
        entry(id, -stake, label + ' 패', m.date, m.id);
      });
    });
  }
  events.sort((x, y) => x.date.localeCompare(y.date) || x.at - y.at).forEach((e) => e.fn());
  for (const l of ledger.values()) l.reverse();
  return { bal, debt, loans, ledger };
}

/** 대출 가능 여부 */
export const canBorrow = (coins, id) => (coins.bal.get(id) ?? 0) <= 0 && (coins.debt.get(id) ?? 0) === 0;

// ── 파트너 궁합 · 상대 전적 ─────────────────────────────
// 레이팅 반영 경기(isRated)만 사용 → 게스트 경기·친선전 제외
export function computeRelations(id, matches, players) {
  const partners = new Map();
  const opponents = new Map();
  const bump = (map, key, win) => {
    const x = map.get(key) || { id: key, games: 0, wins: 0, losses: 0 };
    x.games++;
    win ? x.wins++ : x.losses++;
    map.set(key, x);
  };
  for (const m of matches) {
    if (!isRated(m, players)) continue;
    const side = m.teamA.includes(id) ? 'A' : m.teamB.includes(id) ? 'B' : null;
    if (!side) continue;
    const mine = side === 'A' ? m.teamA : m.teamB;
    const theirs = side === 'A' ? m.teamB : m.teamA;
    const win = winnerSide(m) === side;
    mine.filter((x) => x !== id).forEach((x) => bump(partners, x, win));
    theirs.forEach((x) => bump(opponents, x, win));
  }
  const sort = (a, b) => b.games - a.games || b.wins / b.games - a.wins / a.games;
  return { partners: [...partners.values()].sort(sort), opponents: [...opponents.values()].sort(sort) };
}

// ── 아바타 꾸미기용 볼 ─────────────────────────────────
// 출석 · 경기 · 승리 · 주간 미션으로 쌓이고, 아이템 구매(purchases)로 줄어듦
// weekOf(date) → 그 주 월요일 (store.js의 weekStart를 넘겨받음)
// rulesAt(date) → 그날 적용되는 볼 규칙 (관리자가 바꾼 날부터 새 규칙), weekRules(월요일) → 그 주 미션
export const MISSION_KINDS = [['attend', '출석'], ['play', '경기'], ['win', '승리']];
export const missionLabel = (m) => `이번 주 ${m.goal}${m.kind === 'attend' ? '번 출석' : m.kind === 'play' ? '경기' : '승'}`;
// grants = ballLogs (관리자 지급 · 회수 {playerId, amount, reason, date})
export function computeBalls(players, attendance, matches, purchases, weekOf, rulesAt = () => RULES.balls, weekRules = () => RULES.balls, grants = []) {
  const bal = new Map();
  const days = new Map(); // id → Map(date → {attend, play, win})
  const weeks = new Map(); // id → Map(week → {attend, play, win})
  const ledger = new Map();
  for (const id of players.keys()) {
    bal.set(id, RULES.balls.start);
    days.set(id, new Map());
    weeks.set(id, new Map());
    ledger.set(id, [{ date: '', amount: RULES.balls.start, reason: '기본 지급' }]);
  }
  const bump = (id, date, kind) => {
    if (!players.has(id) || !date) return;
    const d = days.get(id);
    const x = d.get(date) || { attend: 0, play: 0, win: 0 };
    x[kind]++;
    d.set(date, x);
    const wk = weekOf(date);
    const w = weeks.get(id);
    const y = w.get(wk) || { attend: 0, play: 0, win: 0 };
    y[kind]++;
    w.set(wk, y);
  };
  for (const a of attendance) if (a.arrived && !a.isGuest) bump(a.playerId, a.date, 'attend');
  for (const m of matches) {
    if (m.status !== 'done') continue;
    const w = winnerSide(m);
    for (const id of [...m.teamA, ...m.teamB]) bump(id, m.date, 'play');
    if (w && m.type !== 'friendly') (w === 'A' ? m.teamA : m.teamB).forEach((id) => bump(id, m.date, 'win'));
  }
  for (const [id, d] of days) {
    for (const [date, x] of d) {
      const B = rulesAt(date);
      const amount = x.attend * B.attend + x.play * B.play + x.win * B.win;
      if (!amount) continue;
      const parts = [x.attend && '출석', x.play && `${x.play}경기`, x.win && `${x.win}승`].filter(Boolean).join(' · ');
      ledger.get(id).push({ date, amount, reason: parts });
      bal.set(id, bal.get(id) + amount);
    }
    for (const [wk, x] of weeks.get(id))
      for (const ms of weekRules(wk).weekly)
        if (x[ms.kind] >= ms.goal) {
          ledger.get(id).push({ date: wk, amount: ms.reward, reason: `주간 미션 · ${missionLabel(ms)}`, at: 1 });
          bal.set(id, bal.get(id) + ms.reward);
        }
  }
  for (const g of grants) {
    if (!players.has(g.playerId)) continue;
    const n = Math.trunc(Number(g.amount) || 0);
    bal.set(g.playerId, bal.get(g.playerId) + n);
    ledger.get(g.playerId).push({ date: g.date || '', amount: n, reason: g.reason || '관리자 지급', at: g.at || 0 });
  }
  for (const p of purchases) {
    if (!players.has(p.playerId)) continue;
    const n = Number(p.price) || 0;
    bal.set(p.playerId, bal.get(p.playerId) - n);
    ledger.get(p.playerId).push({ date: p.date || '', amount: -n, reason: `구매 · ${p.itemName || '아이템'}`, at: p.at || 0 });
  }
  for (const l of ledger.values()) l.sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));
  return { bal, weeks, ledger };
}
