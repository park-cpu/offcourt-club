// ─────────────────────────────────────────────────────────────
// 테니스 의류 · 신발 (실제 브랜드 제품을 모티브로 한 기본 아이템)
//   역할 격자(글자)에 무늬를 칠하는 방식 — 색은 pixel.js가 칠함
//   상의 강조색 a · b / 하의 강조색 v / 신발 강조색 w · 밑창 e / 양말 y Y z (고정 흰색)
//   ty = 템플릿 줄 번호 (실제 줄 = ty + A.dy)
//   id는 'b_t…' — 한 번 정하면 바꾸지 마세요 (구매 기록이 id로 연결됨)
// ─────────────────────────────────────────────────────────────
import { shade } from './pixel.js';

const TOP = 'TtucnNabA';
const BOT = 'PqQgvV';

// 성별별 위치 (템플릿 줄 번호)
const GEO = {
  // last = 다리 마지막 줄, end = 신발 맨 아래 줄
  M: { neck: 28, collar: 29, chest: 32, sleeve: 31, short: 35, tank: 31, hem: 45, shortsEnd: 49, sock: 53, skirt: [46, 50], last: 54, end: 62 },
  F: { neck: 30, collar: 31, chest: 34, sleeve: 32, short: 36, tank: 32, hem: 42, shortsEnd: 49, sock: 54, skirt: [43, 49], last: 56, end: 63 },
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
const cuffs = (g, A, { G, get, set }) => {
  const rows = [G.last - 1, G.last];
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

// 상의 · 하의 형태 추가 (v1.7.8~)
// 소매를 한 칸 넓게 (오버핏 · 아노락)
const wideSleeves = (to) => (g, A, { G, set, is }) => {
  for (let ty = G.sleeve - 1; ty <= to; ty++) {
    if (!is(4, ty, TOP) || !is(26, ty, TOP)) continue;
    set(3, ty, 'T'); set(27, ty, 'T');
    set(4, ty, 't'); set(26, ty, 'u');
  }
  for (let x = 3; x <= 27; x++) if ((x <= 8 || x >= 22) && is(x, to + 1, TOP)) set(x, to + 1, 'T');
};
// 오버핏 반팔: 소매가 넓고 팔꿈치까지
const oversize = (g, A, x) => {
  wideSleeves(x.G.short + 1)(g, A, x);
  bareArms(g, A, x.G.short + 3);
  for (let ty = x.G.short + 2; ty <= 41; ty++) for (const xx of [3, 27]) x.set(xx, ty, null);
  for (let xx = 3; xx <= 27; xx++) if ((xx <= 7 || xx >= 23) && x.get(xx, x.G.short + 2)) x.set(xx, x.G.short + 2, 'T');
};
// 레이어드: 반팔 아래로 다른 색 긴팔
const layered = (g, A, { G, set, is }) => {
  for (let ty = G.short; ty <= 41; ty++) for (let x = 4; x <= 26; x++) if (sleeveCells(x) && is(x, ty, 'tuc')) set(x, ty, 'b');
  for (const x of [4, 5, 6, 7, 8, 22, 23, 24, 25, 26]) is(x, G.short - 1, TOP) && set(x, G.short - 1, 'T');
};
// 소매 끝 고무단
const elastic = (g, A, { set, is }) => {
  for (const ty of [40, 41]) for (let x = 3; x <= 27; x++) if ((x <= 7 || x >= 23) && is(x, ty, 'tuc')) set(x, ty, 'u');
};
// 원피스 (상의 색으로 치마까지)
const dress = (g, A, { sex, set }) => {
  const s0 = 43, s1 = sex === 'F' ? 50 : 49;
  for (let ty = s0; ty <= s1; ty++) {
    const k = ty - s0;
    const w = k < 4 ? 0 : Math.min(2, Math.floor((k - 3) / 1.5));
    const x0 = 7 - w, x1 = 23 + w;
    for (let x = x0; x <= x1; x++) {
      let r = (x - x0) % 4 === 3 ? 'u' : 't';
      if (x === x0 || x === x1 || ty === s1) r = 'T';
      set(x, ty, r);
    }
  }
  // 허리 벨트 줄
  for (let x = 8; x <= 22; x++) set(x, 42, 'a');
};
// 타이츠 (반바지 아래 다리 전체)
const tights = (g, A, { G, get, set }) => {
  for (let ty = G.shortsEnd + 1; ty <= 66; ty++)
    for (let x = 0; x < 31; x++) {
      const r = get(x, ty);
      if (r && 'PqQg'.includes(r)) set(x, ty, r === 'q' || r === 'g' ? 'v' : 'V');
    }
};
// 와이드 팬츠 (다리 바깥쪽으로 넓게, 밑단은 더 넓게)
const widePants = (g, A, { sex, G, set, is }) => {
  const from = sex === 'F' ? 47 : 48;
  for (let ty = from; ty <= G.last; ty++) {
    if (!is(8, ty, 'PqQg')) continue;
    const flare = ty >= G.last - 1;
    set(8, ty, 'q'); set(7, ty, flare ? 'q' : 'P');
    set(22, ty, 'Q'); set(23, ty, flare ? 'Q' : 'P');
    if (flare) { set(6, ty, 'P'); set(24, ty, 'P'); }
  }
};
// 7부 바지: 종아리 아래는 맨살 + 양말
const capri = (g, A, { G }) => bareLegs(g, A, G.last - 2, G.sock);
// 스커트 옆 라인 (스코트)
const skirtSide = (g, A, { G, set, is }) => {
  const [s0, s1] = G.skirt;
  for (let ty = s0; ty < s1; ty++) for (const x of [8, 9, 21, 22]) is(x, ty, 'qQ') && set(x, ty, 'v');
};

// ── 신발: 모양 5가지 ──
//   글자 = 왼발 (x0~15). 오른발은 좌우 뒤집어서 그림. '.' = 다리(양말·바지)를 그대로 보여줌
//   O 테두리 · f 기본 · F 어두움 · G 밝음 · w 강조(로고) · e 밑창
const SHOE_SHAPES = {
  // 기본 코트화
  classic: {
    M: [55, ['................', '.......OOOOOOOO.', '......OGGffffFO.', '.....OGGfwwffFO.', '....OGffffffFFO.', '....OfffffffFFO.', '....OeeeeeeeeeO.', '.....OOOOOOOOOO.']],
    F: [57, ['........OffOOOO.', '........OOOfGGOO', '........OffwfffO', '........OeeeeeeO', '.........OOOOOOO']],
  },
  // 두꺼운 밑창 (쿠션화)
  chunky: {
    M: [55, ['.......OOOOOOOO.', '......OGfffffFO.', '.....OGfwwwffFO.', '....OGffffffFFO.', '...OffffffffFFO.', '...OeeeeeeeeeeO.', '...OeFeeFeeFeeO.', '....OOOOOOOOOOO.']],
    F: [57, ['........OOOOOOO.', '.......OGfwfffOO', '.......OffffffFO', '.......OeeeeeeeO', '.......OeFeeFeeO', '........OOOOOOOO']],
  },
  // 가볍고 날렵한 스피드화 (앞코가 길고 낮음)
  speed: {
    M: [57, ['........OOOOOOO.', '.......OGffffFO.', '....OOGffwwfFFO.', '..OOGffffffffFO.', '.OeeeeeeeeeeeeO.', '..OOOOOOOOOOOOO.']],
    F: [58, ['........OOOOOOO.', '.......OGfwwfFOO', '......OeeeeeeeeO', '.......OOOOOOOOO']],
  },
  // 발목까지 올라오는 미드컷
  high: {
    M: [52, ['.......OOOOOOOO.', '.......OfffffFO.', '.......OGwffFFO.', '.......OGwffFFO.', '.......OGfffFFO.', '......OGfffffFO.', '.....OGffffffFO.', '....OGfffffffFO.', '....OffffffffFO.', '....OeeeeeeeeeO.', '.....OOOOOOOOOO.']],
    F: [54, ['........OOOOOOO.', '........OfwffFO.', '........OfwffFO.', '........OGfffFOO', '........OGffffFO', '........OffffFFO', '........OeeeeeeO', '.........OOOOOOO']],
  },
  // 니트 (양말처럼 발목을 감싸는 갑피)
  knit: {
    M: [54, ['.......OwwwwwwO.', '.......OfGfGfFO.', '......OGfGfGfFO.', '.....OGfGfGffFO.', '....OGfffffffFO.', '....OffffffFFFO.', '....OfffffFFFFO.', '....OeeeeeeeeeO.', '.....OOOOOOOOOO.']],
    F: [56, ['........OwwwwwO.', '........OfGfGfOO', '........OGfGffFO', '........OfffffFO', '........OeeeeeeO', '.........OOOOOOO']],
  },
};
const SHOE_ROLES = 'OfFGwe';
function shoes(...steps) {
  return (g, A) => {
    for (const s of steps) s(g, A, api(g, A));
  };
}
// 신발 모양 + (선택) 로고 칸 바꾸기: logo = [[x, 줄 번호(모양 기준)], …] 를 'w'로
const shoeShape = (name, logo = []) => (g, A, { sex, G, get, set }) => {
  const [start, rows] = SHOE_SHAPES[name][sex];
  const stop = start + rows.length - 1;
  // 1) 원래 신발 지우고, 다리(마지막 줄)를 아래로 이어 붙임
  for (let ty = G.last + 1; ty <= G.end; ty++)
    for (let x = 0; x < 31; x++) {
      const r = get(x, ty);
      if (r && SHOE_ROLES.includes(r)) set(x, ty, null);
      const leg = get(x, G.last);
      if (ty <= stop && leg && !get(x, ty)) set(x, ty, leg);
      if (ty > stop) set(x, ty, null);
    }
  // 2) 모양 그리기 (오른발 = 뒤집기)
  rows.forEach((L, i) => {
    const full = L + L.slice(0, 15).split('').reverse().join('');
    for (let x = 0; x < 31; x++) if (full[x] !== '.') set(x, start + i, full[x]);
  });
  // 3) 로고
  for (const [x, i] of logo) {
    for (const xx of [x, 30 - x]) if ('fFG'.includes(get(xx, start + i) || '.')) set(xx, start + i, 'w');
  }
};

// ── 모자 (실제 색으로 그림) ──
const capT = (c, logo, brim = shade(c, -0.3)) => (g, A) => {
  const y = A.head;
  g.round(2, y, 28, y + 8, 9, 0, c);
  g.rect(20, y + 1, 28, y + 8, shade(c, -0.15), (x, yy) => g.get(x, yy) === c);
  g.rect(8, y + 1, 12, y + 1, shade(c, 0.25));
  logo?.(g, 15, y + 4);
  g.rect(0, y + 9, 30, y + 10, brim);
};
const visorT = (c, logo) => (g, A) => {
  const y = A.head;
  g.rect(1, y + 5, 29, y + 7, c);
  logo?.(g, 15, y + 6);
  g.rect(-1, y + 8, 31, y + 10, shade(c, -0.25));
};
const bandT = (c, logo, wide = false) => (g, A) => {
  const y = A.head + (wide ? 6 : 8);
  g.rect(1, y, 29, y + (wide ? 3 : 1), c);
  if (wide) g.rect(1, y + 1, 29, y + 1, shade(c, -0.15));
  logo?.(g, 15, y + (wide ? 1 : 0));
};
const bucketT = (c, logo) => (g, A) => {
  const y = A.head;
  g.round(5, y - 1, 25, y + 7, 6, 0, c);
  g.rect(18, y, 25, y + 7, shade(c, -0.12), (x, yy) => g.get(x, yy) === c);
  g.rect(5, y + 5, 25, y + 6, shade(c, -0.3));
  g.round(0, y + 7, 30, y + 11, 0, 2, shade(c, -0.08));
  g.rect(0, y + 11, 30, y + 11, shade(c, -0.3));
  logo?.(g, 15, y + 2);
};
// 모자 로고 (cx, cy = 가운데)
const L_SWOOSH = (col) => (g, cx, cy) => [[-2, 0], [-1, 1], [0, 1], [1, 0], [2, -1]].forEach(([dx, dy]) => g.set(cx + dx, cy + dy, col));
const L_CROC = (g, cx, cy) => g.rect(cx - 1, cy, cx + 1, cy, '#3f9a4f').set(cx + 2, cy - 1, '#3f9a4f');
const L_STRIPES = (col) => (g, cx, cy) => [-2, 0, 2].forEach((dx) => g.set(cx + dx, cy, col).set(cx + dx + 1, cy - 1, col));
const L_PATCH = (bg, fg) => (g, cx, cy) => g.rect(cx - 2, cy - 1, cx + 2, cy + 1, bg).rect(cx - 1, cy, cx + 1, cy, fg);
const L_DOT = (col) => (g, cx, cy) => g.rect(cx - 1, cy, cx + 1, cy, col);
const hat = (id, name, price, paint) => ({ id, name, cat: 'wear', slot: 'hat', price, builtin: true, paint, brand: name.split(' ')[0] });

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
  wear('b_t_nk_vapor', '나이키 줌 베이퍼 11', 'shoes', 160, '#cfe23a', { w: '#1a1a1f', e: W }, shoes(shoeShape('speed'))),
  wear('b_t_ad_barricade', '아디다스 바리케이드 13', 'shoes', 150, '#e6e4dc', { w: '#2a4fa8', e: '#2a4fa8' }, shoes(shoeShape('chunky'))),
  wear('b_t_as_gelres', '아식스 젤 레졸루션 9', 'shoes', 150, '#2b56c8', { w: W, e: W }, shoes(shoeShape('chunky'))),
  wear('b_t_nb_996', '뉴발란스 996v5', 'shoes', 130, '#9aa0a6', { w: '#c8292f', e: W }, shoes(shoeShape('classic'))),
  wear('b_t_yx_eclipsion', '요넥스 파워쿠션 에클립션 5', 'shoes', 140, '#d8392b', { w: '#1a1a1f', e: W }, shoes(shoeShape('classic'))),
  wear('b_t_on_roger', '온 더 로저 프로 2', 'shoes', 170, '#26272c', { w: W, e: '#e6e4dc' }, shoes(shoeShape('knit'))),
  wear('b_t_wl_rush', '윌슨 러시 프로 4.0', 'shoes', 140, '#c8292f', { w: W, e: W }, shoes(shoeShape('speed'))),
  wear('b_t_bb_jetmach', '바볼랏 제트 마하 3', 'shoes', 150, '#f08a24', { w: '#1f3c8c', e: '#1f3c8c' }, shoes(shoeShape('knit'))),
  wear('b_t_nk_legacy', '나이키 코트 레거시 미드', 'shoes', 160, '#ecebe3', { w: '#1a1a1f', e: '#c9a874' }, shoes(shoeShape('high'))),
  wear('b_t_ad_ubersonic', '아디다스 어디제로 우버소닉 4', 'shoes', 150, '#2fbfb0', { w: W, e: W }, shoes(shoeShape('knit'))),
  wear('b_t_hd_sprint', '헤드 스프린트 프로 3.5', 'shoes', 140, '#1d2b4f', { w: '#e0d43a', e: W }, shoes(shoeShape('chunky'))),
  wear('b_t_as_solution', '아식스 솔루션 스피드 FF 3', 'shoes', 150, '#f2f0e8', { w: '#e94c2b', e: '#e94c2b' }, shoes(shoeShape('speed'))),
  wear('b_t_k_hyper', '케이스위스 하이퍼코트 익스프레스 2', 'shoes', 130, '#1b1b20', { w: W, e: '#b8835a' }, shoes(shoeShape('high'))),
  // 상의 (형태 추가)
  wear('b_t_nk_layer', '나이키코트 레이어드 롱슬리브', 'top', 120, '#ecebe3', { a: '#1a1a1f', b: '#1f2a55' }, top(layered, chest(SWOOSH))),
  wear('b_t_lc_dress', '라코스테 테니스 원피스', 'top', 160, '#f4f2ea', { a: '#24365e', b: '#3f9a4f' }, top(sleeveless, polo('c'), dress, chest(CROC, 'b'))),
  wear('b_t_ad_anorak', '아디다스 아노락 윈드브레이커', 'top', 150, '#2f5a3a', { a: '#e0d43a', b: W }, top(wideSleeves(41), hoodie, zip(false), band(-1, 'a'), elastic)),
  wear('b_t_yx_vest', '요넥스 집업 베스트', 'top', 130, '#1d2b4f', { a: '#c6e03a', b: '#8d929a' }, top(standCollar('t'), sleeveColor('b'), zip(true))),
  wear('b_t_nk_oversize', '나이키 오버사이즈 맥스90 티', 'top', 100, '#5d636c', { a: W }, top(oversize, chest(SWOOSH))),
  // 하의 (형태 추가)
  wear('b_t_nk_pro', '나이키 프로 타이츠 + 반바지', 'bottom', 110, '#1f2a55', { v: '#1a1a1f', V: '#0d0d10' }, bottom(shorts(), tights)),
  wear('b_t_ad_wide', '아디다스 와이드 트랙 팬츠', 'bottom', 120, '#4a2f6b', { v: W }, bottom(widePants, sideStripe())),
  wear('b_t_fl_capri', '휠라 7부 트레이닝 팬츠', 'bottom', 90, '#8d929a', { v: '#d8392b' }, bottom(capri, sideStripe())),
  wear('b_t_lc_skort', '라코스테 스코트', 'bottom', 110, '#f06f5a', { v: W }, bottom(skirt('q'), skirtSide)),
  // 모자
  hat('b_t_h_nk_aerobill', '나이키코트 에어로빌 헤리티지86 캡', 90, capT('#ecebe3', L_SWOOSH('#1a1a1f'), '#d8d6cc')),
  hat('b_t_h_lc_cap', '라코스테 스포츠 캡', 90, capT('#24365e', L_CROC)),
  hat('b_t_h_uq_rf', '유니클로 RF 캡', 80, capT('#f4f2ea', L_PATCH('#1f2a55', '#d8392b'), '#e0ddd2')),
  hat('b_t_h_ad_visor', '아디다스 클럽 바이저', 70, visorT('#1b1b20', L_STRIPES('#f4f2ea'))),
  hat('b_t_h_yx_visor', '요넥스 투어 바이저', 70, visorT('#2a6fd6', L_DOT('#c6e03a'))),
  hat('b_t_h_nk_band', '나이키 스우시 헤어밴드', 50, bandT('#f4f2ea', L_SWOOSH('#1a1a1f'))),
  hat('b_t_h_hd_band', '헤드 와이드 헤드밴드', 60, bandT('#c8292f', L_DOT('#f4f2ea'), true)),
  hat('b_t_h_wl_bucket', '윌슨 버킷햇', 100, bucketT('#e8dcb0', L_DOT('#c8292f'))),
];
