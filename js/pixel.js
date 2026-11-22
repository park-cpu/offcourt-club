// ─────────────────────────────────────────────────────────────
// 픽셀 아트 그리기 도구 + 아바타 · 배경 합성
//   - 그림은 작은 캔버스(배경 120×120, 아바타 48×94)에 그린 뒤
//     CSS로 확대(image-rendering: pixelated)해서 보여줍니다 → 가볍고 선명함
//   - 기본 아이템은 코드로 그리고, 관리자 아이템은 작은 PNG(data URL)로 저장
//   - v2 (v1.7.1~): 해상도 1.5배. 예전(80×80) 소품 위치는 lookOf에서 1.5배로 맞춤
// ─────────────────────────────────────────────────────────────

export const STAGE_W = 120;
export const STAGE_H = 120;
export const AVATAR_W = 48;
export const AVATAR_H = 94;
export const AVATAR_X = 36; // 배경 안 아바타 위치
export const AVATAR_Y = 23;
export const LOOK_VERSION = 2;
export const OUTLINE = '#3a2a24';

// 착용 순서 (뒤 → 앞)
export const SLOTS = [
  ['bottom', '하의'],
  ['top', '상의'],
  ['shoes', '신발'],
  ['face', '얼굴'],
  ['hat', '모자'],
  ['hand', '손'],
];
export const SLOT_LABEL = Object.fromEntries(SLOTS);
export const BG_SLOTS = [
  ['base', '배경 바탕'],
  ['deco', '배경 소품'],
];
export const BG_LABEL = Object.fromEntries(BG_SLOTS);

// ── 색 도우미 ─────────────────────────────────────────
const hex2rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const shade = (c, f) => {
  const [r, g, b] = hex2rgb(c);
  return f < 0 ? rgb2hex(r * (1 + f), g * (1 + f), b * (1 + f)) : rgb2hex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
};
// 테두리 색: 옆 색을 아주 어둡게 (검정 대신 → 부드러운 도트 느낌)
const lineOf = (c) => {
  const [r, g, b] = hex2rgb(c);
  return rgb2hex(r * 0.32 + 18, g * 0.26 + 12, b * 0.26 + 12);
};

// ── 픽셀 격자 ─────────────────────────────────────────
export class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }
  get(x, y) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.px[y * this.w + x];
  }
  set(x, y, c) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
    return this;
  }
  rect(x0, y0, x1, y1, c, test) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!test || test(x, y)) this.set(x, y, c);
    return this;
  }
  // 모서리가 둥근 사각형 (위 반지름 rt, 아래 반지름 rb)
  round(x0, y0, x1, y1, rt, rb, c, test) {
    const inside = (x, y) => {
      const px = x + 0.5, py = y + 0.5;
      const corner = (cx, cy, r) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
      if (rt && py < y0 + rt) {
        if (px < x0 + rt) return corner(x0 + rt, y0 + rt, rt);
        if (px > x1 + 1 - rt) return corner(x1 + 1 - rt, y0 + rt, rt);
      }
      if (rb && py > y1 + 1 - rb) {
        if (px < x0 + rb) return corner(x0 + rb, y1 + 1 - rb, rb);
        if (px > x1 + 1 - rb) return corner(x1 + 1 - rb, y1 + 1 - rb, rb);
      }
      return true;
    };
    return this.rect(x0, y0, x1, y1, c, (x, y) => inside(x, y) && (!test || test(x, y)));
  }
  // 타원 채우기. test(x,y)로 일부만 칠할 수 있음
  ellipse(cx, cy, rx, ry, c, test) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && (!test || test(x, y))) this.set(x, y, c);
    return this;
  }
  // 이미 칠해진 칸만 다른 색으로
  recolor(test, c) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.get(x, y) && test(x, y, this.get(x, y))) this.set(x, y, typeof c === 'function' ? c(this.get(x, y)) : c);
    return this;
  }
  paint(other, dx = 0, dy = 0) {
    for (let y = 0; y < other.h; y++) for (let x = 0; x < other.w; x++) {
      const c = other.get(x, y);
      if (c) this.set(x + dx, y + dy, c);
    }
    return this;
  }
  // 바깥쪽 1칸 테두리. c를 안 주면 옆 색을 어둡게 한 색
  outline(c) {
    const add = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        const n = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([a, b]) => this.get(x + a, y + b)).find(Boolean);
        if (n) add.push([x, y, c || lineOf(n)]);
      }
    add.forEach(([x, y, col]) => this.set(x, y, col));
    return this;
  }
  toCanvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(this.w, this.h);
    this.px.forEach((c, i) => {
      if (!c) return;
      const [r, g, b] = hex2rgb(c);
      img.data.set([r, g, b, 255], i * 4);
    });
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

// ── 이미지 캐시 (관리자 아이템 data URL → 그릴 수 있는 이미지) ──
const images = new Map();
let redrawTimer = null;
export function imageOf(src) {
  if (!src) return null;
  let x = images.get(src);
  if (!x) {
    const img = new Image();
    x = { img, ready: false };
    images.set(src, x);
    img.onload = img.onerror = () => {
      x.ready = img.naturalWidth > 0;
      // 다 받아오면 한 번만 다시 그림
      clearTimeout(redrawTimer);
      redrawTimer = setTimeout(() => window.dispatchEvent(new Event('rerender')), 30);
    };
    img.src = src;
  }
  return x.ready ? x.img : null;
}

// 아이템 → 그릴 수 있는 소스 (기본 아이템은 코드로 한 번만 그려서 보관)
const built = new Map();
export function sourceOf(item) {
  if (!item) return null;
  if (item.canvas) return item.canvas; // 관리자 등록 화면 미리보기
  if (item.img) return imageOf(item.img);
  if (item.gen) {
    if (!built.has(item.id)) built.set(item.id, item.gen().toCanvas());
    return built.get(item.id);
  }
  return null;
}

// ── 기본 아바타 ───────────────────────────────────────
// 비율 기준: 사용자가 준 레퍼런스(약 22×45칸)를 2배로 옮김
//   머리 0–39 (전체의 약 43%) · 상의 40–61 · 하의 62–73 · 다리/양말 74–84 · 신발 85–93
export const SKINS = ['#fdd9b5', '#f4c193', '#d69a6e', '#9a6442'];
export const HAIR_COLORS = ['#3b2a22', '#8a4526', '#b4753c', '#d8b46a', '#cfcac2', '#b23a2e'];
export const HAIRS = [
  ['neat', '차분한 짧은 머리'],
  ['long', '긴 머리'],
  ['bob', '단발'],
  ['pony', '포니테일'],
  ['bun', '똥머리'],
  ['buzz', '짧게 깎은 머리'],
];
export const DEFAULT_LOOK = { skin: 0, hair: 'neat', hairColor: 1, wear: {}, base: null, deco: [], sex: 'M', v: LOOK_VERSION };
const CX = 23.5; // 아바타 가운데 (좌우 대칭 기준)
const WHITE = '#f6f4ee';

/** 몸 · 얼굴 · 기본 옷 */
export function paintBody(g, look) {
  const s = SKINS[look.skin] || SKINS[0];
  const sd = shade(s, -0.13);
  // 얼굴: 넓고 둥근 사각형 + 귀
  g.round(5, 4, 42, 39, 13, 12, s);
  g.rect(3, 25, 4, 31, s).rect(43, 25, 44, 31, s).rect(4, 27, 4, 29, sd).rect(43, 27, 43, 29, sd);
  // 턱선 (얼굴 아래 테두리)
  g.rect(5, 35, 42, 39, lineOf(s), (x, y) => g.get(x, y) === s && !g.get(x, y + 1));
  // 눈: 세로로 긴 까만 눈 + 하얀 반짝임
  for (const ex of [12, 32]) {
    g.rect(ex + 1, 23, ex + 2, 23, '#24170f').rect(ex, 24, ex + 3, 29, '#24170f').rect(ex + 1, 30, ex + 2, 30, '#24170f');
    g.rect(ex + 1, 25, ex + 2, 26, '#ffffff');
  }
  // 볼터치
  g.round(8, 31, 13, 33, 1, 1, '#f59c96').round(34, 31, 39, 33, 1, 1, '#f59c96');
  // 크게 벌린 입
  const ln = '#4a1d16';
  g.rect(19, 29, 28, 29, ln);
  g.rect(19, 30, 19, 33, ln).rect(28, 30, 28, 33, ln);
  g.rect(20, 30, 27, 31, '#ffffff');
  g.rect(20, 32, 27, 33, '#b8323b');
  g.rect(21, 34, 26, 34, '#ef7d86').rect(20, 34, 20, 34, ln).rect(27, 34, 27, 34, ln);
  g.rect(21, 35, 26, 35, ln);
  // 팔 · 손
  g.rect(9, 49, 12, 58, s).rect(35, 49, 38, 58, s);
  g.rect(12, 49, 12, 58, sd).rect(35, 49, 35, 58, sd);
  g.round(8, 58, 13, 63, 1, 3, s).round(34, 58, 39, 63, 1, 3, s);
  g.rect(12, 61, 13, 62, sd).rect(34, 61, 35, 62, sd);
  // 다리
  g.rect(15, 70, 21, 77, s).rect(26, 70, 32, 77, s);
  g.rect(20, 70, 21, 77, sd).rect(31, 70, 32, 77, sd);
  paintSocks(g, WHITE);
  // 기본 옷 (성별 따라, 무늬 없음)
  if (look.sex === 'F') {
    paintTee(g, '#ee6a6e');
    paintSkirt(g, '#4f7fa8');
  } else {
    paintTee(g, '#3a8ad6');
    paintShorts(g, '#2b3a68');
  }
  paintShoes(g, '#34343c');
  return g;
}

// ── 옷 모양 (기본 아이템도 같은 모양을 색만 바꿔 씀) ──
export function paintTee(g, c, trim = WHITE) {
  const d = shade(c, -0.2);
  const l = shade(c, 0.22);
  g.round(13, 40, 34, 61, 3, 0, c, (x, y) => y > 41 || x < 21 || x > 26); // 몸통 (목 부분은 비움)
  g.round(8, 41, 13, 48, 3, 0, c).round(34, 41, 39, 48, 3, 0, c); // 소매
  g.rect(8, 47, 12, 48, trim).rect(35, 47, 39, 48, trim); // 소매 끝 흰 줄
  g.rect(30, 43, 34, 61, d).rect(13, 60, 34, 61, d); // 그림자
  g.rect(15, 43, 16, 57, l);
  g.rect(13, 49, 13, 61, d).rect(34, 49, 34, 61, shade(c, -0.32)); // 팔과 몸통 경계
  // 둥근 목둘레 (흰 줄)
  g.rect(19, 40, 20, 41, trim).rect(27, 40, 28, 41, trim).rect(20, 42, 27, 42, trim);
  return g;
}
export function paintShorts(g, c) {
  const d = shade(c, -0.25);
  g.rect(13, 62, 34, 73, c);
  g.rect(13, 62, 34, 63, d);
  g.rect(30, 64, 34, 73, d);
  g.rect(22, 68, 25, 73, null);
  g.rect(23, 66, 24, 67, d);
  g.rect(15, 65, 16, 72, shade(c, 0.18));
  return g;
}
export function paintSkirt(g, c) {
  const d = shade(c, -0.22);
  g.rect(13, 62, 34, 65, c).rect(12, 66, 35, 68, c).rect(11, 69, 36, 71, c);
  g.rect(13, 62, 34, 63, d);
  for (let x = 16; x <= 33; x += 5) g.rect(x, 66, x, 71, d);
  g.rect(11, 71, 36, 71, d);
  g.rect(14, 64, 15, 70, shade(c, 0.2));
  return g;
}
export function paintSocks(g, c) {
  g.rect(15, 76, 21, 84, c).rect(26, 76, 32, 84, c);
  g.rect(15, 76, 21, 77, '#c9c6bd').rect(26, 76, 32, 77, '#c9c6bd');
  g.rect(20, 78, 21, 84, shade(c, -0.12)).rect(31, 78, 32, 84, shade(c, -0.12));
  return g;
}
export function paintShoes(g, c) {
  const l = shade(c, 0.3);
  g.round(13, 85, 22, 93, 3, 2, c).round(25, 85, 34, 93, 3, 2, c);
  g.rect(15, 86, 18, 86, l).rect(27, 86, 30, 86, l).set(15, 87, l).set(27, 87, l);
  g.rect(14, 93, 21, 93, shade(c, -0.35)).rect(26, 93, 33, 93, shade(c, -0.35));
  return g;
}

// ── 헤어 (뒤 머리는 몸 뒤에, 앞머리는 얼굴 위에) ─────────
function hairColors(look) {
  const c = HAIR_COLORS[look.hairColor] || HAIR_COLORS[0];
  return { c, d: shade(c, -0.3), l: shade(c, 0.28) };
}
function cap(g, h, sideTo, bangs) {
  // 머리 윗부분 + 옆머리
  g.round(3, 0, 44, sideTo, 16, 3, h.c, (x, y) => y <= 18 || x <= 8 || x >= 39);
  // 앞머리: bangs(x) = 그 칸의 아래 끝 y
  for (let x = 9; x <= 38; x++) {
    const b = bangs(x);
    g.rect(x, 18, x, b, h.c);
    g.rect(x, b - 1, x, b, h.d);
  }
  g.rect(3, sideTo - 2, 8, sideTo, h.d).rect(39, sideTo - 2, 44, sideTo, h.d);
  g.rect(7, 18, 8, sideTo, h.d).rect(39, 18, 40, sideTo, h.d);
  // 윤기
  g.rect(12, 5, 22, 6, h.l).rect(14, 4, 19, 4, h.l).rect(25, 6, 27, 6, h.l);
}
const blunt = (x) => 21 + ((x - 9) % 7 === 3 ? 1 : 0);
export function paintHairBack(g, look) {
  const h = hairColors(look);
  switch (look.hair) {
    case 'long':
      g.round(2, 10, 45, 66, 10, 6, h.c);
      g.rect(2, 61, 45, 66, h.d, (x, y) => g.get(x, y) === h.c);
      break;
    case 'bob':
      g.round(2, 10, 45, 42, 10, 6, h.c);
      g.rect(2, 39, 45, 42, h.d, (x, y) => g.get(x, y) === h.c);
      break;
    case 'pony':
      g.ellipse(44, 32, 3.6, 15, h.c);
      g.ellipse(44, 32, 3.6, 15, h.d, (x, y) => y >= 40);
      break;
  }
  return g;
}
export function paintHairFront(g, look) {
  const h = hairColors(look);
  switch (look.hair) {
    case 'buzz':
      g.round(5, 2, 42, 18, 15, 0, h.d, (x, y) => y <= 13 || x <= 8 || x >= 39);
      g.rect(13, 5, 21, 6, h.c);
      return g;
    case 'long':
      cap(g, h, 32, blunt);
      // 어깨 아래로 내려오는 앞쪽 옆머리
      g.round(2, 22, 8, 58, 0, 3, h.c).round(39, 22, 45, 58, 0, 3, h.c);
      g.rect(7, 26, 8, 58, h.d).rect(39, 26, 40, 58, h.d);
      return g;
    case 'bob':
      cap(g, h, 40, blunt);
      g.rect(7, 24, 8, 40, h.d).rect(39, 24, 40, 40, h.d);
      return g;
    case 'bun':
      for (const bx of [6, 41]) {
        g.ellipse(bx, 6, 6, 6, h.c);
        g.ellipse(bx, 6, 6, 6, h.d, (x, y) => y >= 9);
        g.rect(bx - 2, 2, bx, 3, h.l);
      }
      cap(g, h, 30, blunt);
      g.rect(3, 11, 7, 12, '#e94c2b').rect(40, 11, 44, 12, '#e94c2b');
      return g;
    case 'pony':
      cap(g, h, 30, blunt);
      g.rect(42, 15, 45, 18, '#e94c2b'); // 머리끈
      return g;
    default: {
      // 차분한 짧은 머리: 굵직하게 나뉜 앞머리, 왼쪽(가르마 쪽)이 살짝 길게
      const seg = [3, 4, 3, 2, 2];
      cap(g, h, 28, (x) => 19 + seg[Math.min(4, Math.floor((x - 9) / 6))] + ((x - 9) % 6 === 2 ? 1 : 0));
      return g;
    }
  }
}

// ── 합성 ──────────────────────────────────────────────
const avatarCache = new Map();

/** 아바타(코드로 그린 부분)만 캔버스로. 같은 조합은 캐시 */
function avatarBase(look, items) {
  const parts = SLOTS.map(([slot]) => items.get(look.wear?.[slot])).filter((it) => it && it.paint);
  const key = [look.sex, look.skin, look.hair, look.hairColor, ...parts.map((p) => p.id)].join('|');
  if (avatarCache.has(key)) return avatarCache.get(key);
  const g = new Grid(AVATAR_W, AVATAR_H);
  paintHairBack(g, look);
  paintBody(g, look);
  for (const p of parts) if (p.slot !== 'hat' && p.slot !== 'hand' && p.slot !== 'face') p.paint(g, look);
  paintHairFront(g, look);
  for (const p of parts) if (p.slot === 'face' || p.slot === 'hat') p.paint(g, look);
  for (const p of parts) if (p.slot === 'hand') p.paint(g, look);
  g.outline();
  const cv = g.toCanvas();
  if (avatarCache.size > 200) avatarCache.clear();
  avatarCache.set(key, cv);
  return cv;
}

/** 기본 빈 배경 */
let emptyBg = null;
function emptyBackground() {
  if (emptyBg) return emptyBg;
  const g = new Grid(STAGE_W, STAGE_H);
  g.rect(0, 0, 119, 89, '#efebe0');
  for (let y = 5; y < 86; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < 120; x += 8) g.set(x, y, '#e2dccd');
  g.rect(0, 88, 119, 89, '#e3ddcf');
  g.rect(0, 90, 119, 92, '#c9bfa9');
  g.rect(0, 93, 119, 119, '#ddd5c3');
  for (let x = 0; x < 120; x += 15) g.rect(x, 93, x, 119, '#d1c8b3');
  emptyBg = g.toCanvas();
  return emptyBg;
}

/** 배경 + 소품 + 아바타를 한 장으로 그림 */
export function drawStage(ctx, look, items, opts = {}) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, STAGE_W, STAGE_H);
  const base = sourceOf(items.get(look.base));
  ctx.drawImage(base || emptyBackground(), 0, 0, STAGE_W, STAGE_H);
  for (const d of look.deco || []) {
    const src = sourceOf(items.get(d.id));
    if (src) ctx.drawImage(src, Math.round(d.x), Math.round(d.y));
  }
  // 바닥 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  ctx.fillRect(AVATAR_X + 11, AVATAR_Y + 91, 26, 3);
  ctx.fillRect(AVATAR_X + 9, AVATAR_Y + 92, 30, 1);
  ctx.drawImage(avatarBase(look, items), AVATAR_X, AVATAR_Y);
  // 관리자가 올린 착용 아이템 (이미지)
  for (const [slot] of SLOTS) {
    const it = items.get(look.wear?.[slot]);
    if (!it || it.paint) continue;
    const src = sourceOf(it);
    if (src) ctx.drawImage(src, AVATAR_X + (it.x || 0), AVATAR_Y + (it.y || 0));
  }
  if (opts.selected != null) {
    const d = look.deco?.[opts.selected];
    const src = d && sourceOf(items.get(d.id));
    if (src) {
      ctx.strokeStyle = '#e94c2b';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(d.x) - 0.5, Math.round(d.y) - 0.5, src.width + 1, src.height + 1);
    }
  }
}

/** 화면에 넣을 배경 캔버스 요소 */
export function stageCanvas(look, items, cls = '') {
  const cv = document.createElement('canvas');
  cv.width = STAGE_W;
  cv.height = STAGE_H;
  cv.className = 'pixel stage ' + cls;
  drawStage(cv.getContext('2d'), { ...DEFAULT_LOOK, ...(look || {}) }, items);
  return cv;
}

/** 작은 캔버스를 box(px) 안에 정수배로 확대해 보여줌 */
export function scaleTo(cv, box) {
  const k = Math.max(1, Math.floor(box / Math.max(cv.width, cv.height, 1)));
  cv.style.width = cv.width * k + 'px';
  cv.style.height = cv.height * k + 'px';
  return cv;
}

/** 아이템 하나만 보여주는 작은 그림 (상점 목록용) */
export function itemThumb(item, box = 64) {
  return scaleTo(thumbCanvas(item), box);
}
function thumbCanvas(item) {
  const cv = document.createElement('canvas');
  cv.className = 'pixel thumb';
  if (item.paint) {
    // 기본 착용 아이템: 빈 격자에 그려서 잘라냄
    const g = new Grid(AVATAR_W, AVATAR_H);
    item.paint(g, DEFAULT_LOOK);
    g.outline();
    let x0 = 999, y0 = 999, x1 = -1, y1 = -1;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const w = Math.max(1, x1 - x0 + 1), hgt = Math.max(1, y1 - y0 + 1);
    cv.width = w;
    cv.height = hgt;
    cv.getContext('2d').drawImage(g.toCanvas(), -x0, -y0);
    return cv;
  }
  const src = sourceOf(item);
  cv.width = src ? src.width : 16;
  cv.height = src ? src.height : 16;
  if (src) cv.getContext('2d').drawImage(src, 0, 0);
  return cv;
}
