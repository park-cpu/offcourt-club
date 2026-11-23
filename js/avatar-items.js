// ─────────────────────────────────────────────────────────────
// 기본 아이템 (아바타 템플릿 34×66 · 배경 80×80 기준)
//   - 상의 · 하의 · 신발: 레퍼런스 몸 모양 그대로 색만 바꿈 (color)
//   - 모자 · 얼굴 · 손: 몸 위에 얹는 그림 (paint(g, A) — A = 성별별 머리·눈·손 위치)
// 관리자가 올린 아이템(state.items)과 합쳐서 상점에 보여줍니다.
// id는 'b_' 로 시작 — 한 번 정하면 바꾸지 마세요 (구매 기록이 id로 연결됨)
// ─────────────────────────────────────────────────────────────
import { Grid, shade, STAGE_W, STAGE_H } from './pixel.js';
import { TENNIS_ITEMS } from './avatar-tennis.js';
import { RACKETS } from './avatar-rackets.js';

const paintItem = (id, name, slot, price, paint) => ({ id, name, cat: 'wear', slot, price, builtin: true, paint });
// 예전 단색 옷: 이미 산 사람은 계속 입을 수 있고, 상점에서는 판매 중지 (관리자가 다시 켤 수 있음)
const colorItem = (id, name, slot, price, color, pattern) => ({ id, name, cat: 'wear', slot, price, builtin: true, color, pattern, active: false });
const bg = (id, name, slot, price, gen, x = 0, y = 0) => ({ id, name, cat: 'bg', slot, price, builtin: true, gen, x, y });
const WHITE = '#f4f2ea';

// ── 모자 (A.head = 머리 맨 위 줄) ──
const cap = (c) => (g, A) => {
  const y = A.head;
  g.round(2, y, 28, y + 8, 9, 0, c);
  g.rect(20, y + 1, 28, y + 8, shade(c, -0.2), (x, yy) => g.get(x, yy) === c);
  g.rect(8, y + 1, 12, y + 1, shade(c, 0.3));
  g.rect(12, y + 3, 18, y + 6, WHITE).rect(13, y + 4, 17, y + 5, c);
  g.rect(0, y + 9, 30, y + 10, shade(c, -0.3));
};
const headband = (c) => (g, A) => {
  g.rect(1, A.head + 8, 29, A.head + 9, c);
  g.rect(13, A.head + 8, 17, A.head + 9, '#e94c2b');
};
const visor = (c) => (g, A) => {
  g.rect(1, A.head + 6, 29, A.head + 7, c);
  g.rect(13, A.head + 6, 17, A.head + 7, WHITE);
  g.rect(-1, A.head + 8, 31, A.head + 10, shade(c, -0.25));
};
const beanie = (c) => (g, A) => {
  const y = A.head;
  g.round(1, y - 1, 29, y + 11, 10, 0, c);
  g.rect(1, y + 7, 29, y + 11, shade(c, -0.15));
  for (let x = 2; x <= 28; x += 2) g.rect(x, y + 7, x, y + 11, shade(c, -0.3));
  g.ellipse(15, y - 2, 2.5, 1.8, WHITE);
};
// ── 얼굴 (A.eye = 눈 맨 위 줄) ──
const sunglasses = (c) => (g, A) => {
  const y = A.eye;
  g.round(7, y - 1, 13, y + 4, 1, 2, c).round(18, y - 1, 24, y + 4, 1, 2, c);
  g.rect(13, y, 18, y, c);
  g.set(8, y, '#8fa2b8').set(19, y, '#8fa2b8');
};
const roundGlasses = (c) => (g, A) => {
  const y = A.eye;
  for (const x0 of [7, 18]) {
    const inner = new Grid(g.w, g.h).round(x0 + 1, y, x0 + 5, y + 4, 2, 2, '#000');
    g.round(x0, y - 1, x0 + 6, y + 5, 3, 3, c, (x, yy) => !inner.get(x, yy));
  }
  g.rect(13, y + 1, 18, y + 1, c);
};
// ── 손 (A.hand = 손 맨 위 줄, 오른손은 23~27칸) ──
const racket = (frame, grip) => (g, A) => {
  const y = A.hand;
  g.rect(28, y - 3, 29, y + 5, grip);
  g.ellipse(29.5, y - 10, 3.6, 6, frame);
  g.ellipse(29.5, y - 10, 2.4, 4.6, '#ece6d2');
  for (let yy = y - 14; yy <= y - 6; yy += 2) for (let x = 27; x <= 32; x++) if (g.get(x, yy) === '#ece6d2') g.set(x, yy, '#cbc2a8');
  g.rect(29, y - 4, 29, y - 4, frame);
};
const ballInHand = (g, A) => {
  g.ellipse(25.5, A.hand + 6, 2.4, 2.4, '#d8e23a');
  g.set(24, A.hand + 5, WHITE).set(25, A.hand + 6, WHITE);
};
// ── 상의 무늬 (역할 격자에 칠함: 't' 기본색 칸 → 'c' 밝은 색) ──
const stripes = (g, A) => {
  for (let y = A.dy + 30; y <= A.dy + 44; y += 3) for (let x = 0; x < g.w; x++) if (g.get(x, y) === 't') g.set(x, y, 'c');
};
const number10 = (g, A) => {
  const F = ['010111', '110101', '010101', '010101', '111111'];
  F.forEach((row, dy) => row.split('').forEach((b, dx) => b === '1' && g.get(11 + dx + (dx > 2 ? 1 : 0), A.dy + 32 + dy) === 't' && g.set(11 + dx + (dx > 2 ? 1 : 0), A.dy + 32 + dy, 'c')));
};

// ── 배경 바탕 (80×80 전체) ──
function court(sky, fence, ground, line) {
  return () => {
    const g = new Grid(STAGE_W, STAGE_H);
    g.rect(0, 0, 79, 27, sky);
    for (let y = 0; y < 28; y += 7) g.rect(0, y, 79, y, shade(sky, 0.15));
    g.round(9, 7, 22, 10, 2, 2, '#ffffff').round(13, 5, 19, 7, 2, 0, '#ffffff').round(52, 13, 66, 15, 2, 1, '#ffffff');
    g.rect(0, 28, 79, 50, fence);
    for (let y = 28; y <= 50; y++) for (let x = (y % 4) * 1; x < 80; x += 4) g.set(x, y, shade(fence, 0.18));
    g.rect(0, 28, 79, 28, shade(fence, -0.3));
    for (let x = 0; x < 80; x += 20) g.rect(x, 28, x, 50, shade(fence, -0.3));
    g.rect(0, 51, 79, 79, ground);
    g.rect(0, 51, 79, 51, shade(ground, -0.2));
    g.rect(6, 74, 73, 74, line).rect(6, 58, 6, 74, line).rect(73, 58, 73, 74, line).rect(39, 58, 40, 74, line);
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
  g.rect(4, 20, 4, 59, '#4b5270').round(1, 16, 8, 19, 1, 0, '#e9e3c4');
  g.rect(75, 20, 75, 59, '#4b5270').round(72, 16, 79, 19, 1, 0, '#e9e3c4');
  g.rect(0, 60, 79, 79, '#2f5e46');
  g.rect(0, 59, 79, 59, WHITE);
  g.rect(0, 69, 79, 69, '#e8e6dc');
  return g;
}
function lounge() {
  const g = new Grid(STAGE_W, STAGE_H);
  g.rect(0, 0, 79, 59, '#f3ead2');
  for (let x = 0; x < 80; x += 8) g.rect(x, 0, x + 3, 59, '#efe3c4');
  g.rect(0, 57, 79, 59, '#ffffff').rect(0, 59, 79, 59, '#d6ccb2');
  g.rect(0, 60, 79, 79, '#b8835a');
  for (let y = 60; y < 80; y += 5) g.rect(0, y, 79, y, '#a8754d');
  return g;
}

// ── 배경 소품 ──
function ball() {
  const g = new Grid(9, 9);
  g.ellipse(4, 4, 4, 4, '#d8e23a');
  g.ellipse(4, 4, 4, 4, '#bcc52a', (x, y) => x + y >= 10);
  [[1, 2], [2, 3], [3, 4], [5, 4], [6, 5], [7, 6]].forEach(([x, y]) => g.set(x, y, WHITE));
  return g.outline();
}
function trophy() {
  const g = new Grid(16, 20);
  g.rect(3, 1, 12, 7, '#e0b43c').ellipse(7.5, 7, 4.5, 4, '#e0b43c');
  g.rect(0, 2, 2, 5, '#e0b43c').rect(13, 2, 15, 5, '#e0b43c');
  g.rect(1, 3, 1, 4, null).rect(14, 3, 14, 4, null);
  g.rect(10, 2, 12, 9, '#c79b2c', (x, y) => g.get(x, y) === '#e0b43c');
  g.rect(7, 11, 8, 14, '#c79b2c');
  g.rect(4, 15, 11, 17, '#7a4b2a').rect(4, 15, 11, 15, '#94603a');
  g.rect(5, 2, 6, 6, '#f5dc84');
  return g.outline();
}
function plant() {
  const g = new Grid(14, 22);
  g.ellipse(6.5, 6, 6, 6, '#3f8a4f');
  g.ellipse(4, 5, 3, 3, '#56a865');
  g.ellipse(6.5, 9, 5, 2, '#2e6b3c', (x, y) => y >= 10);
  g.rect(3, 13, 10, 20, '#c98a5a').rect(2, 13, 11, 14, '#a06f49').rect(9, 15, 10, 20, '#b5774b');
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
    const hh = Math.round(6 - x * 0.27);
    g.rect(x + 1, 7 - hh, x + 1, 6 + hh, x < 6 ? '#e94c2b' : '#1d5294');
  }
  g.rect(0, 0, 0, 13, '#7a4b2a');
  return g.outline();
}

export const BUILTIN_ITEMS = [
  { ...paintItem('b_cap_blue', '블루 캡', 'hat', 60, cap('#1d5294')), active: false },
  { ...paintItem('b_cap_red', '레드 캡', 'hat', 60, cap('#e94c2b')), active: false },
  { ...paintItem('b_band_white', '화이트 헤어밴드', 'hat', 40, headband(WHITE)), active: false },
  { ...paintItem('b_visor_green', '그린 썬바이저', 'hat', 70, visor('#2f7a55')), active: false },
  { ...paintItem('b_beanie_cream', '크림 비니', 'hat', 80, beanie('#e8dcb0')), active: false },
  paintItem('b_sun_black', '블랙 선글라스', 'face', 70, sunglasses('#1f1f24')),
  paintItem('b_glasses_round', '동그란 안경', 'face', 50, roundGlasses('#5a3b2c')),
  colorItem('b_tee_blue', '오프코트 블루 상의', 'top', 50, '#1d5294'),
  colorItem('b_tee_red', '포인트 레드 상의', 'top', 50, '#e94c2b'),
  colorItem('b_tee_white', '화이트 상의', 'top', 40, '#ecebe6'),
  colorItem('b_tee_cream', '크림 상의', 'top', 40, '#efe2b8'),
  colorItem('b_tee_stripe', '스트라이프 상의', 'top', 70, '#1d5294', stripes),
  colorItem('b_polo_green', '그린 상의', 'top', 60, '#2f7a55'),
  colorItem('b_jersey_10', '오프코트 저지 10', 'top', 110, '#1d5294', number10),
  colorItem('b_shorts_navy', '네이비 바지', 'bottom', 40, '#22325a'),
  colorItem('b_shorts_white', '화이트 바지', 'bottom', 40, '#e4e2da'),
  colorItem('b_pants_black', '블랙 바지', 'bottom', 50, '#2a2a30'),
  colorItem('b_pants_beige', '베이지 바지', 'bottom', 50, '#d4a388'),
  colorItem('b_shoes_clay', '클레이 슈즈', 'shoes', 60, '#b8835a'),
  colorItem('b_shoes_black', '블랙 슈즈', 'shoes', 60, '#2a2a30'),
  colorItem('b_shoes_white', '화이트 슈즈', 'shoes', 60, '#e8e6e0'),
  colorItem('b_shoes_red', '레드 슈즈', 'shoes', 70, '#d8442a'),
  ...TENNIS_ITEMS,
  // 예전 라켓 (손 칸): 판매 중지, 산 사람은 계속 사용. 새 라켓은 '라켓' 칸 (js/avatar-rackets.js)
  { ...paintItem('b_racket_blue', '블루 라켓', 'hand', 100, racket('#1d5294', '#2a2320')), active: false },
  { ...paintItem('b_racket_red', '레드 라켓', 'hand', 100, racket('#e94c2b', '#2a2320')), active: false },
  ...RACKETS,
  paintItem('b_ball_hand', '테니스공', 'hand', 30, ballInHand),
  bg('b_bg_clay', '클레이 코트', 'base', 150, court('#bcd8ee', '#2f5a3a', '#c8794a', WHITE)),
  bg('b_bg_hard', '하드 코트', 'base', 150, court('#bcd8ee', '#2f5a3a', '#1d5294', WHITE)),
  bg('b_bg_grass', '잔디 코트', 'base', 150, court('#cfe6f2', '#2b4a33', '#4f9a4a', WHITE)),
  bg('b_bg_brand', '오프코트 블루', 'base', 120, brand),
  bg('b_bg_night', '야간 코트', 'base', 180, night),
  bg('b_bg_room', '크림 라운지', 'base', 120, lounge),
  bg('b_deco_ball', '테니스공', 'deco', 30, ball, 10, 68),
  bg('b_deco_trophy', '트로피', 'deco', 120, trophy, 60, 46),
  bg('b_deco_plant', '화분', 'deco', 50, plant, 4, 44),
  bg('b_deco_basket', '공 바구니', 'deco', 70, basket, 58, 62),
  bg('b_deco_pennant', '오프코트 깃발', 'deco', 60, pennant, 4, 8),
];
