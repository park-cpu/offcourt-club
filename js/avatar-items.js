// ─────────────────────────────────────────────────────────────
// 기본 아이템 (코드로 그린 픽셀 아이템)
// 관리자가 올린 아이템(state.items)과 합쳐서 상점에 보여줍니다.
// id는 'b_' 로 시작 — 한 번 정하면 바꾸지 마세요 (구매 기록이 id로 연결됨)
// ─────────────────────────────────────────────────────────────
import { Grid, shade, paintTee, paintShorts, paintShoes, STAGE_W, STAGE_H } from './pixel.js';

const wear = (id, name, slot, price, paint, extra = {}) => ({ id, name, cat: 'wear', slot, price, builtin: true, paint, ...extra });
const bg = (id, name, slot, price, gen, x = 0, y = 0) => ({ id, name, cat: 'bg', slot, price, builtin: true, gen, x, y });

// ── 모자 ──
const cap = (c) => (g) => {
  const d = shade(c, -0.25);
  g.ellipse(15.5, 10, 10, 8, c, (x, y) => y <= 8);
  g.rect(5, 9, 26, 10, d);
  g.rect(14, 4, 17, 6, shade(c, 0.35));
};
const headband = (c) => (g) => {
  g.rect(6, 7, 25, 8, c);
  g.rect(6, 8, 25, 8, shade(c, -0.15));
};
const visor = (c) => (g) => {
  g.rect(6, 7, 25, 8, c);
  g.rect(4, 9, 27, 10, shade(c, -0.25));
};
const beanie = (c) => (g) => {
  g.ellipse(15.5, 11, 10.5, 9, c, (x, y) => y <= 8);
  g.rect(5, 8, 26, 10, shade(c, -0.2));
  for (let x = 6; x <= 25; x += 2) g.set(x, 9, shade(c, -0.35));
  g.ellipse(15.5, 1.5, 2.2, 1.8, '#f4f2ea');
};
// ── 얼굴 ──
const sunglasses = (c) => (g) => {
  g.rect(9, 13, 13, 15, c).rect(18, 13, 22, 15, c).rect(14, 13, 17, 13, c);
  g.set(10, 13, '#7f8a96').set(19, 13, '#7f8a96');
};
// ── 상의 ──
const tee = (c) => (g) => paintTee(g, c);
const striped = (c, s) => (g) => {
  paintTee(g, c);
  g.recolor((x, y) => y >= 25 && y <= 32 && y % 3 === 1, s);
};
const polo = (c) => (g) => {
  paintTee(g, c);
  g.rect(13, 23, 18, 24, '#f4f2ea');
  g.rect(15, 25, 16, 27, shade(c, -0.2));
};
// ── 하의 ──
const shorts = (c) => (g) => paintShorts(g, c);
const skirt = (c) => (g) => {
  g.rect(10, 34, 21, 36, c).rect(9, 37, 22, 39, c);
  g.rect(10, 34, 21, 34, shade(c, -0.15));
  for (let x = 11; x <= 21; x += 3) g.rect(x, 37, x, 39, shade(c, -0.12));
};
// ── 신발 ──
const shoes = (c) => (g) => paintShoes(g, c);
// ── 손 (라켓 · 공) ──
const racket = (frame, grip) => (g) => {
  g.rect(24, 29, 25, 35, grip);
  g.ellipse(26.5, 22, 4.2, 5.6, frame);
  g.ellipse(26.5, 22, 3, 4.4, '#ece6d2');
  for (let y = 18; y <= 26; y += 2) for (let x = 24; x <= 29; x++) if (g.get(x, y) === '#ece6d2') g.set(x, y, '#cfc6ad');
};
const ballInHand = (g) => {
  g.ellipse(22.5, 35, 2.2, 2.2, '#d8e23a');
  g.set(21, 34, '#f4f2ea').set(22, 35, '#f4f2ea');
};

// ── 배경 바탕 (80×80 전체) ──
function court(sky, fence, ground, line) {
  return () => {
    const g = new Grid(STAGE_W, STAGE_H);
    g.rect(0, 0, 79, 27, sky);
    for (let y = 0; y < 28; y += 7) g.rect(0, y, 79, y, shade(sky, 0.15));
    g.rect(0, 28, 79, 50, fence);
    for (let y = 28; y <= 50; y++) for (let x = (y % 4) * 1; x < 80; x += 4) g.set(x, y, shade(fence, 0.18));
    g.rect(0, 28, 79, 28, shade(fence, -0.3));
    g.rect(0, 51, 79, 79, ground);
    g.rect(0, 51, 79, 51, shade(ground, -0.2));
    g.rect(6, 72, 73, 72, line).rect(6, 58, 6, 72, line).rect(73, 58, 73, 72, line).rect(39, 58, 40, 72, line);
    g.rect(0, 58, 79, 58, line);
    return g;
  };
}
function brand() {
  const g = new Grid(STAGE_W, STAGE_H);
  g.rect(0, 0, 79, 59, '#1d5294');
  for (let y = 3; y < 58; y += 5) for (let x = (y % 10 === 3 ? 0 : 2); x < 80; x += 5) g.set(x, y, '#255da3');
  g.rect(0, 60, 79, 79, '#f7f1d6');
  g.rect(0, 59, 79, 59, '#b8835a');
  return g;
}
function night() {
  const g = new Grid(STAGE_W, STAGE_H);
  g.rect(0, 0, 79, 59, '#1c2140');
  [[7, 6], [20, 14], [33, 4], [51, 10], [66, 5], [73, 18], [12, 25], [58, 24], [42, 19]].forEach(([x, y]) => g.set(x, y, '#f7f1d6'));
  g.ellipse(64, 12, 5, 5, '#f4e7a8');
  g.ellipse(66, 11, 4, 4, '#1c2140');
  g.rect(0, 60, 79, 79, '#2f5e46');
  g.rect(0, 59, 79, 59, '#f4f2ea');
  return g;
}

// ── 배경 소품 ──
function ball() {
  const g = new Grid(9, 9);
  g.ellipse(4, 4, 4, 4, '#d8e23a');
  g.ellipse(4, 4, 4, 4, '#bcc52a', (x, y) => x + y >= 10);
  [[1, 2], [2, 3], [3, 4], [5, 4], [6, 5], [7, 6]].forEach(([x, y]) => g.set(x, y, '#f4f2ea'));
  return g.outline();
}
function trophy() {
  const g = new Grid(16, 20);
  g.rect(3, 1, 12, 7, '#e0b43c').ellipse(7.5, 7, 4.5, 4, '#e0b43c');
  g.rect(0, 2, 2, 5, '#e0b43c').rect(13, 2, 15, 5, '#e0b43c');
  g.rect(1, 3, 1, 4, null).rect(14, 3, 14, 4, null);
  g.rect(7, 11, 8, 14, '#c79b2c');
  g.rect(4, 15, 11, 17, '#7a4b2a');
  g.rect(5, 2, 6, 6, '#f5dc84');
  return g.outline();
}
function plant() {
  const g = new Grid(14, 22);
  g.ellipse(6.5, 6, 6, 6, '#3f8a4f');
  g.ellipse(4, 5, 3, 3, '#56a865');
  g.rect(3, 13, 10, 20, '#b8835a').rect(2, 13, 11, 14, '#a06f49');
  return g.outline();
}
function basket() {
  const g = new Grid(20, 14);
  for (let i = 0; i < 5; i++) g.ellipse(3 + i * 3.4, 4, 2.4, 2.4, '#d8e23a');
  g.rect(1, 6, 18, 13, '#6e7681');
  for (let x = 2; x < 18; x += 3) g.rect(x, 7, x, 12, '#4f5660');
  g.rect(1, 6, 18, 6, '#8b939d');
  return g.outline();
}
function pennant() {
  const g = new Grid(24, 14);
  for (let x = 0; x < 22; x++) {
    const hgt = Math.round(6 - x * 0.27);
    g.rect(x + 1, 7 - hgt, x + 1, 6 + hgt, x < 6 ? '#e94c2b' : '#1d5294');
  }
  g.rect(0, 0, 0, 13, '#7a4b2a');
  return g.outline();
}

export const BUILTIN_ITEMS = [
  wear('b_cap_blue', '블루 캡', 'hat', 60, cap('#1d5294')),
  wear('b_cap_red', '레드 캡', 'hat', 60, cap('#e94c2b')),
  wear('b_band_white', '화이트 헤어밴드', 'hat', 40, headband('#f4f2ea')),
  wear('b_visor_green', '그린 썬바이저', 'hat', 70, visor('#2f7a55')),
  wear('b_beanie_cream', '크림 비니', 'hat', 80, beanie('#e8dcb0'), { hidesHair: false }),
  wear('b_sun_black', '블랙 선글라스', 'face', 70, sunglasses('#1f1f24')),
  wear('b_tee_blue', '오프코트 블루 티', 'top', 50, tee('#1d5294')),
  wear('b_tee_red', '포인트 레드 티', 'top', 50, tee('#e94c2b')),
  wear('b_tee_stripe', '스트라이프 티', 'top', 70, striped('#f4f2ea', '#1d5294')),
  wear('b_polo_green', '그린 폴로', 'top', 90, polo('#2f7a55')),
  wear('b_shorts_navy', '네이비 반바지', 'bottom', 40, shorts('#22325a')),
  wear('b_shorts_white', '화이트 반바지', 'bottom', 40, shorts('#ecebe4')),
  wear('b_skirt_white', '화이트 테니스 스커트', 'bottom', 60, skirt('#f4f2ea')),
  wear('b_skirt_blue', '블루 테니스 스커트', 'bottom', 60, skirt('#1d5294')),
  wear('b_shoes_clay', '클레이 슈즈', 'shoes', 60, shoes('#b8835a')),
  wear('b_shoes_black', '블랙 슈즈', 'shoes', 60, shoes('#2a2a30')),
  wear('b_racket_blue', '블루 라켓', 'hand', 100, racket('#1d5294', '#2a2320')),
  wear('b_racket_red', '레드 라켓', 'hand', 100, racket('#e94c2b', '#2a2320')),
  wear('b_ball_hand', '테니스공', 'hand', 30, ballInHand),
  bg('b_bg_clay', '클레이 코트', 'base', 150, court('#bcd8ee', '#2f5a3a', '#c8794a', '#f4f2ea')),
  bg('b_bg_hard', '하드 코트', 'base', 150, court('#bcd8ee', '#2f5a3a', '#1d5294', '#f4f2ea')),
  bg('b_bg_grass', '잔디 코트', 'base', 150, court('#cfe6f2', '#2b4a33', '#4f9a4a', '#f4f2ea')),
  bg('b_bg_brand', '오프코트 블루', 'base', 120, brand),
  bg('b_bg_night', '야간 코트', 'base', 180, night),
  bg('b_deco_ball', '테니스공', 'deco', 30, ball, 8, 66),
  bg('b_deco_trophy', '트로피', 'deco', 120, trophy, 60, 44),
  bg('b_deco_plant', '화분', 'deco', 50, plant, 4, 44),
  bg('b_deco_basket', '공 바구니', 'deco', 70, basket, 56, 60),
  bg('b_deco_pennant', '오프코트 깃발', 'deco', 60, pennant, 4, 10),
];
