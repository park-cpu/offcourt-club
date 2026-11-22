// ─────────────────────────────────────────────────────────────
// 픽셀 아트 그리기 도구 + 아바타 · 배경 합성
//   - 모든 그림은 아주 작은 캔버스(배경 80×80, 아바타 32×48)에 그린 뒤
//     CSS로 확대(image-rendering: pixelated)해서 보여줍니다 → 가볍고 선명함
//   - 기본 아이템은 코드로 그리고, 관리자 아이템은 작은 PNG(data URL)로 저장
// ─────────────────────────────────────────────────────────────

export const STAGE_W = 80;
export const STAGE_H = 80;
export const AVATAR_W = 32;
export const AVATAR_H = 48;
export const AVATAR_X = 24; // 배경 안 아바타 위치
export const AVATAR_Y = 28;
export const OUTLINE = '#2a2320';

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
  rect(x0, y0, x1, y1, c) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
    return this;
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
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.get(x, y) && test(x, y)) this.set(x, y, c);
    return this;
  }
  paint(other, dx = 0, dy = 0) {
    for (let y = 0; y < other.h; y++) for (let x = 0; x < other.w; x++) {
      const c = other.get(x, y);
      if (c) this.set(x + dx, y + dy, c);
    }
    return this;
  }
  // 바깥쪽에 1칸 테두리
  outline(c = OUTLINE) {
    const add = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (!this.get(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => this.get(x + a, y + b) && this.get(x + a, y + b) !== c)) add.push([x, y]);
    add.forEach(([x, y]) => this.set(x, y, c));
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
let pending = 0;
let redrawTimer = null;
export function imageOf(src) {
  if (!src) return null;
  let x = images.get(src);
  if (!x) {
    const img = new Image();
    x = { img, ready: false };
    images.set(src, x);
    pending++;
    img.onload = img.onerror = () => {
      x.ready = img.naturalWidth > 0;
      pending--;
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
export const SKINS = ['#f6d5b8', '#ecbb93', '#cf9469', '#8e5b3a'];
export const HAIR_COLORS = ['#2b211d', '#6a4127', '#c4964c', '#cfcac2', '#b23a2e'];
export const HAIRS = [
  ['short', '짧은 머리'],
  ['long', '긴 머리'],
  ['bun', '똥머리'],
  ['pony', '포니테일'],
  ['buzz', '짧게 깎은 머리'],
];
export const DEFAULT_LOOK = { skin: 0, hair: 'short', hairColor: 0, wear: {}, base: null, deco: [] };


export function paintBody(g, look) {
  const s = SKINS[look.skin] || SKINS[0];
  const sd = shade(s, -0.12);
  g.ellipse(15.5, 13, 9, 9, s); // 머리
  g.rect(6, 12, 6, 14, s).rect(25, 12, 25, 14, s); // 귀
  g.rect(14, 22, 17, 23, sd); // 목
  // 기본 옷: 흰 티 · 회색 반바지 · 흰 신발
  paintTee(g, '#f4f2ea');
  paintShorts(g, '#8c8f96');
  g.rect(8, 28, 9, 32, s).rect(22, 28, 23, 32, s); // 팔
  g.rect(8, 33, 9, 34, sd).rect(22, 33, 23, 34, sd); // 손
  g.rect(11, 39, 14, 43, s).rect(17, 39, 20, 43, s); // 다리
  g.rect(11, 39, 14, 39, sd).rect(17, 39, 20, 39, sd);
  paintShoes(g, '#f4f2ea');
  // 얼굴
  g.rect(11, 14, 12, 15, OUTLINE).rect(19, 14, 20, 15, OUTLINE);
  g.set(11, 14, '#ffffff').set(19, 14, '#ffffff');
  g.rect(9, 17, 10, 17, '#f0a29a').rect(21, 17, 22, 17, '#f0a29a');
  g.rect(15, 18, 16, 18, '#8a4a3a');
  return g;
}

export function paintHair(g, look) {
  const c = HAIR_COLORS[look.hairColor] || HAIR_COLORS[0];
  const d = shade(c, -0.25);
  const top = (x, y) => y <= 9 || (y <= 13 && (x <= 7 || x >= 24));
  switch (look.hair) {
    case 'buzz':
      g.ellipse(15.5, 12, 9.4, 9, c, (x, y) => y <= 7);
      return g;
    case 'long':
      g.rect(5, 10, 7, 27, c).rect(24, 10, 26, 27, c);
      g.rect(5, 24, 7, 27, d).rect(24, 24, 26, 27, d);
      break;
    case 'bun':
      g.ellipse(15.5, 3, 3.5, 2.6, c);
      g.rect(14, 3, 17, 3, d);
      break;
    case 'pony':
      g.ellipse(26, 13, 2.6, 7, c, (x) => x >= 25);
      g.ellipse(26, 13, 2.6, 7, d, (x, y) => x >= 25 && y >= 17);
      break;
  }
  g.ellipse(15.5, 12, 10, 9, c, top);
  // 앞머리 결
  const skin = SKINS[look.skin] || SKINS[0];
  g.rect(8, 10, 23, 10, c);
  g.set(13, 10, skin).set(18, 10, skin);
  g.rect(10, 5, 13, 5, shade(c, 0.25));
  return g;
}

// 기본 옷 모양 (기본 아이템도 같은 모양을 색만 바꿔 씀)
export function paintTee(g, c) {
  const d = shade(c, -0.15);
  g.rect(10, 23, 21, 33, c).rect(8, 24, 9, 27, c).rect(22, 24, 23, 27, c);
  g.rect(20, 25, 21, 33, d).rect(10, 33, 21, 33, d);
  g.rect(14, 23, 17, 23, d);
  return g;
}
export function paintShorts(g, c) {
  const d = shade(c, -0.18);
  g.rect(10, 34, 21, 38, c);
  g.rect(10, 34, 21, 34, d);
  g.set(15, 37, null).set(16, 37, null).set(15, 38, null).set(16, 38, null);
  return g;
}
export function paintShoes(g, c) {
  const sole = c === '#f4f2ea' ? '#c9c4b8' : '#f4f2ea';
  g.rect(10, 44, 14, 45, c).rect(17, 44, 21, 45, c);
  g.rect(10, 46, 14, 46, sole).rect(17, 46, 21, 46, sole);
  return g;
}

// ── 합성 ──────────────────────────────────────────────
const avatarCache = new Map();

/** 아바타(코드로 그린 부분)만 캔버스로. 같은 조합은 캐시 */
function avatarBase(look, items) {
  const parts = SLOTS.map(([slot]) => items.get(look.wear?.[slot])).filter((it) => it && it.paint);
  const key = [look.skin, look.hair, look.hairColor, ...parts.map((p) => p.id)].join('|');
  if (avatarCache.has(key)) return avatarCache.get(key);
  const g = new Grid(AVATAR_W, AVATAR_H);
  paintBody(g, look);
  const hat = parts.find((p) => p.slot === 'hat');
  for (const p of parts) if (p.slot !== 'hat' && p.slot !== 'hand') p.paint(g);
  if (!hat || !hat.hidesHair) paintHair(g, look);
  if (hat) hat.paint(g);
  const hand = parts.find((p) => p.slot === 'hand');
  if (hand) hand.paint(g);
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
  g.rect(0, 0, 79, 59, '#efebe0');
  for (let y = 4; y < 58; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < 80; x += 6) g.set(x, y, '#e4dfd1');
  g.rect(0, 59, 79, 60, '#cfc6b2');
  g.rect(0, 61, 79, 79, '#ddd5c3');
  for (let x = 0; x < 80; x += 10) g.rect(x, 61, x, 79, '#d3cab6');
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
    const it = items.get(d.id);
    const src = sourceOf(it);
    if (src) ctx.drawImage(src, Math.round(d.x), Math.round(d.y));
  }
  // 바닥 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(AVATAR_X + 8, AVATAR_Y + 46, 16, 2);
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
export function itemThumb(item, box = 56) {
  return scaleTo(thumbCanvas(item), box);
}
function thumbCanvas(item) {
  const cv = document.createElement('canvas');
  cv.className = 'pixel thumb';
  if (item.paint) {
    // 기본 착용 아이템: 빈 격자에 그려서 잘라냄
    const g = new Grid(AVATAR_W, AVATAR_H);
    item.paint(g);
    g.outline();
    let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
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
  else if (item.img) {
    // 아직 로딩 중
    cv.width = 16;
    cv.height = 16;
  }
  return cv;
}
