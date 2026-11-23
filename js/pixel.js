// ─────────────────────────────────────────────────────────────
// 픽셀 아트 그리기 도구 + 아바타 · 배경 합성
//   - 그림은 작은 캔버스(배경 80×80, 아바타 34×66)에 그린 뒤
//     CSS로 확대(image-rendering: pixelated)해서 보여줍니다 → 가볍고 선명함
//   - 아바타 몸은 레퍼런스 캐릭터를 원본 해상도 그대로 옮긴 템플릿(avatar-tpl.js)에 색만 바꿔 칠함
//   - 기본 아이템은 코드로 그리고, 관리자 아이템은 작은 PNG(data URL)로 저장
// ─────────────────────────────────────────────────────────────

export const STAGE_W = 80;
export const STAGE_H = 80;
export const AVATAR_W = 50; // 몸 31칸 + 오른손 아이템(45도 라켓) 여유
export const AVATAR_H = 66;
export const AVATAR_X = 25; // 배경 안 아바타 위치
export const AVATAR_Y = 12;
export const LOOK_VERSION = 3;
import { TPL_M, TPL_F } from './avatar-tpl.js';
import { HAIR_TPL } from './avatar-hair.js';
export const OUTLINE = '#3a2a24';

// 착용 순서 (뒤 → 앞)
export const SLOTS = [
  ['bottom', '하의'],
  ['top', '상의'],
  ['shoes', '신발'],
  ['face', '얼굴'],
  ['hat', '모자'],
  ['racket', '라켓'],
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
      // '#rrggbbaa' = 반투명 (라켓 줄 사이)
      img.data.set([r, g, b, c.length === 9 ? parseInt(c.slice(7, 9), 16) : 255], i * 4);
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

// ── 기본 아바타 (레퍼런스 템플릿 + 색 바꾸기) ─────────────
// 몸 모양은 js/avatar-tpl.js (레퍼런스 원본 해상도 그대로). 여기서는 역할별 색만 정함
export const SKIN_SETS = [
  { S: '#fde4cf', s: '#f7ba81', m: '#c38665', L: '#ac613a' },
  { S: '#f6d0ae', s: '#e9a46c', m: '#b9774f', L: '#9a5530' },
  { S: '#dba57c', s: '#c4865a', m: '#9c6240', L: '#7f4a2c' },
  { S: '#a06c4b', s: '#87573c', m: '#6a412c', L: '#4f2f1f' },
];
export const SKINS = SKIN_SETS.map((x) => x.S);
export const HAIR_COLORS = ['#362319', '#604331', '#8a5a34', '#c9a063', '#8c8a88', '#9c3a2c'];
export const HAIRS_BY_SEX = {
  M: [['m', '기본 (가르마)'], ['buzz', '스포츠 (반삭)'], ['spiky', '삐죽 머리'], ['part55', '5:5 가르마']],
  F: [['f', '기본 (웨이브 단발)'], ['long', '긴 생머리'], ['wave', '긴 웨이브'], ['pony', '포니테일']],
};
export const HAIRS = [...HAIRS_BY_SEX.M, ...HAIRS_BY_SEX.F];
// 성별 기본 옷 색 (레퍼런스 그대로)
export const DEFAULT_WEAR = {
  M: { top: '#16297f', bottom: '#3e6b80', shoes: '#666b6d', hair: 1 },
  F: { top: '#d4a388', bottom: '#d4a388', shoes: '#2f3a40', hair: 0 },
};
// 성별마다 다른 위치 (모자 · 안경 · 손 아이템용)
// 아무것도 안 입었을 때 기본 옷 (v1.8.0~): 흰 반팔 · 반바지 · 기본 운동화 (js/avatar-tennis.js의 숨은 아이템)
export const BASE_WEAR = { top: 'b_d_tee', bottom: 'b_d_shorts', shoes: 'b_d_shoes' };
const worn = (look, items, slot) => items.get(look.wear?.[slot]) || items.get(BASE_WEAR[slot]);
export const ANCHOR = {
  M: { sex: 'M', dy: 1, head: 1, eye: 16, hand: 43 },
  F: { sex: 'F', dy: 2, head: 2, eye: 19, hand: 44 },
};
export const DEFAULT_LOOK = { skin: 0, hair: 'm', hairColor: 1, wear: {}, base: null, deco: [], sex: 'M', v: LOOK_VERSION };

const mix = (a, b, t) => {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex(...A.map((v, i) => v + (B[i] - v) * t));
};
const hairPal = (c) => ({ H: mix(c, '#100805', 0.65), d: shade(c, -0.25), h: c, l: shade(c, 0.22), x: shade(c, 0.38) });
export const topPal = (c) => ({ T: mix(c, '#140c10', 0.6), t: c, u: shade(c, -0.14), c: shade(c, 0.62), n: '#323232', N: '#25180f' });
export const bottomPal = (c) => ({ P: mix(c, '#0a0a10', 0.7), q: c, Q: shade(c, -0.22), g: shade(c, 0.6) });
export const shoesPal = (c) => ({ O: mix(c, '#0a0a0a', 0.7), f: c, F: shade(c, -0.35), G: shade(c, 0.45) });
const FIXED = { K: '#080504', W: '#ffffff', o: '#fcc3c3', p: '#ee7678', r: '#d4555f', y: '#f4f2ea', Y: '#cfcbbf', z: '#6f6b62' };
export const ROLE_GROUP = { top: 'TtucnNab', bottom: 'PqQgvV', shoes: 'OfFGwe' };

/** 역할 격자(글자) — 템플릿 + 헤어스타일(js/avatar-hair.js) + 옷 무늬 */
function roleGrid(look, items) {
  const sex = look.sex === 'F' ? 'F' : 'M';
  const A = ANCHOR[sex];
  const g = new Grid(AVATAR_W, AVATAR_H);
  const hair = HAIR_TPL[sex][look.hair];
  const put = (rows) => rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] !== '.') g.set(x, y + A.dy, row[x]);
  });
  // 몸 뒤에 먼저 (긴 머리 · 포니테일 꼬리)
  if (hair?.back) put(hair.back);
  const tpl = sex === 'F' ? TPL_F : TPL_M;
  put(hair?.top ? [...hair.top, ...tpl.slice(hair.top.length)] : tpl);
  // 옷 무늬 (상의 → 하의 → 신발 순서. 반바지·스커트·민소매는 맨살도 칠함)
  for (const slot of ['top', 'bottom', 'shoes']) worn(look, items, slot)?.pattern?.(g, A);
  return g;
}

/** 역할 → 실제 색 */
function colorize(rg, look, items) {
  const sex = look.sex === 'F' ? 'F' : 'M';
  const D = DEFAULT_WEAR[sex];
  const pick = (slot, def) => worn(look, items, slot)?.color || def;
  const pal = {
    ...FIXED,
    ...(SKIN_SETS[look.skin] || SKIN_SETS[0]),
    ...hairPal(HAIR_COLORS[look.hairColor ?? D.hair] || HAIR_COLORS[D.hair]),
    ...shoesPal(pick('shoes', D.shoes)),
    ...bottomPal(pick('bottom', D.bottom)),
    // 아이템 강조색 (로고 · 줄무늬 · 밑창)
    a: '#f4f2ea', b: '#f4f2ea', v: '#f4f2ea', V: '#cfcbbf', w: '#f4f2ea', e: '#f4f2ea',
    ...worn(look, items, 'top')?.acc,
    ...worn(look, items, 'bottom')?.acc,
    ...worn(look, items, 'shoes')?.acc,
  };
  const tp = topPal(pick('top', D.top));
  const g = new Grid(rg.w, rg.h);
  for (let y = 0; y < rg.h; y++)
    for (let x = 0; x < rg.w; x++) {
      const r = rg.get(x, y);
      if (!r) continue;
      // 상의 역할(T t u c)은 신발 · 피부 역할과 글자가 겹치지 않게 상의 영역(어깨~허리)에서만
      const inTop = 'TtucnN'.includes(r) && y >= 26 && y <= 53;
      g.set(x, y, inTop ? tp[r] : pal[r] || tp[r] || '#ff00ff');
    }
  return g;
}

/** 모자 · 안경 · 손 아이템: 따로 그려서 테두리 넣고 얹음 */
function overlay(g, look, part) {
  const sex = look.sex === 'F' ? 'F' : 'M';
  const o = new Grid(g.w, g.h);
  part.paint(o, ANCHOR[sex]);
  o.outline();
  return g.paint(o);
}

const avatarCache = new Map();
/** 아바타(코드로 그린 부분)만 캔버스로. 같은 조합은 캐시 */
function avatarBase(look, items) {
  const parts = SLOTS.map(([slot]) => items.get(look.wear?.[slot])).filter((it) => it && (it.paint || it.color));
  const key = [look.sex, look.skin, look.hair, look.hairColor, ...parts.map((p) => p.id)].join('|');
  if (avatarCache.has(key)) return avatarCache.get(key);
  const g = colorize(roleGrid(look, items), look, items);
  for (const slot of ['face', 'hat', 'racket', 'hand']) {
    const p = parts.find((x) => x.slot === slot && x.paint);
    if (p) overlay(g, look, p);
  }
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
    const src = sourceOf(items.get(d.id));
    if (src) ctx.drawImage(src, Math.round(d.x), Math.round(d.y));
  }
  // 바닥 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  ctx.fillRect(AVATAR_X + 4, AVATAR_Y + 63, 23, 2);
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
  let g = null;
  if (item.color) {
    // 색 아이템(상의·하의·신발): 기본 남자 몸에서 그 부분만 잘라 보여줌
    const look = { ...DEFAULT_LOOK, wear: { [item.slot]: item.id } };
    const items = new Map([[item.id, item]]);
    const rg = roleGrid(look, items);
    const keep = ROLE_GROUP[item.slot];
    rg.recolor((x, y, r) => !keep.includes(r) || (item.slot === 'top' && (y < 26 || y > 53)) || (item.slot === 'shoes' && y < 50) || (item.slot === 'bottom' && y > 57), null);
    for (let i = 0; i < rg.px.length; i++) if (rg.px[i] === null) rg.px[i] = null;
    g = colorize(rg, look, items);
  } else if (item.paint) {
    g = new Grid(AVATAR_W, AVATAR_H);
    item.paint(g, ANCHOR.M);
    g.outline();
  }
  if (g) {
    let x0 = 999, y0 = 999, x1 = -1, y1 = -1;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    cv.width = Math.max(1, x1 - x0 + 1);
    cv.height = Math.max(1, y1 - y0 + 1);
    cv.getContext('2d').drawImage(g.toCanvas(), -x0, -y0);
    return cv;
  }
  const src = sourceOf(item);
  cv.width = src ? src.width : 16;
  cv.height = src ? src.height : 16;
  if (src) cv.getContext('2d').drawImage(src, 0, 0);
  return cv;
}
