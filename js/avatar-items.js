// ─────────────────────────────────────────────────────────────
// 기본 아이템 (코드로 그린 픽셀 아이템, 아바타 48×94 · 배경 120×120 기준)
// 관리자가 올린 아이템(state.items)과 합쳐서 상점에 보여줍니다.
// id는 'b_' 로 시작 — 한 번 정하면 바꾸지 마세요 (구매 기록이 id로 연결됨)
// ─────────────────────────────────────────────────────────────
import { Grid, shade, paintTee, paintShorts, paintSkirt, paintShoes, STAGE_W, STAGE_H } from './pixel.js';

const wear = (id, name, slot, price, paint) => ({ id, name, cat: 'wear', slot, price, builtin: true, paint });
const bg = (id, name, slot, price, gen, x = 0, y = 0) => ({ id, name, cat: 'bg', slot, price, builtin: true, gen, x, y });
const WHITE = '#f6f4ee';

// ── 모자 ──
const cap = (c) => (g) => {
  const d = shade(c, -0.25), l = shade(c, 0.25);
  g.round(3, 0, 44, 17, 16, 0, c);
  g.rect(33, 3, 44, 17, d, (x, y) => g.get(x, y) === c);
  g.rect(11, 3, 18, 4, l);
  g.rect(18, 6, 29, 13, WHITE).rect(19, 7, 28, 12, c).rect(21, 8, 26, 11, WHITE); // 앞 로고
  g.round(0, 17, 47, 21, 0, 3, d);
  g.rect(2, 17, 45, 17, shade(c, -0.42));
};
const headband = (c) => (g) => {
  g.rect(4, 14, 43, 17, c);
  g.rect(4, 17, 43, 17, shade(c, -0.15));
  g.rect(20, 14, 27, 17, '#e94c2b');
};
const visor = (c) => (g) => {
  g.rect(4, 13, 43, 16, c);
  g.round(0, 16, 47, 21, 0, 3, shade(c, -0.25));
  g.rect(20, 13, 27, 15, WHITE);
};
const beanie = (c) => (g) => {
  g.round(3, 1, 44, 22, 17, 0, c);
  g.rect(3, 16, 44, 22, shade(c, -0.18));
  for (let x = 4; x <= 43; x += 2) g.rect(x, 16, x, 22, shade(c, -0.3));
  for (let y = 5; y <= 13; y += 3) g.rect(8, y, 40, y, shade(c, -0.08), (x) => g.get(x, y) === c && x % 4 !== 0);
  g.ellipse(23.5, 1, 4.5, 3, WHITE);
};
// ── 얼굴 ──
const sunglasses = (c) => (g) => {
  g.round(9, 22, 19, 31, 2, 4, c).round(28, 22, 38, 31, 2, 4, c);
  g.rect(19, 23, 28, 24, c);
  g.rect(3, 24, 9, 24, c).rect(38, 24, 44, 24, c);
  g.rect(11, 24, 13, 24, '#8fa2b8').rect(11, 25, 12, 25, '#8fa2b8').rect(30, 24, 32, 24, '#8fa2b8').rect(30, 25, 31, 25, '#8fa2b8');
};
const roundGlasses = (c) => (g) => {
  for (const x0 of [9, 29]) {
    const inner = new Grid(g.w, g.h).round(x0 + 1, 22, x0 + 8, 31, 3, 3, '#000');
    g.round(x0, 21, x0 + 9, 32, 4, 4, c, (x, y) => !inner.get(x, y));
  }
  g.rect(19, 24, 28, 24, c);
};
// ── 상의 ──
const tee = (c, trim) => (g) => paintTee(g, c, trim);
const striped = (c, s) => (g) => {
  paintTee(g, c, s);
  const body = [c, shade(c, -0.2), shade(c, 0.22)];
  g.recolor((x, y, v) => y >= 44 && y <= 59 && y % 4 === 0 && body.includes(v), (v) => (v === body[1] ? shade(s, -0.2) : s));
};
const polo = (c) => (g) => {
  paintTee(g, c, shade(c, -0.25));
  g.rect(17, 40, 22, 43, WHITE).rect(25, 40, 30, 43, WHITE); // 카라
  g.rect(23, 41, 24, 49, shade(c, -0.25));
  g.set(23, 45, WHITE).set(23, 47, WHITE);
};
const jersey = (c, num) => (g) => {
  paintTee(g, c, WHITE);
  // 가슴 숫자 (작은 픽셀 폰트)
  const F = { 1: ['010', '110', '010', '010', '111'], 7: ['111', '001', '010', '010', '010'], 0: ['111', '101', '101', '101', '111'] };
  String(num).split('').forEach((ch, i) => F[ch].forEach((row, y) => row.split('').forEach((b, x) => b === '1' && g.rect(18 + i * 7 + x * 2, 46 + y * 2, 19 + i * 7 + x * 2, 47 + y * 2, WHITE))));
};
// ── 하의 ──
const shorts = (c) => (g) => paintShorts(g, c);
const skirt = (c) => (g) => paintSkirt(g, c);
// ── 신발 ──
const shoes = (c, accent) => (g) => {
  paintShoes(g, c);
  if (accent) g.rect(16, 89, 20, 90, accent).rect(28, 89, 32, 90, accent);
};
// ── 손 (라켓 · 공) ──
const racket = (frame, grip) => (g) => {
  g.rect(39, 49, 41, 66, grip);
  g.rect(40, 50, 40, 65, shade(grip, 0.3));
  g.ellipse(41.5, 34, 6, 10, frame);
  g.ellipse(41.5, 34, 4.6, 8.6, '#ece6d2');
  for (let y = 27; y <= 42; y += 2) for (let x = 37; x <= 46; x++) if (g.get(x, y) === '#ece6d2') g.set(x, y, '#cbc2a8');
  for (let x = 38; x <= 45; x += 2) for (let y = 25; y <= 43; y++) if (g.get(x, y) === '#ece6d2') g.set(x, y, '#d9d1b9');
  g.rect(40, 44, 42, 48, frame);
};
const ballInHand = (g) => {
  g.ellipse(37, 64, 3.6, 3.6, '#d8e23a');
  g.ellipse(37, 64, 3.6, 3.6, '#b9c42a', (x, y) => x + y >= 103);
  g.set(35, 62, WHITE).set(36, 63, WHITE).set(37, 64, WHITE).set(38, 65, WHITE);
};

// ── 배경 바탕 (120×120 전체) ──
function court(sky, fence, ground, line) {
  return () => {
    const g = new Grid(STAGE_W, STAGE_H);
    g.rect(0, 0, 119, 41, sky);
    for (let y = 0; y < 42; y += 9) g.rect(0, y, 119, y, shade(sky, 0.18));
    // 구름
    g.round(14, 10, 34, 15, 3, 3, '#ffffff').round(20, 7, 30, 11, 3, 0, '#ffffff');
    g.round(78, 18, 100, 22, 3, 2, '#ffffff');
    g.rect(0, 42, 119, 76, fence);
    for (let y = 43; y <= 76; y++) for (let x = (y % 6) / 2; x < 120; x += 6) g.set(Math.floor(x), y, shade(fence, 0.16));
    g.rect(0, 42, 119, 43, shade(fence, -0.35));
    for (let x = 0; x < 120; x += 30) g.rect(x, 42, x + 1, 76, shade(fence, -0.35));
    g.rect(0, 77, 119, 119, ground);
    g.rect(0, 77, 119, 78, shade(ground, -0.2));
    for (let y = 82; y < 120; y += 5) for (let x = (y * 3) % 7; x < 120; x += 7) g.set(x, y, shade(ground, 0.08));
    g.rect(0, 87, 119, 88, line).rect(8, 87, 9, 112, line).rect(110, 87, 111, 112, line).rect(59, 87, 60, 112, line).rect(8, 111, 111, 112, line);
    return g;
  };
}
function brand() {
  const g = new Grid(STAGE_W, STAGE_H);
  g.rect(0, 0, 119, 89, '#1d5294');
  for (let y = 4; y < 88; y += 8) for (let x = (y % 16 === 4 ? 0 : 4); x < 120; x += 8) g.set(x, y, '#2a62a8');
  g.rect(0, 89, 119, 91, '#b8835a');
  g.rect(0, 92, 119, 119, '#f7f1d6');
  for (let x = 0; x < 120; x += 15) g.rect(x, 92, x, 119, '#ece3c2');
  return g;
}
function night() {
  const g = new Grid(STAGE_W, STAGE_H);
  g.rect(0, 0, 119, 89, '#1c2140');
  for (let y = 0; y < 90; y += 10) g.rect(0, y, 119, y, '#1f2547');
  [[10, 8], [30, 20], [50, 6], [76, 15], [99, 8], [110, 27], [18, 38], [87, 36], [63, 28], [40, 44]].forEach(([x, y]) => g.set(x, y, '#f7f1d6').set(x + 1, y, '#9aa0c2'));
  g.ellipse(96, 18, 8, 8, '#f4e7a8');
  g.ellipse(99, 16, 7, 7, '#1c2140');
  // 조명탑
  g.rect(8, 30, 9, 89, '#4b5270').round(3, 24, 14, 30, 2, 0, '#e9e3c4');
  g.rect(110, 30, 111, 89, '#4b5270').round(105, 24, 116, 30, 2, 0, '#e9e3c4');
  g.rect(0, 90, 119, 91, WHITE);
  g.rect(0, 92, 119, 119, '#2f5e46');
  g.rect(0, 104, 119, 105, '#e8e6dc');
  return g;
}
function wallCream() {
  const g = new Grid(STAGE_W, STAGE_H);
  g.rect(0, 0, 119, 89, '#f3ead2');
  for (let x = 0; x < 120; x += 12) g.rect(x, 0, x + 5, 89, '#efe3c4');
  g.rect(0, 88, 119, 91, '#ffffff').rect(0, 91, 119, 91, '#d6ccb2');
  g.rect(0, 92, 119, 119, '#b8835a');
  for (let y = 92; y < 120; y += 7) g.rect(0, y, 119, y, '#a8754d');
  for (let y = 92; y < 120; y += 7) for (let x = (y % 14 ? 0 : 20); x < 120; x += 40) g.rect(x, y, x, y + 6, '#a8754d');
  return g;
}

// ── 배경 소품 ──
function ball() {
  const g = new Grid(13, 13);
  g.ellipse(6, 6, 6, 6, '#d8e23a');
  g.ellipse(6, 6, 6, 6, '#bcc52a', (x, y) => x + y >= 14);
  g.rect(3, 3, 4, 3, '#eef38a');
  for (const [x, y] of [[1, 3], [2, 4], [3, 5], [4, 6], [5, 6], [7, 6], [8, 6], [9, 7], [10, 8], [11, 9]]) g.set(x, y, WHITE);
  return g.outline();
}
function trophy() {
  const g = new Grid(24, 30);
  const c = '#e0b43c', d = '#b98d24', l = '#f6dc8a';
  g.round(5, 1, 18, 12, 0, 7, c);
  g.rect(14, 2, 18, 12, d, (x, y) => g.get(x, y) === c);
  g.rect(7, 2, 8, 9, l);
  g.round(0, 2, 4, 9, 2, 3, c).round(19, 2, 23, 9, 2, 3, c);
  g.round(1, 3, 3, 7, 1, 1, null).round(20, 3, 22, 7, 1, 1, null);
  g.rect(10, 13, 13, 19, d);
  g.rect(7, 20, 16, 21, c);
  g.rect(4, 22, 19, 28, '#7a4b2a').rect(4, 22, 19, 22, '#94603a').rect(8, 24, 15, 26, c);
  return g.outline();
}
function plant() {
  const g = new Grid(22, 34);
  const leaf = '#3f8a4f', leaf2 = '#56a865', dark = '#2e6b3c';
  g.ellipse(10.5, 9, 10, 9, leaf);
  g.ellipse(6, 7, 5, 5, leaf2).ellipse(15, 6, 4, 4, leaf2);
  g.ellipse(10.5, 13, 9, 4, dark, (x, y) => y >= 14);
  g.round(4, 19, 17, 32, 0, 3, '#c98a5a').rect(3, 19, 18, 22, '#b5774b').rect(14, 23, 17, 31, '#b5774b');
  return g.outline();
}
function basket() {
  const g = new Grid(32, 22);
  for (let i = 0; i < 6; i++) g.ellipse(4 + i * 4.8, 6 - (i % 2), 3.6, 3.6, '#d8e23a');
  for (let i = 0; i < 6; i++) g.set(3 + Math.round(i * 4.8), 4 - (i % 2), '#eef38a');
  g.rect(1, 9, 30, 21, '#6e7681');
  for (let x = 3; x < 30; x += 4) g.rect(x, 10, x, 20, '#4f5660');
  for (let y = 12; y < 21; y += 4) g.rect(2, y, 29, y, '#5e6670');
  g.rect(1, 9, 30, 10, '#9aa2ac');
  return g.outline();
}
function pennant() {
  const g = new Grid(36, 22);
  for (let x = 0; x < 33; x++) {
    const hh = Math.round(9 - x * 0.27);
    g.rect(x + 2, 11 - hh, x + 2, 10 + hh, x < 9 ? '#e94c2b' : '#1d5294');
  }
  // O C
  const O = ['0110', '1001', '1001', '1001', '0110'], C = ['0111', '1000', '1000', '1000', '0111'];
  [O, C].forEach((L, i) => L.forEach((row, y) => row.split('').forEach((b, x) => b === '1' && g.set(14 + i * 6 + x, 8 + y, WHITE))));
  g.rect(0, 0, 1, 21, '#7a4b2a');
  return g.outline();
}
function bench() {
  const g = new Grid(44, 20);
  g.rect(0, 4, 43, 7, '#b8835a').rect(0, 4, 43, 4, '#d09a6c');
  g.rect(0, 10, 43, 12, '#b8835a').rect(0, 10, 43, 10, '#d09a6c');
  g.rect(3, 13, 5, 19, '#4b5270').rect(38, 13, 40, 19, '#4b5270').rect(3, 0, 5, 12, '#4b5270').rect(38, 0, 40, 12, '#4b5270');
  return g.outline();
}

export const BUILTIN_ITEMS = [
  wear('b_cap_blue', '블루 캡', 'hat', 60, cap('#1d5294')),
  wear('b_cap_red', '레드 캡', 'hat', 60, cap('#e94c2b')),
  wear('b_band_white', '화이트 헤어밴드', 'hat', 40, headband(WHITE)),
  wear('b_visor_green', '그린 썬바이저', 'hat', 70, visor('#2f7a55')),
  wear('b_beanie_cream', '크림 비니', 'hat', 80, beanie('#e8dcb0')),
  wear('b_sun_black', '블랙 선글라스', 'face', 70, sunglasses('#1f1f24')),
  wear('b_glasses_round', '동그란 안경', 'face', 50, roundGlasses('#5a3b2c')),
  wear('b_tee_blue', '오프코트 블루 티', 'top', 50, tee('#1d5294', WHITE)),
  wear('b_tee_red', '포인트 레드 티', 'top', 50, tee('#e94c2b', WHITE)),
  wear('b_tee_white', '화이트 티', 'top', 40, tee(WHITE, '#1d5294')),
  wear('b_tee_stripe', '스트라이프 티', 'top', 70, striped(WHITE, '#1d5294')),
  wear('b_polo_green', '그린 폴로', 'top', 90, polo('#2f7a55')),
  wear('b_jersey_10', '오프코트 저지 10', 'top', 110, jersey('#1d5294', 10)),
  wear('b_shorts_navy', '네이비 반바지', 'bottom', 40, shorts('#22325a')),
  wear('b_shorts_white', '화이트 반바지', 'bottom', 40, shorts('#ecebe4')),
  wear('b_skirt_white', '화이트 테니스 스커트', 'bottom', 60, skirt(WHITE)),
  wear('b_skirt_blue', '블루 테니스 스커트', 'bottom', 60, skirt('#1d5294')),
  wear('b_shoes_clay', '클레이 슈즈', 'shoes', 60, shoes('#b8835a', WHITE)),
  wear('b_shoes_black', '블랙 슈즈', 'shoes', 60, shoes('#2a2a30', '#e94c2b')),
  wear('b_shoes_white', '화이트 슈즈', 'shoes', 60, shoes('#ecebe4', '#1d5294')),
  wear('b_racket_blue', '블루 라켓', 'hand', 100, racket('#1d5294', '#2a2320')),
  wear('b_racket_red', '레드 라켓', 'hand', 100, racket('#e94c2b', '#2a2320')),
  wear('b_ball_hand', '테니스공', 'hand', 30, ballInHand),
  bg('b_bg_clay', '클레이 코트', 'base', 150, court('#bcd8ee', '#2f5a3a', '#c8794a', WHITE)),
  bg('b_bg_hard', '하드 코트', 'base', 150, court('#bcd8ee', '#2f5a3a', '#1d5294', WHITE)),
  bg('b_bg_grass', '잔디 코트', 'base', 150, court('#cfe6f2', '#2b4a33', '#4f9a4a', WHITE)),
  bg('b_bg_brand', '오프코트 블루', 'base', 120, brand),
  bg('b_bg_night', '야간 코트', 'base', 180, night),
  bg('b_bg_room', '크림 라운지', 'base', 120, wallCream),
  bg('b_deco_ball', '테니스공', 'deco', 30, ball, 14, 100),
  bg('b_deco_trophy', '트로피', 'deco', 120, trophy, 88, 66),
  bg('b_deco_plant', '화분', 'deco', 50, plant, 6, 62),
  bg('b_deco_basket', '공 바구니', 'deco', 70, basket, 84, 92),
  bg('b_deco_pennant', '오프코트 깃발', 'deco', 60, pennant, 6, 14),
  bg('b_deco_bench', '벤치', 'deco', 80, bench, 72, 78),
];
