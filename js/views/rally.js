// ─────────────────────────────────────────────────────────────
// 랠리 게임 (8비트 픽셀 스타일, 256×240 캔버스를 키워서 표시)
//   꾹 눌러 힘 모으기 → 공이 발 옆에 올 때 떼기(타이밍) · 누르는 좌우 위치 = 방향
//   샷 품질: PERFECT / GREAT / GOOD / EARLY · MISS, 길면 OUT, 약하면 NET
//   기록은 이 기기(localStorage)에 난이도별로 저장
// ─────────────────────────────────────────────────────────────
import { h } from '../ui.js';
import { pageHead, loginSheet } from './common.js';
import { state, me } from '../store.js';
import { put } from '../db.js';

const W = 256, H = 240;
// 원근: 깊이 d = z + D0 → 화면 y = HY + K/d, x = CX + F·x/d (높이 h는 F·h/d 만큼 위로)
const D0 = 35.7, HY = -157.3, K = 13041, F = 618, CX = 128;
const proj = (x, z, hh = 0) => { const d = z + D0; return [CX + (F * x) / d, HY + K / d - (F * hh) / d]; };
const zAtY = (y) => K / (y - HY) - D0;
const xAtSX = (sx, z) => ((sx - CX) * (z + D0)) / F;

// 코트 치수 (m)
const LEN = 23.77, NETZ = LEN / 2, SGL = 4.115, DBL = 5.485, SVC = 6.4;
const G = 9.8;
const ZC = -0.8;          // 내 타점 (베이스라인 살짝 뒤)
const ZCPU = LEN + 0.7;   // 상대 타점
const PLAYER_Z = -1.3, CPU_Z = LEN + 1.0;

// 상대 샷 종류 (v1.12.0~): 어려움 · 프로에서 리듬을 바꿔 타이밍을 뺏음
// tf = 날아오는 시간 배수, rest = 바운드 높이, damp = 바운드 뒤 속도 (작을수록 늦게 옴)
const SPINS = {
  drive: { tf: 1,    rest: 0.6,  damp: 0.88 },
  flat:  { tf: 0.78, rest: 0.5,  damp: 0.98, tag: 'FLAT',  color: '#ff6b5a' }, // 빠르고 낮게 쭉
  loop:  { tf: 1.45, rest: 0.72, damp: 0.78, tag: 'LOOP',  color: '#7ad3ff' }, // 높게 떠서 느리게
  slice: { tf: 1.12, rest: 0.36, damp: 0.66, tag: 'SLICE', color: '#c9a7ff' }, // 낮게 깔리며 멈칫
  kick:  { tf: 0.95, rest: 0.8,  damp: 1.1,  tag: 'KICK',  color: '#ffd23a' }, // 튀고 나서 빨라짐
};
const DIFFS = {
  easy:   { label: '쉬움',   en: 'EASY',   win: [48, 95, 160], tf: 1.55, minTf: 1.05, spread: 1.6, depth: [3.5, 7.5], cpuSpd: 4.0, react: 0.32, mult: 1,   guide: true,  auto: true,  marker: true, vary: 0,    jitter: 0, band: 0.14 },
  normal: { label: '보통',   en: 'NORMAL', win: [36, 72, 125], tf: 1.3,  minTf: 0.86, spread: 2.6, depth: [2.6, 6.8], cpuSpd: 5.0, react: 0.22, mult: 1.5, guide: false, auto: false, marker: true, vary: 0,    jitter: 0, band: 0.11 },
  hard:   { label: '어려움', en: 'HARD',   win: [27, 56, 98],  tf: 1.1,  minTf: 0.74, spread: 3.3, depth: [1.8, 5.6], cpuSpd: 6.0, react: 0.15, mult: 2,   guide: false, auto: false, marker: false, vary: 0.5,  jitter: 0.07, band: 0.09 },
  pro:    { label: '프로',   en: 'PRO',    win: [19, 42, 78],  tf: 0.96, minTf: 0.64, spread: 3.8, depth: [1.2, 4.8], cpuSpd: 7.0, react: 0.1,  mult: 3,   guide: false, auto: false, marker: false, vary: 0.7,  jitter: 0.12, band: 0.07 },
};
// 파워 라인 (v1.12.1~): 공마다 게이지에 목표 라인(pt)이 생김. 퍼펙트 = 타이밍 퍼펙트 + 힘이 라인 ± band 안
const POWER_T = [0.45, 0.8]; // 목표 라인 범위
const CHARGE_S = 0.85; // 게이지가 가득 차는 시간(초)
const QUAL = {
  perfect: { text: 'PERFECT!', color: '#ffd23a', pts: 100, noise: 0.05, skew: 0, depthN: 0.3, spd: 0.9, big: 2 },
  great:   { text: 'GREAT',    color: '#7fe3ff', pts: 60,  noise: 0.13, skew: 0.18, depthN: 0.8, spd: 0.97, big: 1 },
  good:    { text: 'GOOD',     color: '#ffffff', pts: 30,  noise: 0.24, skew: 0.38, depthN: 1.5, spd: 1.05, big: 1 },
};

// ── 저장 (이 기기) ─────────────────────────────────────
const REC_KEY = 'oc_rally_v1';
const loadRec = () => { try { return JSON.parse(localStorage.getItem(REC_KEY)) || {}; } catch { return {}; } };
const saveRec = (r) => { try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch {} };
const loadPref = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const savePref = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// ── 5×7 비트맵 글꼴 ───────────────────────────────────
const FONT = {};
(() => {
  const src = {
    A: '.###.#...##...#######...##...##...#', B: '####.#...##...#####.#...##...#####.', C: '.###.#...##....#....#....#...#.###.',
    D: '####.#...##...##...##...##...#####.', E: '######....#....####.#....#....#####', F: '######....#....####.#....#....#....',
    G: '.###.#...##....#.####...##...#.####', H: '#...##...##...#######...##...##...#', I: '.###...#....#....#....#....#...###.',
    J: '..###...#....#....#.#..#.#..#..##..', K: '#...##..#.#.#..##...#.#..#..#.#...#', L: '#....#....#....#....#....#....#####',
    M: '#...###.###.#.##.#.##...##...##...#', N: '#...###..##.#.##..###...##...##...#', O: '.###.#...##...##...##...##...#.###.',
    P: '####.#...##...#####.#....#....#....', Q: '.###.#...##...##...##.#.##..#..##.#', R: '####.#...##...#####.#.#..#..#.#...#',
    S: '.###.#...##.....###.....##...#.###.', T: '#####..#....#....#....#....#....#..', U: '#...##...##...##...##...##...#.###.',
    V: '#...##...##...##...##...#.#.#...#..', W: '#...##...##...##.#.##.#.###.###...#', X: '#...##...#.#.#...#...#.#.#...##...#',
    Y: '#...##...#.#.#...#....#....#....#..', Z: '#####....#...#...#...#...#....#####',
    0: '.###.#...##..###.#.###..##...#.###.', 1: '..#...##....#....#....#....#...###.', 2: '.###.#...#....#...#...#...#...#####',
    3: '####.....#....#.###.....#....#####.', 4: '...#...##..#.#.#..#.#####...#....#.', 5: '######....####.....#....##...#.###.',
    6: '.###.#....#....####.#...##...#.###.', 7: '#####....#...#...#...#....#....#...', 8: '.###.#...##...#.###.#...##...#.###.',
    9: '.###.#...##...#.####....#....#.###.', '!': '..#....#....#....#....#.........#..', ':': '.......#..............#............',
    '.': '................................#..', '-': '...............###.................', x: '..........#...#.#.#...#...#.#.#...#',
    '+': '.......#....#..#####..#....#.......', '/': '....#....#...#...#...#...#....#....', '?': '.###.#...#....#...#...#.........#..',
  };
  for (const [k, s] of Object.entries(src)) FONT[k] = s;
})();
function text(ctx, str, x, y, color, scale = 1, shadow = '#000') {
  const draw = (ox, oy, c) => {
    ctx.fillStyle = c;
    let cx = ox;
    for (const ch of String(str)) {
      const g = FONT[ch] || FONT[ch.toUpperCase()];
      if (g) for (let i = 0; i < 35; i++) if (g[i] === '#') ctx.fillRect(cx + (i % 5) * scale, oy + Math.floor(i / 5) * scale, scale, scale);
      cx += 6 * scale;
    }
  };
  if (shadow) draw(x + scale, y + scale, shadow);
  draw(x, y, color);
}
const textW = (str, scale = 1) => String(str).length * 6 * scale - scale;

// ── 배경 (한 번만 그려 둠) ─────────────────────────────
const C = {
  sky: '#9fd8f0', wall: '#1b3aa0', clay: '#c9522e', clayDk: '#b2462a', court: '#2f8f3a', courtDk: '#287d32', line: '#f6f6ee',
  net: '#141414', netHi: '#3a3a3a', post: '#e8e8e0',
};
function hash(i) { let x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); }

function drawBackground() {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  // 클레이 바닥
  g.fillStyle = C.clay; g.fillRect(0, 0, W, H);
  for (let y = 48; y < H; y += 2) for (let x = (y / 2) % 4; x < W; x += 4) if (hash(x * 7 + y * 131) > 0.86) { g.fillStyle = C.clayDk; g.fillRect(x, y, 1, 1); }
  // 관중석
  g.fillStyle = C.sky; g.fillRect(0, 0, W, 34);
  // 벽 (OFFCOURT 배너)
  g.fillStyle = C.wall; g.fillRect(0, 30, W, 17);
  g.fillStyle = '#0f2470'; g.fillRect(0, 46, W, 2);
  text(g, 'OFFCOURT', CX - textW('OFFCOURT') / 2 - 40, 35, '#f7f1d6', 1, '#0f2470');
  text(g, 'CLUB', CX + 26, 35, '#e94c2b', 1, '#0f2470');
  // 양옆 관중석 (비스듬)
  g.fillStyle = C.wall;
  for (let y = 30; y < 92; y++) { const w = Math.max(0, 26 - (y - 30) * 0.42); g.fillRect(0, y, w, 1); g.fillRect(W - w, y, w, 1); }
  // 코트 (초록 바탕 + 선) — 줄마다 정확히 칠해서 픽셀이 또렷하게
  const top = Math.ceil(proj(0, LEN + 3.2)[1]), bot = H;
  for (let y = top; y < bot; y++) {
    const z = zAtY(y + 0.5);
    const [l] = proj(-DBL - 2.2, z), [r] = proj(DBL + 2.2, z);
    g.fillStyle = (Math.floor(z * 1.2) % 2 === 0) ? C.court : C.courtDk;
    g.fillStyle = C.court;
    g.fillRect(Math.round(l), y, Math.round(r) - Math.round(l), 1);
  }
  g.fillStyle = C.line;
  const hline = (z, x0, x1) => {
    const [a, y] = proj(x0, z), [b] = proj(x1, z);
    const th = y > 150 ? 2 : 1;
    g.fillRect(Math.round(a), Math.round(y), Math.round(b) - Math.round(a) + 1, th);
  };
  const vline = (x, z0, z1) => {
    const y0 = Math.round(proj(0, z1)[1]), y1 = Math.round(proj(0, z0)[1]);
    for (let y = y0; y <= y1; y++) { const z = zAtY(y + 0.5); const sx = proj(x, z)[0]; g.fillRect(Math.round(sx), y, y > 150 ? 2 : 1, 1); }
  };
  hline(0, -DBL, DBL); hline(LEN, -DBL, DBL);
  hline(NETZ - SVC, -SGL, SGL); hline(NETZ + SVC, -SGL, SGL);
  vline(-DBL, 0, LEN); vline(DBL, 0, LEN); vline(-SGL, 0, LEN); vline(SGL, 0, LEN);
  vline(0, NETZ - SVC, NETZ + SVC);
  vline(0, 0, 0.3); vline(0, LEN - 0.3, LEN);
  // 심판 의자 (오른쪽)
  const [ux, uy] = proj(DBL + 2.0, NETZ);
  const seatY = Math.round(proj(DBL + 2.0, NETZ, 2.0)[1]);
  g.fillStyle = '#e8e8e0';
  for (let y = seatY; y <= uy; y++) { g.fillRect(Math.round(ux) - 4 + Math.round((y - seatY) * 0.12) * -1, y, 1, 1); g.fillRect(Math.round(ux) + 5 + Math.round((y - seatY) * 0.12), y, 1, 1); }
  for (let y = seatY + 4; y < uy; y += 5) g.fillRect(Math.round(ux) - 4, y, 10, 1);
  g.fillRect(Math.round(ux) - 5, seatY, 12, 2);
  // 심판
  const sx = Math.round(ux) - 2;
  g.fillStyle = '#1d2b5a'; g.fillRect(sx, seatY - 8, 6, 8);
  g.fillStyle = '#f2c9a0'; g.fillRect(sx + 1, seatY - 13, 4, 4);
  g.fillStyle = '#f6f6ee'; g.fillRect(sx, seatY - 15, 6, 2); g.fillRect(sx - 1, seatY - 13, 2, 1);
  g.fillStyle = '#f2c9a0'; g.fillRect(sx - 1, seatY - 6, 1, 3);
  return cv;
}

// 관중 (환호하면 들썩)
function drawCrowd(g, t, cheer) {
  const cols = ['#ffffff', '#1d3fa8', '#f4d8b0', '#2b2b2b', '#e94c2b', '#f7f1d6'];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 64; col++) {
      const i = row * 97 + col;
      if (hash(i) < 0.18) continue;
      const x = col * 4 + (row % 2) * 2, y = row * 4 + 2;
      const jump = cheer && hash(i + Math.floor(t * 8)) > 0.5 ? -1 : 0;
      g.fillStyle = cols[Math.floor(hash(i + 3) * 3) === 2 ? 2 : 3]; // 머리 (살색 / 검정)
      g.fillStyle = hash(i + 5) > 0.5 ? '#2b2b2b' : '#7a4a2a';
      g.fillRect(x, y + jump, 2, 1);
      g.fillStyle = '#f2c9a0'; g.fillRect(x, y + 1 + jump, 2, 1);
      g.fillStyle = cols[Math.floor(hash(i + 9) * cols.length)]; g.fillRect(x - 1 + 0, y + 2 + jump, 3, 1);
    }
  }
}

// ── 선수 그리기 ────────────────────────────────────────
const BODY_BACK = ['....hhhh....', '...hhhhhh...', '...hhhhhh...', '...hhhhhh...', '....hhhh....', '.....ss.....', '..wwwwwwww..', '.wwwwwwwwww.', '.wwwwwwwwww.', '..wwwwwwww..', '..wwwwwwww..', '..aaaaaaaa..', '..pppppppp..', '..pppppppp..', '..ppp..ppp..'];
const BODY_FRONT = ['....hhhh....', '...hhhhhh...', '...hssssh...', '...sesses...', '....ssss....', '.....ss.....', '..wwwwwwww..', '.wwwwwwwwww.', '.wwaaaaaaww.', '..wwwwwwww..', '..wwwwwwww..', '..wwwwwwww..', '..pppppppp..', '..pppppppp..', '..ppp..ppp..'];
// 자세별 손 위치(스프라이트 기준)와 라켓 방향 — 포핸드(오른쪽) 기준, 백핸드는 좌우 뒤집음
const POSES = {
  ready: { hand: [11, 12], dir: [0.35, -1] },
  charge: { hand: [12, 9], dir: [1, -0.25] },
  hit: { hand: [9, 6], dir: [0.15, -1] },
  follow: { hand: [2, 6], dir: [-0.9, -0.55] },
};
function line(g, x0, y0, x1, y1, color) {
  g.fillStyle = color;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function racket(g, hx, hy, dx, dy, frame) {
  const n = Math.hypot(dx, dy); dx /= n; dy /= n;
  const px = -dy, py = dx;
  line(g, hx, hy, hx + dx * 3, hy + dy * 3, '#5a3a20');
  const cx = hx + dx * 6.5, cy = hy + dy * 6.5;
  g.fillStyle = 'rgba(235,235,215,0.55)';
  for (let a = -1.6; a <= 1.6; a += 0.8) for (let b = -2.6; b <= 2.6; b += 0.8) g.fillRect(Math.round(cx + dx * b + px * a), Math.round(cy + dy * b + py * a), 1, 1);
  g.fillStyle = frame;
  for (let t = 0; t < Math.PI * 2; t += 0.18) g.fillRect(Math.round(cx + dx * Math.cos(t) * 3.4 + px * Math.sin(t) * 2.4), Math.round(cy + dy * Math.cos(t) * 3.4 + py * Math.sin(t) * 2.4), 1, 1);
}
function drawPerson(g, p, view) {
  const [sx, fy] = proj(p.x, p.z);
  const ox = Math.round(sx) - 6, oy = Math.round(fy) - 22;
  const pal = { h: p.hair, s: '#f2c9a0', e: '#2b2b2b', w: p.shirt, a: p.accent, p: p.shorts };
  const body = view === 'back' ? BODY_BACK : BODY_FRONT;
  // 다리 (달리면 번갈아 들기)
  const step = p.moving ? Math.floor(p.legT * 9) % 2 : 0;
  const leg = (lx, lift) => {
    g.fillStyle = pal.s; g.fillRect(ox + lx, oy + 15, 2, 4 - lift);
    g.fillStyle = '#f6f6ee'; g.fillRect(ox + lx, oy + 19 - lift, 2, 1);
    g.fillStyle = p.shoe; g.fillRect(ox + lx - (lx < 6 ? 1 : 0), oy + 20 - lift, 3, 2);
  };
  leg(3, step ? 1 : 0); leg(7, step ? 0 : 1);
  // 그림자
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(ox + 1, oy + 22, 10, 1);
  body.forEach((row, y) => { for (let x = 0; x < 12; x++) { const c = pal[row[x]]; if (c) { g.fillStyle = c; g.fillRect(ox + x, oy + y, 1, 1); } } });
  // 팔 + 라켓. 앞모습은 좌우가 반대 (상대의 오른손은 화면 왼쪽)
  const pose = POSES[p.pose] || POSES.ready;
  const flip = (view === 'front' ? -1 : 1) * p.side;
  const fx = (x) => (flip > 0 ? x : 11 - x);
  const shoulder = [fx(10), 7];
  const hand = [fx(pose.hand[0]), pose.hand[1]];
  line(g, ox + shoulder[0], oy + shoulder[1], ox + hand[0], oy + hand[1], pal.s);
  const other = [fx(1), 7];
  const otherHand = p.pose === 'follow' ? [fx(4), 9] : p.pose === 'charge' ? [fx(5), 9] : [fx(0), 12];
  line(g, ox + other[0], oy + other[1], ox + otherHand[0], oy + otherHand[1], pal.s);
  racket(g, ox + hand[0], oy + hand[1], pose.dir[0] * flip, pose.dir[1], p.racket);
}

// ── 소리 (8비트 삑) ────────────────────────────────────
let actx = null;
function beep(freq, dur = 0.06, type = 'square', vol = 0.06, slide = 0) {
  if (!game.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), v = actx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), actx.currentTime + dur);
    v.gain.value = vol; v.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(v); v.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch {}
}
const SFX = {
  hit: (q) => beep(q === 'perfect' ? 1320 : q === 'great' ? 990 : 740, 0.07),
  cpu: () => beep(520, 0.05),
  bounce: () => beep(180, 0.03, 'triangle', 0.08),
  miss: () => beep(330, 0.35, 'square', 0.05, -250),
  win: () => [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => beep(f, 0.08), i * 70)),
  perfect: () => setTimeout(() => beep(1760, 0.06, 'square', 0.04), 60),
};

// ── 공 (해석적 궤적: 정확한 타이밍 판정용) ─────────────
const DAMP = 0.88, REST = 0.6;
function launch(from, to, tf, opts = {}) {
  const [x0, z0, h0] = from, [tx, tz] = to;
  const vx = (tx - x0) / tf, vz = (tz - z0) / tf;
  const vh = (G * tf * tf / 2 - h0) / tf;
  return { x0, z0, h0, tx, tz, vx, vz, vh, tf, t0: game.t, stop: !!opts.stop, rest: opts.rest || REST, damp: opts.damp || DAMP, bounces: 0, x: x0, z: z0, h: h0 };
}
// 직접 이동일 때 몸과 타점 거리(m): jam 미만 = 너무 붙음, ok 이하 = 정상, max 초과 = 닿지 않음
const REACH = { jam: 0.25, ok: 1.25, max: 1.9 };
const RUN = 6.8; // 달리기 속도 (m/s)
function ballAt(b, t) {
  if (t <= b.tf) return { x: b.x0 + b.vx * t, z: b.z0 + b.vz * t, h: Math.max(0, b.h0 + b.vh * t - (G * t * t) / 2), n: 0 };
  if (b.stop) return { x: b.tx, z: b.tz, h: 0, n: 1 };
  let s = t - b.tf, v = (G * b.tf - b.vh) * b.rest, n = 1;
  let seg = (2 * v) / G;
  while (s > seg && v > 0.4) { s -= seg; v *= b.rest; seg = (2 * v) / G; n++; }
  return { x: b.tx + b.vx * b.damp * (t - b.tf), z: b.tz + b.vz * b.damp * (t - b.tf), h: Math.max(0, v * s - (G * s * s) / 2), n };
}
// 공이 z 평면을 지나는 시간 (바운드 뒤)
const timeAtZ = (b, z) => b.tf + (z - b.tz) / (b.vz * b.damp);

// ── 게임 상태 ─────────────────────────────────────────
const game = {
  root: null, cv: null, g: null, bg: null, ov: null, raf: 0,
  phase: 'menu', diff: loadPref('oc_rally_diff', 'normal'), sound: loadPref('oc_rally_sound', '1') === '1',
  t: 0, last: 0, timer: 0, after: null,
  ball: null, mode: null, // mode: 'in' (나에게 오는 공) | 'out' (내가 친 공)
  player: null, cpu: null, charge: null, aim: 0, keyAim: 0, swung: false, shot: null,
  popups: [], cheer: 0,
  stats: null, newRec: [],
};
const D = () => DIFFS[game.diff];

function resetPlayers() {
  game.player = { x: 0, z: PLAYER_Z, tx: 0, pose: 'ready', poseT: 0, side: 1, moving: false, legT: 0, hair: '#3a2416', shirt: '#f4f2ea', accent: '#1d5294', shorts: '#1d5294', shoe: '#f6f6ee', racket: '#1d5294' };
  game.cpu = { x: 0, z: CPU_Z, tx: 0, pose: 'ready', poseT: 0, side: 1, moving: false, legT: 0, hair: '#1b1b1b', shirt: '#e94c2b', accent: '#f7f1d6', shorts: '#26272c', shoe: '#f6f6ee', racket: '#1b1b1f', spd: 0, wait: 0 };
}

function startGame() {
  resetPlayers();
  game.stats = { score: 0, rally: 0, maxRally: 0, perfect: 0, great: 0, good: 0, hits: 0, winners: 0, misses: 0, streak: 0, maxStreak: 0, lives: 3 };
  game.popups = [];
  game.ball = null;
  game.phase = 'play';
  showOverlay(null);
  feed(1.0);
}

// 상대가 공을 보내줌 (랠리 시작)
function feed(delay = 0.7) {
  game.mode = 'wait';
  game.ball = null;
  game.stats.rally = 0;
  game.stats.streak = 0;
  later(delay, () => cpuShot(1.15));
}
function later(sec, fn) { game.timer = sec; game.after = fn; }

function cpuShot(slow = 1, fromBall = null) {
  const d = D(), st = game.stats;
  const from = fromBall ? [fromBall.x, ZCPU, 1.0] : [game.cpu.x, ZCPU, 1.0];
  const tx = (Math.random() * 2 - 1) * d.spread;
  const tz = d.depth[0] + Math.random() * (d.depth[1] - d.depth[0]);
  // 랠리가 길어질수록 빨라짐, 내 샷이 좋으면 상대는 수비적으로 (느림)
  let tf = Math.max(d.minTf, d.tf * (1 - 0.035 * Math.floor(st.rally / 3)));
  if (game.shot) tf *= game.shot.q === 'perfect' ? 1 + 0.18 * game.shot.power : game.shot.q === 'good' ? 0.92 : 1;
  tf *= slow;
  // 리듬 바꾸기: 같은 종류를 연달아 쓰지 않고, 속도도 살짝씩 흔듦 (첫 공 · 서브는 보통 공)
  let spin = 'drive';
  if (d.vary && slow === 1 && Math.random() < d.vary) {
    const pool = ['flat', 'loop', 'slice', 'kick'].filter((k) => k !== game.lastSpin);
    spin = pool[Math.floor(Math.random() * pool.length)];
  }
  game.lastSpin = spin;
  const S = SPINS[spin];
  tf = Math.max(d.minTf * 0.8, tf * S.tf * (1 + (Math.random() * 2 - 1) * d.jitter));
  game.ball = launch(from, [tx, tz], tf, { rest: S.rest, damp: S.damp });
  game.ball.spin = spin;
  game.ball.pt = POWER_T[0] + Math.random() * (POWER_T[1] - POWER_T[0]);
  if (S.tag && game.diff === 'hard') popup(S.tag, S.color, 1, (() => { const [x, y] = proj(from[0], ZCPU, 3); return [x, y - 6]; })());
  game.mode = 'in';
  game.swung = false;
  game.shot = null;
  game.cpu.pose = 'hit'; game.cpu.poseT = 0.25;
  SFX.cpu();
  // 내 타점: 공이 타점 평면을 지날 때의 x → 포핸드/백핸드 자리로 이동
  const tc = timeAtZ(game.ball, ZC);
  const cx = ballAt(game.ball, tc).x;
  game.ball.tc = tc;
  game.ball.cx = cx;
  if (D().auto) {
    game.player.side = cx > -1.2 ? 1 : -1;
    game.player.tx = cx - 0.75 * game.player.side;
  }
}

// 손을 뗀 순간 = 스윙
function swing() {
  const p = game.player;
  const power = game.charge ? Math.min(1, (game.t - game.charge.t) / CHARGE_S) : 0;
  game.charge = null;
  if (game.phase !== 'play' || game.mode !== 'in' || game.swung) { p.pose = 'follow'; p.poseT = 0.3; return; }
  game.swung = true;
  const d = D(), b = game.ball;
  const err = (game.t - (b.t0 + b.tc)) * 1000;
  p.pose = 'hit'; p.poseT = 0.12;
  if (err < -d.win[2]) { popup('EARLY', '#ff8a7a'); beep(200, 0.08); return; }
  if (err > d.win[2]) return; // 이미 지나감 (miss 처리됨)
  const a = Math.abs(err);
  let q = a <= d.win[0] ? 'perfect' : a <= d.win[1] ? 'great' : 'good';
  // 파워 라인: 타이밍이 퍼펙트여도 힘이 라인에서 벗어나면 GREAT
  const onLine = Math.abs(power - b.pt) <= d.band;
  if (q === 'perfect' && !onLine) {
    q = 'great';
    popup(power < b.pt ? 'WEAK' : 'STRONG', '#ffb36b', 1, (() => { const [x, y] = proj(p.x, PLAYER_Z, 2.4); return [x, y - 18]; })());
  }
  // 직접 이동: 타점과 몸의 거리 (라켓 자리 0.75m가 가장 좋음)
  if (!d.auto) {
    const dist = Math.abs(b.cx - p.x);
    p.side = b.cx >= p.x ? 1 : -1;
    if (dist > REACH.max) { popup('TOO FAR', '#ff8a7a'); beep(200, 0.08); return; }
    if (dist > REACH.ok || dist < REACH.jam) {
      q = 'good';
      popup(dist < REACH.jam ? 'JAMMED' : 'STRETCH', '#ffb36b', 1, (() => { const [x, y] = proj(p.x, PLAYER_Z, 2.4); return [x, y - 10]; })());
    }
  }
  const Q = QUAL[q];
  const aim = curAim();
  // 방향: 누른 위치 + 타이밍 쏠림(빠르면 왼쪽, 늦으면 오른쪽) + 흔들림
  const skew = (err / d.win[2]) * Q.skew;
  const ax = aim * 0.95 + skew + (Math.random() * 2 - 1) * Q.noise;
  const tx = ax * SGL;
  let tz = 14.5 + power * 8.2 + (Math.random() * 2 - 1) * Q.depthN;
  if (q !== 'perfect' && power > 0.85) tz += (power - 0.85) * (q === 'good' ? 14 : 7);
  const contact = ballAt(b, b.tc);
  const from = [contact.x, ZC, Math.max(0.7, contact.h)];
  const st = game.stats;
  let result = 'in';
  if (power < 0.08 && q !== 'perfect') result = 'net';
  else if (Math.abs(tx) > SGL) result = 'wide';
  else if (tz > LEN) result = 'long';
  const tf = (1.28 - 0.62 * power) * Q.spd;
  game.mode = 'out';
  game.shot = { q, power, result };
  st.hits++;
  if (result === 'net') game.ball = launch(from, [tx * 0.6, NETZ - 0.15], tf * 0.7, { stop: true });
  else game.ball = launch(from, [tx, tz], tf);
  SFX.hit(q);
  if (result !== 'in') { popup(Q.text, Q.color, Q.big); return; }
  // 점수
  st.rally++;
  st.maxRally = Math.max(st.maxRally, st.rally);
  st[q]++;
  st.streak = q === 'perfect' ? st.streak + 1 : 0;
  st.maxStreak = Math.max(st.maxStreak, st.streak);
  const combo = comboOf(st.rally);
  st.score += Math.round((Q.pts + (st.streak > 1 ? 20 * (st.streak - 1) : 0)) * combo * d.mult);
  popup(st.streak > 1 ? `${Q.text.replace('!', '')} x${st.streak}` : Q.text, Q.color, Q.big);
  if (q === 'perfect') SFX.perfect();
  // 상대가 받을 수 있나? (위너 판정)
  const b2 = game.ball;
  const tcpu = timeAtZ(b2, ZCPU);
  const cx = ballAt(b2, tcpu).x;
  b2.tcpu = tcpu; b2.cxCpu = cx;
  const need = Math.max(0, Math.abs(cx - game.cpu.x) - 1.05) / d.cpuSpd;
  b2.winner = need > tcpu - d.react;
  game.cpu.wait = d.react;
  game.cpu.tx = cx + 0.75 * (cx > game.cpu.x ? 1 : -1) * (b2.winner ? 0 : 1);
  if (b2.winner) game.cpu.tx = game.cpu.x + Math.sign(cx - game.cpu.x) * d.cpuSpd * Math.max(0, tcpu - d.react);
}
const comboOf = (rally) => Math.min(2, 1 + Math.floor(rally / 5) * 0.1);

function popup(str, color, scale = 1, at = null) {
  const [x, y] = at || proj(game.player.x, PLAYER_Z, 2.4);
  game.popups.push({ str, color, scale, x, y, t: 0 });
}

function loseLife(label) {
  const st = game.stats;
  st.misses++;
  st.lives--;
  st.streak = 0;
  SFX.miss();
  if (label) popup(label, '#ff6b5a', 2, [CX, 120]);
  if (st.lives <= 0) later(1.1, gameOver);
  else later(1.1, () => feed(0.2));
  game.mode = 'dead';
}

function gameOver() {
  game.phase = 'over';
  const st = game.stats, rec = loadRec(), r = rec[game.diff] || {};
  game.newRec = [];
  const best = (k, v) => { if (v > (r[k] || 0)) { r[k] = v; game.newRec.push(k); } };
  best('score', st.score); best('rally', st.maxRally); best('perfect', st.perfect); best('streak', st.maxStreak); best('winners', st.winners);
  r.plays = (r.plays || 0) + 1;
  rec[game.diff] = r;
  saveRec(rec);
  game.clubNew = submitClub(st);
  showOverlay('over');
  renderRank();
}

// ── 한 프레임 ─────────────────────────────────────────
function step(dt) {
  game.t += dt;
  const st = game.stats;
  if (game.timer > 0) { game.timer -= dt; if (game.timer <= 0 && game.after) { const f = game.after; game.after = null; f(); } }
  game.cheer = Math.max(0, game.cheer - dt);
  // 선수 이동
  const move = (p, spd) => {
    const dx = p.tx - p.x;
    const s = Math.min(Math.abs(dx), spd * dt) * Math.sign(dx);
    p.x += s; p.moving = Math.abs(dx) > 0.05; if (p.moving) p.legT += dt;
    if (p.poseT > 0) { p.poseT -= dt; if (p.poseT <= 0) { if (p.pose === 'hit') { p.pose = 'follow'; p.poseT = 0.25; } else p.pose = 'ready'; } }
  };
  if (game.charge) game.player.pose = 'charge';
  if (D().auto || game.phase !== 'play') move(game.player, 9);
  else {
    // 조이스틱 / ←→ 로 직접 이동, 오는 공 쪽으로 라켓 방향 맞춤
    const p = game.player, inp = moveInput();
    p.x = Math.max(-7, Math.min(7, p.x + inp * RUN * dt));
    p.tx = p.x;
    p.moving = Math.abs(inp) > 0.1; if (p.moving) p.legT += dt;
    if (game.mode === 'in' && game.ball && !game.swung) p.side = game.ball.cx >= p.x ? 1 : -1;
    if (p.poseT > 0) { p.poseT -= dt; if (p.poseT <= 0) { if (p.pose === 'hit') { p.pose = 'follow'; p.poseT = 0.25; } else p.pose = 'ready'; } }
  }
  const cpu = game.cpu;
  if (cpu.wait > 0) cpu.wait -= dt; else move(cpu, game.mode === 'out' ? D().cpuSpd : 3);
  if (game.phase !== 'play' || !game.ball) return;
  const b = game.ball, lt = game.t - b.t0;
  const pos = ballAt(b, lt);
  if (pos.n > b.bounces) { b.bounces = pos.n; if (pos.n <= 2) SFX.bounce(); }
  Object.assign(b, pos);
  if (game.mode === 'in') {
    // 늦어서 놓침
    if (!game.shot && lt > b.tc + D().win[2] / 1000) {
      game.mode = 'missed';
      if (!game.swung) popup('LATE', '#ff8a7a');
      later(0.35, () => loseLife('MISS'));
    }
    // 바운드 전 다시 넘어가면 (상대 공이 아웃될 일은 없음)
  } else if (game.mode === 'out') {
    const s = game.shot;
    if (s.result !== 'in') {
      if (lt >= b.tf) { game.mode = 'dead'; loseLife(s.result === 'net' ? 'NET' : 'OUT'); }
    } else if (b.winner) {
      if (lt >= b.tf && !b.saidWinner) {
        b.saidWinner = true;
        st.winners++;
        st.score += Math.round(300 * comboOf(st.rally) * D().mult);
        popup('WINNER!', '#ffd23a', 2, [CX, 70]);
        game.cheer = 1.6;
        SFX.win();
      }
      if (lt >= b.tcpu + 0.5) { game.mode = 'dead'; later(0.6, () => feed(0.2)); }
    } else if (lt >= b.tcpu) {
      // 상대가 받아 넘김
      cpu.side = b.cxCpu > cpu.x ? 1 : -1;
      cpuShot(1, { x: b.cxCpu });
      cpu.tx = b.cxCpu * 0.4;
    }
  }
}

// ── 그리기 ────────────────────────────────────────────
function draw() {
  const g = game.g;
  g.drawImage(game.bg, 0, 0);
  drawCrowd(g, game.t, game.cheer > 0);
  const b = game.ball, d = D();
  const far = b && b.z > NETZ;
  // 쉬움 · 보통: 바운드 지점 표시, 보통(직접 이동)은 칠 자리(타점)도 표시
  if (b && game.phase === 'play' && game.mode === 'in' && d.marker && b.bounces === 0) {
    const [mx, my] = proj(b.tx, b.tz);
    g.fillStyle = 'rgba(255,240,120,0.8)';
    g.fillRect(Math.round(mx) - 2, Math.round(my), 5, 1); g.fillRect(Math.round(mx), Math.round(my) - 1, 1, 3);
  }
  if (b && game.phase === 'play' && game.mode === 'in' && d.marker && !d.auto && !game.swung) {
    const [cx, cy] = proj(b.cx, ZC);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(Math.round(cx) - 3, Math.round(cy), 2, 1); g.fillRect(Math.round(cx) + 2, Math.round(cy), 2, 1);
  }
  // 상대 (멀리)
  drawPerson(g, game.cpu, 'front');
  if (b && far) drawBall(g, b);
  drawNet(g);
  if (b && !far) drawBall(g, b);
  // 겨누기 표시 (고른 방향, 힘 모으는 중엔 진하게)
  if (game.phase === 'play' && game.stats) {
    const aim = curAim();
    g.globalAlpha = game.charge ? 1 : 0.55;
    const [ax, ay] = proj(aim * 0.95 * SGL, LEN - 1.5);
    g.fillStyle = '#ffd23a';
    g.fillRect(Math.round(ax) - 2, Math.round(ay) - 2, 5, 1); g.fillRect(Math.round(ax) - 1, Math.round(ay) - 1, 3, 1); g.fillRect(Math.round(ax), Math.round(ay), 1, 1);
    g.globalAlpha = 1;
  }
  drawPerson(g, game.player, 'back');
  // 쉬움: 타이밍 링 (퍼펙트 구간에 노랗게)
  if (b && game.phase === 'play' && game.mode === 'in' && d.guide && !game.swung) {
    const left = (b.t0 + b.tc - game.t) * 1000;
    if (left < 600 && left > -d.win[2]) {
      const [rx, ry] = proj(b.cx, ZC, 0);
      const on = Math.abs(left) <= d.win[0];
      g.fillStyle = on ? '#ffd23a' : 'rgba(255,255,255,0.6)';
      const r = Math.max(2, Math.round(2 + Math.max(0, left) / 60));
      for (let t = 0; t < Math.PI * 2; t += 0.3) g.fillRect(Math.round(rx + Math.cos(t) * r * 1.6), Math.round(ry + Math.sin(t) * r * 0.6), 1, 1);
    }
  }
  // 파워 게이지: 공이 오는 동안 목표 라인(흰 구간)을 미리 보여주고, 누르면 차오름
  const aiming = b && game.phase === 'play' && game.mode === 'in' && !game.swung && b.pt != null;
  if (game.charge || aiming) {
    const p = game.charge ? Math.min(1, (game.t - game.charge.t) / CHARGE_S) : 0;
    const GH = 36;
    const [px, py] = proj(game.player.x, PLAYER_Z);
    const gx = Math.round(px) + (game.player.side > 0 ? -14 : 11), gy = Math.round(py) - GH - 4;
    g.globalAlpha = game.charge ? 1 : 0.75;
    g.fillStyle = '#000'; g.fillRect(gx - 1, gy - 1, 6, GH + 2);
    if (aiming) {
      const top = gy + GH - Math.round(GH * Math.min(1, b.pt + d.band)), bot = gy + GH - Math.round(GH * Math.max(0, b.pt - d.band));
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(gx, top, 4, Math.max(1, bot - top));
    }
    const on = aiming && Math.abs(p - b.pt) <= d.band;
    g.fillStyle = on ? '#ffd23a' : p >= 0.85 ? '#ff4a3a' : '#5fe36a';
    const hgt = Math.round(GH * p);
    g.fillRect(gx, gy + GH - hgt, 4, hgt);
    if (aiming) { const ly = gy + GH - Math.round(GH * b.pt); g.fillStyle = '#fff'; g.fillRect(gx - 2, ly, 8, 1); }
    g.globalAlpha = 1;
  }
  drawHud(g);
  // 글자 팝업
  game.popups = game.popups.filter((p) => p.t < 0.9);
  for (const p of game.popups) {
    p.t += 1 / 60;
    const y = Math.round(p.y - p.t * 18);
    if (p.t > 0.7 && Math.floor(p.t * 20) % 2) continue;
    text(g, p.str, Math.round(p.x - textW(p.str, p.scale) / 2), y, p.color, p.scale);
  }
}
function drawBall(g, b) {
  const [sx, sy] = proj(b.x, b.z, 0);
  const [bx, by] = proj(b.x, b.z, b.h);
  const near = b.z < 12;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(Math.round(sx) - 1, Math.round(sy), near ? 3 : 2, 1);
  g.fillStyle = '#e8f04a';
  if (near) { g.fillRect(Math.round(bx) - 1, Math.round(by) - 2, 3, 3); g.fillStyle = '#fbffc4'; g.fillRect(Math.round(bx) - 1, Math.round(by) - 2, 1, 1); }
  else g.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 2, 2);
}
function drawNet(g) {
  const [l, gy] = proj(-DBL - 0.9, NETZ), [r] = proj(DBL + 0.9, NETZ);
  const top = Math.round(proj(0, NETZ, 0.914)[1]);
  const L = Math.round(l), R = Math.round(r), GY = Math.round(gy);
  g.fillStyle = C.net; g.fillRect(L, top, R - L, GY - top);
  g.fillStyle = C.netHi;
  for (let y = top + 2; y < GY; y += 2) for (let x = L + ((y / 2) % 2); x < R; x += 2) g.fillRect(x, y, 1, 1);
  g.fillStyle = C.line; g.fillRect(L, top, R - L, 2);
  g.fillStyle = C.post; g.fillRect(L - 1, top - 1, 2, GY - top + 1); g.fillRect(R - 1, top - 1, 2, GY - top + 1);
}
function drawHud(g) {
  const st = game.stats;
  if (!st) return;
  // 왼쪽 점수판
  g.fillStyle = '#000'; g.fillRect(4, 52, 74, 34);
  g.fillStyle = '#f6f6ee'; g.fillRect(4, 52, 74, 1); g.fillRect(4, 85, 74, 1); g.fillRect(4, 52, 1, 34); g.fillRect(77, 52, 1, 34);
  text(g, 'SC', 8, 56, '#9fd8f0', 1, null); text(g, String(st.score).padStart(7, ' '), 30, 56, '#fff', 1, null);
  text(g, 'RALLY', 8, 66, '#9fd8f0', 1, null); text(g, String(st.rally).padStart(3, ' '), 56, 66, '#fff', 1, null);
  for (let i = 0; i < 3; i++) { g.fillStyle = i < st.lives ? '#e8f04a' : '#444'; g.fillRect(9 + i * 7, 77, 4, 4); g.fillRect(8 + i * 7, 78, 6, 2); }
  const combo = comboOf(st.rally);
  if (combo > 1) text(g, `x${combo.toFixed(1)}`, 50, 76, '#ffd23a', 1, null);
  // 오른쪽 난이도
  const lbl = D().en;
  text(g, lbl, W - textW(lbl) - 6, 52, '#f7f1d6', 1, '#0f2470');
}

// ── 화면 · 입력 ───────────────────────────────────────
function loop(now) {
  if (!game.root || !game.root.isConnected) { game.raf = 0; if (game.phase === 'play') pause(); return; }
  const dt = Math.min(0.05, (now - (game.last || now)) / 1000);
  game.last = now;
  if (game.phase === 'play') step(dt);
  else { game.t += dt; game.cheer = Math.max(0, game.cheer - dt); }
  draw();
  game.raf = requestAnimationFrame(loop);
}
function pause() {
  if (game.phase !== 'play') return;
  game.phase = 'paused';
  game.charge = null;
  showOverlay('paused');
}

// 방향 = 왼쪽 조이스틱(누른 채 좌우로 밀기, 놓으면 가운데) 또는 ←/→ 키
const curAim = () => (game.keyAim || game.stick || 0) * 0.9;
const moveInput = () => (game.keyAim ? Math.sign(game.keyAim) : game.stick || 0);
function bindStick(base, knob) {
  let id = null;
  const moveTo = (e) => {
    const r = base.getBoundingClientRect();
    const R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
    const n = Math.hypot(dx, dy), max = R * 0.62;
    if (n > max) { dx = (dx / n) * max; dy = (dy / n) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    game.stick = Math.max(-1, Math.min(1, dx / max));
  };
  base.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    id = e.pointerId;
    try { base.setPointerCapture(id); } catch {}
    base.classList.add('down');
    moveTo(e);
  });
  base.addEventListener('pointermove', (e) => { if (e.pointerId === id) moveTo(e); });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    base.classList.remove('down');
    knob.style.transform = '';
    game.stick = 0;
  };
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);
  base.addEventListener('contextmenu', (e) => e.preventDefault());
}
// 스윙 = 꾹 누르기(힘) → 떼기(타이밍). 게임 화면이나 SWING 버튼 어디든
function bindSwing(el) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (game.phase !== 'play') return;
    try { el.setPointerCapture(e.pointerId); } catch {}
    game.charge = { t: game.t };
    el.classList.add('down');
  });
  const end = (e) => { el.classList.remove('down'); if (game.charge) swing(); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', () => { el.classList.remove('down'); game.charge = null; });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
function bindInput(cv) {
  bindSwing(cv);
  window.addEventListener('keydown', (e) => {
    if (!game.root?.isConnected) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') game.keyAim = -0.9;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') game.keyAim = 0.9;
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
      e.preventDefault();
      if (game.phase === 'play' && !game.charge) game.charge = { t: game.t };
    }
  });
  window.addEventListener('keyup', (e) => {
    if (!game.root?.isConnected) return;
    if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) game.keyAim = 0;
    if ((e.code === 'Space' || e.code === 'Enter') && game.charge) { e.preventDefault(); swing(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
}

// ── 클럽 랭킹 (Firestore rallyScores, id = 회원_난이도, 최고 기록만) ──
const clubDoc = (pid, diff) => state.rallyScores.find((x) => x.id === `${pid}_${diff}`);
function submitClub(st) {
  const u = me();
  if (!u) return false;
  const old = clubDoc(u.id, game.diff) || {};
  const acc = st.hits ? Math.round(((st.perfect + st.great) / st.hits) * 100) : 0;
  const better = st.score > (old.score || 0);
  const doc = {
    id: `${u.id}_${game.diff}`, playerId: u.id, diff: game.diff,
    score: Math.max(old.score || 0, st.score), rally: Math.max(old.rally || 0, st.maxRally), perfect: Math.max(old.perfect || 0, st.perfect),
    streak: Math.max(old.streak || 0, st.maxStreak), winners: Math.max(old.winners || 0, st.winners),
    acc: better ? acc : old.acc ?? acc, plays: (old.plays || 0) + 1, at: better ? Date.now() : old.at || Date.now(),
  };
  put('rallyScores', doc).catch(() => {});
  return better;
}
const RANK_SORT = [['score', '점수'], ['rally', '랠리'], ['perfect', '퍼펙트']];
const rankView = { sort: 'score', diff: null };
function renderRank() {
  const box = game.rank;
  if (!box) return;
  const diff = rankView.diff || game.diff;
  const key = rankView.sort;
  const names = new Map(state.players.map((p) => [p.id, p.name]));
  const rows = state.rallyScores.filter((x) => x.diff === diff && names.has(x.playerId) && (x[key] || 0) > 0).sort((a, b) => (b[key] || 0) - (a[key] || 0) || (b.score || 0) - (a.score || 0)).slice(0, 20);
  const u = me();
  const rerank = (f) => { f(); renderRank(); };
  box.replaceChildren(
    h('div', { class: 'row between' }, h('h2', {}, '클럽 랭킹'), h('small', { class: 'muted' }, '회원 최고 기록')),
    h('div', { class: 'chips-scroll' }, Object.entries(DIFFS).map(([k, v]) => h('button', { class: 'chip' + (diff === k ? ' on' : ''), onclick: () => rerank(() => (rankView.diff = k)) }, v.label))),
    h('div', { class: 'seg rally-seg' }, RANK_SORT.map(([k, l]) => h('button', { class: key === k ? 'on' : '', onclick: () => rerank(() => (rankView.sort = k)) }, l))),
    rows.length
      ? h('div', { class: 'rank-list rally-rank' }, rows.map((x, i) =>
          h('a', { class: 'rank-row' + (u && x.playerId === u.id ? ' me' : '') + (i < 3 ? ' top' : ''), href: `#/p/${x.playerId}` },
            h('span', { class: 'rank-num' }, i + 1),
            h('span', { class: 'rank-main' }, h('strong', {}, names.get(x.playerId)), h('small', {}, `랠리 ${x.rally || 0} · 퍼펙트 ${x.perfect || 0} · 위너 ${x.winners || 0} · ${x.plays || 0}판`)),
            h('span', { class: 'sp' }, (x[key] || 0).toLocaleString(), h('small', {}, key === 'score' ? '점' : key === 'rally' ? '회' : '개'))
          )))
      : h('p', { class: 'muted small' }, `${DIFFS[diff].label} 기록이 아직 없어요. 첫 기록의 주인공이 되어 보세요!`),
    u ? '' : h('p', { class: 'muted small' }, '로그인하고 하면 기록이 클럽 랭킹에 올라가요. ', h('button', { class: 'link small', onclick: () => loginSheet() }, '로그인'))
  );
}

const STAT_ROWS = [['score', '최고 점수'], ['rally', '최장 랠리'], ['perfect', '퍼펙트'], ['winners', '위너']];
function recordTable(diff, hl = []) {
  const r = loadRec()[diff] || {};
  return h('div', { class: 'rally-rec' }, STAT_ROWS.map(([k, l]) => h('div', { class: hl.includes(k) ? 'new' : '' }, h('small', {}, l), h('b', {}, r[k] || 0))));
}
function showOverlay(kind) {
  const ov = game.ov;
  if (!kind) { ov.hidden = true; ov.replaceChildren(); return; }
  ov.hidden = false;
  const diffChips = () =>
    h('div', { class: 'rally-diffs' }, Object.entries(DIFFS).map(([k, v]) => h('button', { class: 'rally-chip' + (game.diff === k ? ' on' : ''), onclick: () => { game.diff = k; rankView.diff = null; savePref('oc_rally_diff', k); showOverlay(kind); renderRank(); } }, v.label)));
  if (kind === 'menu') {
    ov.replaceChildren(
      h('div', { class: 'rally-title' }, 'RALLY'),
      h('p', { class: 'rally-how' }, '오른손: SWING을 꾹 눌러 힘 → 공이 발 옆에 올 때 떼기', h('br'), D().auto ? '왼손: 조이스틱 = 방향 (쉬움은 선수가 자동으로 달려가요)' : '왼손: 조이스틱 = 이동 · 칠 때 민 쪽이 방향'),
      diffChips(),
      h('p', { class: 'rally-sub' }, `${D().label} 기록 · 점수 ×${D().mult}`),
      recordTable(game.diff),
      h('button', { class: 'rally-start', onclick: startGame }, 'START')
    );
  } else if (kind === 'paused') {
    ov.replaceChildren(h('div', { class: 'rally-title' }, 'PAUSE'), h('button', { class: 'rally-start', onclick: () => { game.phase = 'play'; showOverlay(null); } }, '계속하기'), h('button', { class: 'rally-link', onclick: () => { game.phase = 'menu'; game.stats = null; game.ball = null; showOverlay('menu'); } }, '처음으로'));
  } else if (kind === 'over') {
    const st = game.stats;
    const acc = st.hits ? Math.round(((st.perfect + st.great) / st.hits) * 100) : 0;
    const r = loadRec()[game.diff] || {};
    const cell = (label, v, key) => h('div', { class: game.newRec.includes(key) ? 'new' : '' }, h('small', {}, label), h('b', {}, v));
    ov.replaceChildren(
      h('div', { class: 'rally-title small' }, 'GAME OVER'),
      game.newRec.length ? h('div', { class: 'rally-new' }, 'NEW RECORD!') : '',
      h('div', { class: 'rally-score' }, h('small', {}, `${D().label} · 점수`), h('b', {}, st.score.toLocaleString())),
      h('div', { class: 'rally-rec four' }, cell('최장 랠리', st.maxRally, 'rally'), cell('퍼펙트', st.perfect, 'perfect'), cell('위너', st.winners, 'winners'), cell('정확도', `${acc}%`)),
      h('p', { class: 'rally-sub' }, `최고 ${(r.score || 0).toLocaleString()}점 · 최장 랠리 ${r.rally || 0} · 연속 퍼펙트 ${r.streak || 0}`),
      me() ? (game.clubNew ? h('div', { class: 'rally-new' }, '클럽 랭킹 기록 경신!') : '') : h('p', { class: 'rally-sub' }, '로그인하면 클럽 랭킹에 올라가요'),
      h('button', { class: 'rally-start', onclick: startGame }, '다시 하기'),
      h('button', { class: 'rally-link', onclick: () => { game.phase = 'menu'; showOverlay('menu'); } }, '난이도 바꾸기')
    );
  }
}

export function rallyView() {
  if (!game.root) {
    const cv = h('canvas', { class: 'rally-cv', width: W, height: H });
    game.cv = cv;
    game.g = cv.getContext('2d');
    game.g.imageSmoothingEnabled = false;
    game.bg = drawBackground();
    game.ov = h('div', { class: 'rally-ov' });
    const swingBtn = h('button', { class: 'rally-swing', type: 'button' }, h('span', {}, 'SWING'));
    const knob = h('div', { class: 'rally-knob' });
    const stick = h('div', { class: 'rally-stick' }, h('span', { class: 'l' }, '◀'), h('span', { class: 'r' }, '▶'), knob);
    game.pad = h('div', { class: 'rally-pad' }, h('div', { class: 'rally-pad-side' }, stick, (game.stickLbl = h('small', {}, '이동 · 방향'))), h('div', { class: 'rally-pad-mid' }, '꾹 눌러 힘', h('br'), '떼면 스윙'), h('div', { class: 'rally-pad-side' }, swingBtn, h('small', {}, '힘 · 타이밍')));
    bindStick(stick, knob);
    bindSwing(swingBtn);
    bindInput(cv);
    resetPlayers();
    const soundBtn = h('button', { class: 'btn ghost small' });
    const setSoundLabel = () => (soundBtn.textContent = game.sound ? '🔊 소리 켜짐' : '🔇 소리 꺼짐');
    soundBtn.addEventListener('click', () => { game.sound = !game.sound; savePref('oc_rally_sound', game.sound ? '1' : '0'); setSoundLabel(); });
    setSoundLabel();
    game.root = h(
      'div',
      { class: 'page rally-page' },
      pageHead('랠리 게임', 'Rally'),
      h('div', { class: 'rally-wrap' }, cv, game.ov),
      game.pad,
      h('div', { class: 'row between' }, h('small', { class: 'muted' }, '키보드: 스페이스 꾹 → 떼기, ←/→ 방향'), soundBtn),
      (game.rank = h('section', { class: 'block' })),
      h(
        'details',
        { class: 'block rally-help' },
        h('summary', {}, '점수 규칙'),
        h('ul', {},
          h('li', {}, '타이밍: PERFECT 100 · GREAT 60 · GOOD 30점 (난이도 배수 적용)'),
          h('li', {}, '파워 라인: 공이 오면 게이지에 흰 선이 생겨요. 타이밍도 맞고 힘도 선에 맞아야 PERFECT (선을 벗어나면 WEAK · STRONG → GREAT)'),
          h('li', {}, '랠리 5개마다 콤보 +0.1배 (최대 2배), 퍼펙트 연속이면 보너스'),
          h('li', {}, '세게(빨간 칸) 치면 빠르지만, 퍼펙트가 아니면 길게 나갈 수 있어요'),
          h('li', {}, '구석으로 빠르게 치면 상대가 못 받아요 → WINNER +300'),
          h('li', {}, '빠르게 떼면 왼쪽, 늦게 떼면 오른쪽으로 쏠려요. 너무 빗나가면 OUT'),
          h('li', {}, '공 3개를 놓치면 끝. 기록은 이 기기에 저장돼요')
        )
      )
    );
    showOverlay('menu');
  }
  renderRank();
  if (!game.raf) { game.last = 0; game.raf = requestAnimationFrame(loop); }
  return game.root;
}

export const _rally = game; // 테스트용
