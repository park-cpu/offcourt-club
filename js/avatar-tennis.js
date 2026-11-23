// ─────────────────────────────────────────────────────────────
// 테니스 의류 · 신발 (실제 브랜드 제품을 모티브로 한 기본 아이템)
//   역할 격자(글자)에 무늬를 칠하는 방식 — 색은 pixel.js가 칠함
//   상의 강조색 a · b / 하의 강조색 v / 신발 강조색 w · 밑창 e / 양말 y Y z (고정 흰색)
//   ty = 템플릿 줄 번호 (실제 줄 = ty + A.dy)
//   id는 'b_t…' — 한 번 정하면 바꾸지 마세요 (구매 기록이 id로 연결됨)
// ─────────────────────────────────────────────────────────────
const TOP = 'TtucnNabA';
const BOT = 'PqQgvV';
const SHO = 'OfFGwe';

// 성별별 위치 (템플릿 줄 번호)
const GEO = {
  M: { neck: 28, collar: 29, chest: 32, sleeve: 31, short: 35, tank: 31, hem: 45, shortsEnd: 52, sock: 61, skirt: [46, 51], sole: 70, logo: 67 },
  F: { neck: 30, collar: 31, chest: 34, sleeve: 32, short: 36, tank: 32, hem: 42, shortsEnd: 49, sock: 54, skirt: [43, 49], sole: 60, logo: 59 },
};
const sexOf = (A) => A.sex || (A.dy === 2 ? 'F' : 'M');

function api(g, A) {
  const sex = sexOf(A);
  const G = GEO[sex];
  const get = (x, ty) => g.get(x, ty + A.dy);
  const set = (x, ty, r) => g.set(x, ty + A.dy, r);
  const is = (x, ty, roles) => {
    const r = get(x, ty);
    return !!r && roles.includes(r);
  };
  return { sex, G, get, set, is };
}

// ── 상의 기본 정리: 재킷 안쪽 셔츠·옷깃 줄을 없애 깔끔한 티셔츠로 ──
function plainTop(g, A) {
  const { sex, G, get, set, is } = api(g, A);
  const t0 = G.collar - 2, t1 = sex === 'F' ? 46 : 45;
  const snap = [];
  const old = new Map();
  for (let ty = t0; ty <= t1; ty++) for (let x = 0; x < g.w; x++) { snap.push([x, ty, get(x, ty)]); old.set(ty * 100 + x, get(x, ty)); }
  const at = (x, ty) => (ty >= t0 && ty <= t1 ? old.get(ty * 100 + x) : get(x, ty));
  for (const [x, ty, r] of snap) {
    if (!r || !TOP.includes(r)) continue;
    if (r === 'n' || r === 'N') { set(x, ty, 't'); continue; }
    if (r === 'c' && ty > G.collar) { set(x, ty, 't'); continue; }
    if (r === 'T') {
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => at(x + dx, ty + dy));
      if (n.every((v) => v && TOP.includes(v))) set(x, ty, (x === 8 || x === 22) && ty > G.sleeve ? 'u' : 't');
    }
  }
  // 여자: 재킷 아랫단(엉덩이 부분)은 하의로
  if (sex === 'F') {
    for (let ty = 43; ty <= 46; ty++)
      for (let x = 7; x <= 23; x++) {
        const r = get(x, ty);
        if (r && TOP.includes(r)) set(x, ty, r === 'T' ? 'P' : r === 'u' ? 'Q' : 'q');
      }
  }
}

// 소매를 맨팔로 (from 줄부터 아래)
function bareArms(g, A, from) {
  const { sex, set, is } = api(g, A);
  const end = sex === 'F' ? 41 : 41;
  const L = { 4: 'L', 5: 'S', 6: 'S', 7: 's' }, R = { 23: 's', 24: 'S', 25: 'S', 26: 'L' };
  for (let ty = from; ty <= end; ty++)
    for (const [x, r] of [...Object.entries(L), ...Object.entries(R)]) if (is(+x, ty, TOP)) set(+x, ty, r);
  for (const x of [4, 5, 6, 7, 23, 24, 25, 26]) if (is(x, from - 1, TOP)) set(x, from - 1, 'T');
}
const sleeveCells = (x) => (x >= 5 && x <= 7) || (x >= 23 && x <= 25);

// 상의 무늬 조합기
function top(...steps) {
  return (g, A) => {
    plainTop(g, A);
    for (const s of steps) s(g, A, api(g, A));
  };
}
const shortSleeve = (g, A, { G }) => bareArms(g, A, G.short);
const sleeveless = (g, A, { G }) => bareArms(g, A, G.tank);
// 가슴 로고 (보는 사람 기준 오른쪽 가슴). pts = [dx, dy] 목록
const chest = (pts, r = 'a') => (g, A, { G, set, is }) => pts.forEach(([dx, dy]) => is(17 + dx, G.chest + dy, TOP) && set(17 + dx, G.chest + dy, r));
const SWOOSH = [[0, 0], [1, 1], [2, 1], [3, 0]];
const CROC = [[1, 0], [2, 0]];
const BAR = [[0, 0], [1, 0], [2, 0]];
const DIAMOND = [[1, 0], [0, 1], [2, 1], [1, 2]];
// 옷깃 색
const collar = (r) => (g, A, { G, set, is }) => {
  for (let ty = G.collar - 1; ty <= G.collar; ty++) for (let x = 10; x <= 20; x++) if (is(x, ty, 'c')) set(x, ty, r);
};
// 폴로 카라 + 단추 줄
const polo = (r = 'c') => (g, A, { G, set, is }) => {
  for (let x = 11; x <= 19; x++) if (is(x, G.collar + 1, TOP)) set(x, G.collar + 1, r);
  for (const x of [11, 19]) is(x, G.collar + 2, TOP) && set(x, G.collar + 2, r);
  for (let ty = G.collar + 1; ty <= G.collar + 4; ty++) set(15, ty, ty === G.collar + 1 ? r : 'u');
  set(15, G.collar + 3, 'a');
};
// 지퍼 (full = 끝까지)
const zip = (full) => (g, A, { G, set, is, sex }) => {
  const end = full ? (sex === 'F' ? 42 : 41) : G.chest + 3;
  for (let ty = G.collar; ty <= end; ty++) if (is(15, ty, TOP)) set(15, ty, 'a');
  is(16, G.collar + 2, TOP) && set(16, G.collar + 2, 'b');
};
// 목을 덮는 스탠드 카라 (트랙 재킷 · 쿼터집)
const standCollar = (r = 't') => (g, A, { G, get, set }) => {
  for (let x = 10; x <= 20; x++) {
    const v = get(x, G.neck);
    if (v === 's' || v === 'S' || v === 'L') set(x, G.neck, r);
  }
};
// 소매 줄 (세로)
const sleeveStripes = (r, cols = [5, 7, 23, 25]) => (g, A, { G, set, is }) => {
  for (let ty = G.sleeve - 1; ty <= 41; ty++) for (const x of cols) if (is(x, ty, 'tu')) set(x, ty, r);
};
// 소매 전체 색 (컬러 블록)
const sleeveColor = (r) => (g, A, { set, is }) => {
  for (let ty = 26; ty <= 42; ty++) for (let x = 0; x < 31; x++) if (sleeveCells(x) && is(x, ty, 'tu')) set(x, ty, r);
};
// 가로 띠 (ty 오프셋은 가슴 기준)
const band = (dy, r, onlyBody = false) => (g, A, { G, set, is }) => {
  for (let x = 0; x < 31; x++) if ((!onlyBody || (x >= 9 && x <= 21)) && is(x, G.chest + dy, 'tu')) set(x, G.chest + dy, r);
};
// 어깨 → 옆구리 사선 블록
const diagonal = (r) => (g, A, { G, set, is }) => {
  for (let ty = G.chest - 1; ty <= G.chest + 9; ty++) {
    const k = ty - (G.chest - 1);
    for (let x = 9; x <= 21; x++) if (x - 9 >= k + 2 && is(x, ty, 'tu')) set(x, ty, r);
  }
};
// 후디: 끈 + 앞주머니 + 목 둘레 후드
const hoodie = (g, A, { G, set, is, get }) => {
  for (let x = 9; x <= 21; x++) {
    const v = get(x, G.neck);
    if (v === 's' || v === 'S') set(x, G.neck, 'u');
  }
  for (const x of [13, 17]) for (let ty = G.collar + 1; ty <= G.collar + 4; ty++) is(x, ty, TOP) && set(x, ty, 'a');
  const p0 = G.chest + 5, p1 = G.chest + 9;
  for (let ty = p0; ty <= p1; ty++) for (let x = 10; x <= 20; x++) if (is(x, ty, TOP) && (ty === p0 || x === 10 || x === 20)) set(x, ty, 'u');
};

// ── 하의 ──
const SKIN = { P: 'L', q: 'S', g: 'S', Q: 's', v: 'S', V: 's' };
const SOCK = { P: 'z', q: 'y', g: 'y', Q: 'Y', v: 'y', V: 'Y' };
function bareLegs(g, A, from, sockFrom) {
  const { get, set } = api(g, A);
  for (let ty = from; ty <= 66; ty++)
    for (let x = 0; x < 31; x++) {
      const r = get(x, ty);
      if (r && BOT.includes(r)) set(x, ty, ty >= sockFrom ? SOCK[r] : SKIN[r]);
    }
}
function bottom(...steps) {
  return (g, A) => {
    for (const s of steps) s(g, A, api(g, A));
  };
}
const shorts = (end = 0) => (g, A, { G }) => bareLegs(g, A, G.shortsEnd + 1 + end, G.sock);
// 바지 옆선 (바깥쪽 다리)
const sideStripe = (r = 'v', from = 0) => (g, A, { set, is }) => {
  for (let ty = 43 + from; ty <= 66; ty++) for (const x of [9, 21]) if (is(x, ty, 'qQg')) set(x, ty, r);
};
// 조거: 발목 밴드
const cuffs = (g, A, { sex, get, set }) => {
  const rows = sex === 'F' ? [55, 56] : [62, 63];
  for (const ty of rows) for (let x = 0; x < 31; x++) if ('qg'.includes(get(x, ty) || '.')) set(x, ty, 'Q');
};
// 다리 로고 (보는 사람 기준 왼쪽 허벅지)
const legLogo = (pts, r = 'v') => (g, A, { sex, set, is }) => {
  const y0 = sex === 'F' ? 47 : 49;
  pts.forEach(([dx, dy]) => is(10 + dx, y0 + dy, 'qQg') && set(10 + dx, y0 + dy, r));
};
// 플리츠 스커트
const skirt = (pleat = 'Q', hem = null) => (g, A, { G, sex, set }) => {
  const [s0, s1] = G.skirt;
  for (let ty = s0; ty <= s1; ty++) {
    const k = ty - s0;
    const w = Math.min(2, Math.floor(k / 2));
    const x0 = 8 - w, x1 = 22 + w;
    for (let x = x0; x <= x1; x++) {
      let r = (x - x0) % 3 === 2 ? pleat : 'q';
      if (x === x0 || x === x1 || ty === s1) r = 'P';
      else if (hem && ty === s1 - 1) r = hem;
      set(x, ty, r);
    }
  }
  bareLegs(g, A, s1 + 1, G.sock);
};

// ── 신발 ──
function shoes(...steps) {
  return (g, A) => {
    for (const s of steps) s(g, A, api(g, A));
  };
}
// 밑창 (흰색 등)
const sole = (g, A, { G, get, set }) => {
  for (let x = 0; x < 31; x++) if ('OF'.includes(get(x, G.sole) || '.') && get(x, G.sole + 1)) set(x, G.sole, 'e');
};
// 옆면 로고: 남자는 두 줄짜리, 여자는 한 줄
const SHOE_LOGO = {
  swoosh: { M: [[0, 1], [1, 2], [2, 2], [3, 1], [4, 0]], F: [[0, 0], [1, 0], [2, 0]] },
  stripes3: { M: [[0, 2], [1, 1], [2, 2], [3, 1], [4, 2], [5, 1]], F: [[0, 0], [2, 0], [4, 0]] },
  cross: { M: [[0, 0], [1, 1], [2, 2], [4, 0], [3, 1], [2, 1]], F: [[0, 0], [1, 0], [3, 0]] },
  nb: { M: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 2], [2, 1], [2, 0]], F: [[0, 0], [1, 0], [2, 0]] },
  heel: { M: [[4, 0], [4, 1], [4, 2]], F: [[3, 0], [4, 0]] },
  dash: { M: [[1, 1], [2, 1], [3, 1]], F: [[1, 0], [2, 0]] },
};
const shoeLogo = (name, r = 'w') => (g, A, { sex, G, set, is }) => {
  const pts = SHOE_LOGO[name][sex];
  const lefts = sex === 'F' ? [9, 17] : [6, 19];
  lefts.forEach((x0, i) =>
    pts.forEach(([dx, dy]) => {
      // 오른발은 좌우 뒤집기
      const x = i === 0 ? x0 + dx : x0 + (pts.reduce((m, p) => Math.max(m, p[0]), 0) - dx);
      if (is(x, G.logo + dy, 'fFG')) set(x, G.logo + dy, r);
    })
  );
};
// 발등 색
const upper = (r) => (g, A, { sex, set, is }) => {
  const rows = sex === 'F' ? [58] : [66, 67];
  for (const ty of rows) for (let x = 0; x < 31; x++) if (is(x, ty, 'fG')) set(x, ty, r);
};

// ── 아이템 목록 ──
const wear = (id, name, slot, price, color, acc, pattern) => ({ id, name, cat: 'wear', slot, price, builtin: true, color, acc, pattern, brand: name.split(' ')[0] });
const W = '#f4f2ea';

export const TENNIS_ITEMS = [
  // 상의
  wear('b_t_nk_adv', '나이키코트 드라이핏 어드밴티지 탑', 'top', 90, '#1f2a55', { a: W }, top(shortSleeve, chest(SWOOSH))),
  wear('b_t_nk_slam', '나이키코트 슬램 민소매', 'top', 110, '#c6e03a', { a: '#1a1a1f' }, top(sleeveless, chest(SWOOSH), band(6, 'a', true))),
  wear('b_t_nk_heritage', '나이키코트 헤리티지 후디', 'top', 140, '#8d929a', { a: W }, top(hoodie, chest(SWOOSH, 'a'))),
  wear('b_t_ad_club', '아디다스 클럽 3S 티', 'top', 80, '#2a4fa8', { a: W }, top(shortSleeve, sleeveStripes('a'), chest(BAR))),
  wear('b_t_ad_track', '아디다스 파이어버드 트랙 재킷', 'top', 150, '#1b1b20', { a: W, b: '#d8d6cc' }, top(standCollar('t'), zip(true), sleeveStripes('a'))),
  wear('b_t_lc_polo', '라코스테 울트라드라이 폴로', 'top', 120, '#24365e', { a: '#3f9a4f' }, top(shortSleeve, polo('c'), chest(CROC))),
  wear('b_t_fl_heritage', '휠라 헤리티지 티', 'top', 90, '#ecebe3', { a: '#1e2c66', b: '#d8392b' }, top(shortSleeve, band(0, 'a'), band(1, 'a'), band(2, 'b'))),
  wear('b_t_yx_tour', '요넥스 투어 엘리트 티', 'top', 100, '#2a6fd6', { a: '#c6e03a' }, top(shortSleeve, diagonal('a'), chest(DIAMOND, 'a'))),
  wear('b_t_wl_qzip', '윌슨 팀 쿼터집', 'top', 130, '#c8292f', { a: W, b: '#d8d6cc' }, top(standCollar('t'), zip(false), chest(BAR))),
  wear('b_t_as_tank', '아식스 코트 탱크탑', 'top', 90, '#f06f5a', { a: '#1f2a55' }, top(sleeveless, chest(CROC), collar('a'))),
  wear('b_t_uq_dryex', '유니클로 드라이EX 크루넥 티', 'top', 70, '#3b7d63', { a: W }, top(shortSleeve, sleeveColor('u'))),
  wear('b_t_bb_perf', '바볼랏 퍼포먼스 크루 티', 'top', 90, '#f08a24', { a: '#1f3c8c' }, top(shortSleeve, sleeveColor('a'), chest(BAR, 'a'))),
  // 하의
  wear('b_t_nk_victory', '나이키코트 빅토리 반바지', 'bottom', 70, '#1c1c22', { v: W }, bottom(shorts(), legLogo(SWOOSH))),
  wear('b_t_ad_club_sh', '아디다스 클럽 3S 반바지', 'bottom', 70, '#1f2a55', { v: W }, bottom(sideStripe(), shorts())),
  wear('b_t_ad_tiro', '아디다스 티로 트레이닝 팬츠', 'bottom', 110, '#1b1b20', { v: W }, bottom(sideStripe())),
  wear('b_t_nk_jogger', '나이키 드라이핏 조거 팬츠', 'bottom', 100, '#5d636c', { v: W }, bottom(cuffs, legLogo([[0, 0], [1, 1], [2, 0]]))),
  wear('b_t_lc_short', '라코스테 스포츠 반바지', 'bottom', 80, '#2f5d4a', { v: '#3f9a4f' }, bottom(shorts(), legLogo(CROC))),
  wear('b_t_fl_skirt', '휠라 플리츠 스커트', 'bottom', 100, '#1e2c66', {}, bottom(skirt('Q', 'g'))),
  wear('b_t_nk_skirt', '나이키코트 빅토리 스커트', 'bottom', 100, '#b59ad8', {}, bottom(skirt('Q'))),
  wear('b_t_yx_short', '요넥스 투어 반바지', 'bottom', 70, '#2a6fd6', { v: '#c6e03a' }, bottom(sideStripe('v'), shorts())),
  // 신발
  wear('b_t_nk_vapor', '나이키 줌 베이퍼 11', 'shoes', 160, '#cfe23a', { w: '#1a1a1f', e: W }, shoes(sole, shoeLogo('swoosh'))),
  wear('b_t_ad_barricade', '아디다스 바리케이드 13', 'shoes', 150, '#e6e4dc', { w: '#2a4fa8', e: '#2a4fa8' }, shoes(sole, shoeLogo('stripes3'))),
  wear('b_t_as_gelres', '아식스 젤 레졸루션 9', 'shoes', 150, '#2b56c8', { w: W, e: W }, shoes(sole, shoeLogo('cross'))),
  wear('b_t_nb_996', '뉴발란스 996v5', 'shoes', 130, '#9aa0a6', { w: '#c8292f', e: W }, shoes(sole, shoeLogo('nb'))),
  wear('b_t_yx_eclipsion', '요넥스 파워쿠션 에클립션 5', 'shoes', 140, '#d8392b', { w: '#1a1a1f', e: W }, shoes(sole, shoeLogo('heel'))),
  wear('b_t_on_roger', '온 더 로저 프로 2', 'shoes', 170, '#26272c', { w: W, e: '#e6e4dc' }, shoes(sole, shoeLogo('dash'))),
  wear('b_t_wl_rush', '윌슨 러시 프로 4.0', 'shoes', 140, '#c8292f', { w: W, e: W }, shoes(sole, shoeLogo('stripes3'), upper('G'))),
  wear('b_t_bb_jetmach', '바볼랏 제트 마하 3', 'shoes', 150, '#f08a24', { w: '#1f3c8c', e: '#1f3c8c' }, shoes(sole, shoeLogo('swoosh'))),
];
