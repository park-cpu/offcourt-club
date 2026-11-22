// ─────────────────────────────────────────────────────────────
// 픽셀 아트 그리기 도구 + 아바타 · 배경 합성
//   - 그림은 작은 캔버스(배경 120×120, 아바타 48×72)에 그린 뒤
//     CSS로 확대(image-rendering: pixelated)해서 보여줍니다 → 가볍고 선명함
//   - 기본 아이템은 코드로 그리고, 관리자 아이템은 작은 PNG(data URL)로 저장
//   - v2 (v1.7.1~): 해상도 1.5배. 예전(80×80) 소품 위치는 lookOf에서 1.5배로 맞춤
// ─────────────────────────────────────────────────────────────

export const STAGE_W = 120;
export const STAGE_H = 120;
export const AVATAR_W = 48;
export const AVATAR_H = 72;
export const AVATAR_X = 36; // 배경 안 아바타 위치
export const AVATAR_Y = 42;
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
export const SKINS = ['#fbdcc4', '#f2c29c', '#d69a6e', '#9a6442'];
export const HAIR_COLORS = ['#3b2a22', '#7a4628', '#b4753c', '#d8b46a', '#cfcac2', '#b23a2e'];
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
  const sd = shade(s, -0.12);
  // 머리(얼굴형): 넓고 둥근 사각형
  g.round(7, 8, 40, 37, 9, 11, s);
  g.rect(5, 23, 6, 29, s).rect(41, 23, 42, 29, s).rect(6, 25, 6, 27, sd).rect(41, 25, 41, 27, sd); // 귀
  // 눈 (크고 반짝이게)
  for (const ex of [15, 29]) {
    g.rect(ex, 22, ex + 3, 28, '#2e211b');
    g.rect(ex, 26, ex + 3, 28, '#5a3b2c');
    g.rect(ex + 1, 23, ex + 2, 24, WHITE).set(ex + 1, 27, '#8a6a58');
  }
  g.set(14, 22, '#2e211b').set(33, 22, '#2e211b');
  // 볼터치
  g.rect(10, 29, 13, 30, '#f4a3a0').rect(34, 29, 37, 30, '#f4a3a0');
  // 입 (웃는 입)
  g.rect(21, 30, 26, 30, '#6e2620');
  g.rect(21, 31, 26, 31, '#8f3a30');
  g.rect(22, 32, 25, 32, '#e46f75');
  g.rect(23, 33, 24, 33, '#e46f75');
  g.rect(12, 36, 35, 37, sd, (x, y) => g.get(x, y) === s && !g.get(x, y + 2));
  // 목
  g.rect(20, 38, 27, 40, sd);
  // 팔 · 손
  g.rect(9, 46, 12, 54, s).rect(35, 46, 38, 54, s);
  g.rect(12, 46, 12, 54, sd).rect(35, 46, 35, 54, sd);
  g.round(9, 55, 12, 58, 0, 2, s).round(35, 55, 38, 58, 0, 2, s);
  // 다리 · 양말 · 신발
  g.rect(15, 62, 21, 64, s).rect(26, 62, 32, 64, s);
  g.rect(15, 62, 21, 62, sd).rect(26, 62, 32, 62, sd);
  paintSocks(g, WHITE);
  // 기본 옷 (성별 따라)
  if (look.sex === 'F') {
    paintTee(g, '#ec6b6e');
    paintSkirt(g, '#4f7fa8');
  } else {
    paintTee(g, '#3d8bd2');
    paintShorts(g, '#2c3d6c');
  }
  paintShoes(g, '#3c3c46');
  return g;
}

// ── 옷 모양 (기본 아이템도 같은 모양을 색만 바꿔 씀) ──
export function paintTee(g, c, trim = WHITE) {
  const d = shade(c, -0.18);
  const l = shade(c, 0.22);
  g.round(13, 40, 34, 55, 2, 0, c, (x, y) => y > 40 || x < 21 || x > 26); // 몸통 (목 부분은 비움)
  g.round(9, 41, 13, 47, 2, 0, c).round(34, 41, 38, 47, 2, 0, c); // 소매
  g.rect(9, 47, 12, 47, trim).rect(35, 47, 38, 47, trim); // 소매 끝
  g.rect(30, 42, 34, 55, d).rect(13, 55, 34, 55, d); // 그림자
  g.rect(14, 42, 15, 52, l);
  g.rect(13, 47, 13, 55, d).rect(34, 47, 34, 55, shade(c, -0.28)); // 팔과 몸통 경계
  // 목둘레
  g.rect(19, 40, 20, 40, trim).rect(27, 40, 28, 40, trim).rect(20, 41, 27, 41, trim);
  return g;
}
export function paintShorts(g, c) {
  const d = shade(c, -0.22);
  g.rect(13, 56, 34, 61, c);
  g.rect(13, 56, 34, 56, d);
  g.rect(31, 57, 34, 61, d);
  g.rect(23, 59, 24, 61, null);
  g.rect(15, 58, 15, 60, shade(c, 0.18));
  return g;
}
export function paintSkirt(g, c) {
  const d = shade(c, -0.2);
  g.rect(13, 56, 34, 58, c).rect(12, 59, 35, 61, c).rect(11, 61, 36, 61, c);
  g.rect(13, 56, 34, 56, d);
  for (let x = 15; x <= 33; x += 4) g.rect(x, 58, x, 61, d);
  g.rect(11, 61, 36, 61, d);
  return g;
}
export function paintSocks(g, c) {
  g.rect(15, 65, 21, 67, c).rect(26, 65, 32, 67, c);
  g.rect(15, 65, 21, 65, shade(c, -0.1)).rect(26, 65, 32, 65, shade(c, -0.1));
  g.rect(20, 66, 21, 67, shade(c, -0.12)).rect(31, 66, 32, 67, shade(c, -0.12));
  return g;
}
export function paintShoes(g, c) {
  const l = shade(c, 0.25);
  g.round(14, 68, 22, 71, 2, 1, c).round(25, 68, 33, 71, 2, 1, c);
  g.rect(15, 68, 19, 68, l).rect(26, 68, 30, 68, l);
  g.rect(14, 71, 22, 71, shade(c, -0.3)).rect(25, 71, 33, 71, shade(c, -0.3));
  return g;
}

// ── 헤어 (뒤 머리는 몸 뒤에, 앞머리는 얼굴 위에) ─────────
function hairColors(look) {
  const c = HAIR_COLORS[look.hairColor] || HAIR_COLORS[0];
  return { c, d: shade(c, -0.3), l: shade(c, 0.28) };
}
function cap(g, h, sideTo, bangs) {
  // 머리 윗부분 + 옆머리
  g.round(5, 2, 42, sideTo, 13, 3, h.c, (x, y) => y <= 13 || x <= 8 || x >= 39);
  // 앞머리: bangs(x) = 그 칸의 아래 끝 y
  for (let x = 9; x <= 38; x++) {
    const b = bangs(x);
    g.rect(x, 13, x, b, h.c);
    g.set(x, b, h.d);
  }
  g.rect(5, sideTo - 2, 8, sideTo, h.d).rect(39, sideTo - 2, 42, sideTo, h.d);
  // 윤기
  g.rect(13, 5, 20, 6, h.l).rect(15, 4, 18, 4, h.l).rect(22, 6, 23, 6, h.l);
}
export function paintHairBack(g, look) {
  const h = hairColors(look);
  switch (look.hair) {
    case 'long':
    case 'bun':
      if (look.hair === 'long') {
        g.round(4, 10, 43, 60, 8, 6, h.c);
        g.rect(4, 54, 43, 60, h.d, (x, y) => g.get(x, y) === h.c);
      }
      break;
    case 'bob':
      g.round(4, 10, 43, 40, 8, 5, h.c);
      g.rect(4, 37, 43, 40, h.d, (x, y) => g.get(x, y) === h.c);
      break;
    case 'pony':
      g.ellipse(43, 28, 4, 13, h.c);
      g.ellipse(43, 28, 4, 13, h.d, (x, y) => y >= 35);
      break;
  }
  return g;
}
export function paintHairFront(g, look) {
  const h = hairColors(look);
  switch (look.hair) {
    case 'buzz':
      g.round(6, 4, 41, 16, 12, 0, h.d, (x, y) => y <= 11 || x <= 8 || x >= 39);
      g.rect(14, 6, 20, 6, h.c);
      return g;
    case 'long':
      cap(g, h, 30, (x) => 18 - ((x * 7) % 5 === 0 ? 1 : 0));
      // 어깨까지 오는 앞쪽 옆머리
      g.round(4, 18, 9, 50, 0, 3, h.c).round(38, 18, 43, 50, 0, 3, h.c);
      g.rect(8, 22, 9, 50, h.d).rect(38, 22, 39, 50, h.d);
      return g;
    case 'bob':
      cap(g, h, 38, (x) => 18 - ((x * 7) % 5 === 0 ? 1 : 0));
      g.rect(8, 22, 9, 37, h.d).rect(38, 22, 39, 37, h.d);
      return g;
    case 'bun':
      // 양쪽 똥머리
      for (const bx of [8, 39]) {
        g.ellipse(bx, 6, 5.5, 5.5, h.c);
        g.ellipse(bx, 6, 5.5, 5.5, h.d, (x, y) => y >= 9);
        g.rect(bx - 2, 3, bx, 3, h.l);
      }
      cap(g, h, 26, (x) => 17 - ((x * 7) % 5 === 0 ? 1 : 0));
      g.rect(5, 10, 8, 11, '#e94c2b').rect(39, 10, 42, 11, '#e94c2b');
      return g;
    case 'pony':
      cap(g, h, 24, (x) => 17 - ((x * 7) % 5 === 0 ? 1 : 0));
      g.rect(40, 14, 42, 16, '#e94c2b'); // 머리끈
      return g;
    default:
      // 차분한 짧은 머리: 가르마 쪽(왼쪽)이 조금 더 내려오는 앞머리
      cap(g, h, 23, (x) => 14 + Math.round(3 * Math.sin(((x - 9) / 29) * Math.PI) * 0.6) + (x < 20 ? 1 : 0) - (x % 6 === 0 ? 1 : 0));
      return g;
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
  ctx.fillRect(AVATAR_X + 12, AVATAR_Y + 70, 24, 3);
  ctx.fillRect(AVATAR_X + 10, AVATAR_Y + 71, 28, 1);
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
