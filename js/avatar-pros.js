// ─────────────────────────────────────────────────────────────
// 선수 캐릭터 (v1.26.0~) — 상점 '선수' 칸에서 사서 내 아바타 옆에 세움
//   v1.26.1~ 조합이 아니라 선수마다 새로 그린 도트 (회원 아바타와 같은 크기 · 비율 · 테두리 방식)
//   rows = 글자 격자, pal = 글자 → 색 (v1.27.0~ 캐리커처 도트: 실제 체형 비율 · 진한 외곽선)
//   racket = 손에 드는 라켓 아이템 id (js/avatar-rackets.js), lefty = 왼손잡이 → 좌우 뒤집어 그림
//   그리기는 pixel.js partnerCanvas, 두 명 무대는 drawStage
//   id는 'b_pro_…' — 바꾸지 말 것 (구매 기록이 id로 연결됨)
//   ※ 클럽 안에서만 쓰는 팬아트 캐릭터 (실제 사진 · 로고는 쓰지 않음)
// ─────────────────────────────────────────────────────────────
import { RACKETS } from './avatar-rackets.js';

const RACKET_MAP = new Map(RACKETS.map((it) => [it.id, it]));

// 왼쪽 절반(가운데 칸 포함)을 적으면 오른쪽은 거울처럼 채움
const mirror = (half) => half + [...half.slice(0, -1)].reverse().join('');
const put = (rows, y, x, s) => (rows[y] = rows[y].slice(0, x) + s + rows[y].slice(x + s.length));

// ── 라파엘 나달 (v1.27.0~ 캐리커처 도트: 실제 체형 비율 · 진한 외곽선 · 2~3단계 명암) ──
//   45칸 폭 좌우 대칭(가운데 22번째 칸)으로 적고, 오른손 라켓은 racketPaint로 얹음
function nadalRows() {
  const half = [
    '                OOOOOOO',
    '             OOOhhjhhhh',
    '           OOhhhjhhhhjh',
    '          Ohhjhhhhhhhhh',
    '          OhBBBBBBBBBBB',
    '          OhBbbbbbbbbbb',
    '          OhBnnnnnnnnnn',
    '          OhBBBBBBBBBBB',
    '         OhhhhOSSSSSSSS',
    '         OhhhhOSEEEEEsS',
    '         OhhhhOSDWKKDsi',
    '         OhhhhOSSDDSSsi',
    '         OhhhhOSSSSSSsi',
    '         OhhhhOSSSSSSsi',
    '         OhhhhOsSSSSsDD',
    '         OhhhhOsSSSrrrr',
    '         OhhhhOsSSrMMZZ',
    '         OhhhhOsSSrMMMM',
    '         OhhhhhOsSSrMMM',
    '         OhhhhhhOsSrrrr',
    '          OhhhhhODsssss',
    '          OhhhhhOOOssss',
    '          OhhhhhO  Osss',
    '          OSSShhhhTCCTs',
    '         OSSSShhhOTCCCT',
    '        OiSSSSsTCCCCCCC',
    '       OiSSSSSsTkCCCCCC',
    '      OSSSSSssOTkkCCCCC',
    '      OSSSSsDsOTkkCCCCC',
    '       ODSSsDO TkkCCCCC',
    '       OSSSsDO TkCCCCCC',
    '       OSSSsDO TkCCCCCC',
    '       OSSssDO TcCCCCCC',
    '       OXXXXXO TcCCCCCC',
    '       OXXXXXO TccCCCCC',
    '      OSSSSsDO TTTTTTTT',
    '      OSDSDsDO PqqqqqqQ',
    '       OOOOOO  PqqqqqqQ',
    '               PqqqqqqP',
    '               PqqqqQP',
    '               PqgqqQP',
    '               PqqqqQP',
    '               PqqqqQP',
    '               PqqqqQP',
    '               PPPPPPP',
    '                OSSsO',
    '                OSSsO',
    '                OSSsO',
    '                OSsDO',
    '                OSSsO',
    '                OSSsO',
    '                OffFO',
    '               OfffFO',
    '              OffffGFO',
    '             OfffGGfFO',
    '            OffffffFFO',
    '            OOOOOOOOOO',
  ];
  const rows = half.map((r) => {
    const l = r.padEnd(23, ' ').replace(/ /g, '.');
    return l + [...l.slice(0, 22)].reverse().join('');
  });
  // 헤어밴드 · 셔츠 · 손목밴드의 작은 흰 체크
  put(rows, 5, 26, 'ww');
  put(rows, 6, 25, 'w');
  put(rows, 27, 27, 'w');
  put(rows, 28, 25, 'ww');
  return rows;
}

const NADAL_PAL = {
  O: '#24150e', // 외곽선
  // 머리카락
  h: '#4a2e1c', j: '#6e4a31',
  // 헤어밴드 (청록)
  B: '#0f6a6e', b: '#22a7ab', n: '#62d0cd', w: '#f4f2ea',
  // 피부 (그을린 톤, 3단계 + 하이라이트)
  i: '#f6cba2', S: '#e7ad82', s: '#c98a5d', D: '#a1623a',
  // 얼굴
  E: '#2a180e', K: '#140b06', W: '#fbf8f0', M: '#4a1013', Z: '#f4f2ea', r: '#a64a42',
  // 민소매 (청록 + 옆 검정 패널)
  T: '#0d5457', C: '#2fb4b2', c: '#20908f', k: '#1b1b1f',
  // 손목밴드
  X: '#1b1b1f',
  // 흰 7부 바지
  P: '#7d7a70', q: '#f2f0e8', Q: '#d4d0c2', g: '#ffffff',
  // 양말 · 신발
  f: '#f2f0e8', F: '#c9c5b8', G: '#2fb4b2',
};

function pro(id, name, price, draw) {
  return { id, name, cat: 'wear', slot: 'partner', price, builtin: true, partner: { ...draw, items: RACKET_MAP } };
}

// w = 격자 폭, body = 뒤집기 전 몸(팔 포함)의 왼쪽 · 오른쪽 칸, dy = 위 여백(발끝을 바닥에 맞춤)
// hand = 라켓 쥔 손의 줄(racketPaint 기준), rx = 라켓을 오른쪽으로 옮길 칸
export const PROS = [
  pro('b_pro_nadal', '라파엘 나달', 500, { rows: nadalRows(), pal: NADAL_PAL, w: 56, body: [6, 38], dy: 7, racket: 'b_r_bb_aero', hand: 32, rx: 8, lefty: true }),
];
