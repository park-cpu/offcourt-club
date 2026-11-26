// ─────────────────────────────────────────────────────────────
// 선수 캐릭터 (v1.26.0~) — 상점 '선수' 칸에서 사서 내 아바타 옆에 세움
//   v1.26.1~ 조합이 아니라 선수마다 새로 그린 도트 (회원 아바타와 같은 크기 · 비율 · 테두리 방식)
//   rows = 글자 격자(35칸 폭 = 몸 31칸 + 양옆 머리카락 2칸), pal = 글자 → 색
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

// ── 라파엘 나달 (2008년 무렵: 긴 웨이브 머리 · 청록 헤어밴드 · 청록 민소매 · 흰 7부 바지) ──
function nadalRows() {
  // 머리 · 얼굴 (35칸 폭, 가운데 = 17번째 칸)
  const head = [
    '...........HHHHHHH',
    '........HHHdhhhhhh',
    '......HHdhhhhlhhhh',
    '.....Hdhhhlhhhhhhh',
    '....Hdhhhlhhhhlhhh',
    '...BBBBBBBBBBBBBBB',
    '...Bbbbbbbbbbbbbbb',
    '...Beeeeeeeeeeeeee',
    '..HBBBBBBBBBBBBBBB',
    '.HhdLSSSSSSSSSSSSS',
    'HhhdLSSSSSSSSSSSSS',
    'HhldLSSSSSSSSSSSSS',
    'HhhdLSEEEEESSSSSSS',
    'HlhdLSSEEEESSSSSSS',
    'HhhdLSSSKKKSSSSSsS',
    'HhldLSSSKWKSSSSSsS',
    'HhhdLSSSSSSSSSSSsS',
    'HhhdmSSSSSSSSSSSsS',
    'HlhdmSSSSSSSSSSsLL',
    'HhhdmSSSSSSSSSSSSS',
    'HhhdmSSSSSSSSSSrrr',
    'HhldLsSSSSSSSSSSSS',
    'HhhdLsSSSSSSSSSsss',
    'HhhhdLsSSSSSSSssss',
    'HhlhdHLLsssSSSssss',
    'HhhhhdH.LLssssssss',
    '.HhhhhdH..LLLsssss',
  ].map(mirror);
  // 어깨 ~ 손목 (31칸 폭, 가운데 = 15번째 칸) — 민소매라 팔이 다 보임
  const arms = [
    '......LSSTCTLsss',
    '....LSSSSTCCTLss',
    '...LSSSSSTCCCCTL',
    '...LSSSSsTCCCCCC',
    '....LSSSsTkCCCCC',
    '....LSSSsTkkCCCC',
    '....LSSSsTkkCCCC',
    '....LSSssTkkCCCC',
    '....LSSssTkCCCCC',
    '....LSSssTkCCCCC',
    '....LmSssTkCCCCC',
    '....LSSssTkCCCCC',
    '....LSSssTcCCCCC',
    '....XXXXXTcCCCCC',
    '....XXXXXTccCCCC',
  ].map(mirror);
  // 손 · 바지 · 신발 (회원 아바타 템플릿과 같은 자리 → 라켓이 손에 맞음)
  const legs = [
    '...mLSsTCCCCTTTTTTTCCCCTsSL....',
    '...mmSmTTTTTTqqqqqTTTTTTsSm....',
    '...mSSmcyyyyTqQPqqTyyyyTsSSL...',
    '...mSSmTccccqQPgPqqccccTsSSL...',
    '...mLLLPPqqqQQP.PqqqQQPLLLL....',
    '...mmmmPPqqqQQP.PqqqQQPmmmm....',
    '........PqqqQQP.PqqqQQP........',
    '........PqqqQQP.PqqqQQP........',
    '........PqqqQQP.PqqqQQP........',
    '........PqGqQQP.PqqGQQP........',
    '........PPPPPPP.PPPPPPP........',
    '........mSSSsLm.mLSSSsm........',
    '........mSSSsLm.mLSSSsm........',
    '.......fOSSSsLO.OLSSSOO........',
    '.......OOOGfFFO.OFFfGOOO.......',
    '......OGGffOfFF.FFFOffGGOG.....',
    '.....OGGGfffOO...OOfffGGfF.....',
    '....OffGGfffFO...OFfffGGffO....',
    '....OffffffFFO...OFFffffGfO....',
    '....FOOOOOOOOO...OOOOOOOOOF....',
    '.....OOOOOOOOO...OOOOOOOOO.....',
  ];
  const pad = (r) => '..' + r + '..';
  const rows = [...head, ...[...arms, ...legs].map(pad)];
  // 어깨 위로 흘러내린 머리카락 (끝이 바깥으로 뻗친 웨이브)
  [['HhhhdH', 0], ['HhhdH', 0], ['HdH', 1], ['H', 2]].forEach(([s, x], i) => {
    put(rows, 27 + i, x, s);
    put(rows, 27 + i, 35 - x - s.length, [...s].reverse().join(''));
  });
  // 얼굴 오른쪽 그늘 (회원 아바타처럼 빛이 왼쪽 위에서)
  for (let y = 9; y <= 23; y++) rows[y] = rows[y].slice(0, 25) + rows[y].slice(25, 30).replace(/S/g, 's') + rows[y].slice(30);
  // 헤어밴드 · 셔츠의 작은 흰 체크 표시
  put(rows, 6, 25, 'ww');
  put(rows, 7, 24, 'w');
  put(rows, 32, 21, 'n');
  put(rows, 33, 20, 'n');
  return rows;
}

const NADAL_PAL = {
  // 머리카락 (짙은 갈색 웨이브)
  H: '#1c110b', d: '#352015', h: '#4f3221', l: '#6e4b33',
  // 헤어밴드 (청록)
  B: '#0f5a5d', b: '#22a3a6', e: '#4fc6c4', w: '#f4f2ea',
  // 피부 (그을린 톤)
  S: '#e6ac7f', s: '#c98c5e', m: '#a9693f', L: '#764126',
  // 얼굴: 굵은 눈썹 · 눈 · 볼 · 입(“바모스!”)
  E: '#24150d', K: '#120a06', W: '#ffffff', o: '#e69a82', r: '#8e3a32', R: '#3d1210', Z: '#f4f2ea',
  // 민소매 (청록 + 옆 검정 패널)
  T: '#0c4f52', C: '#2fb3b2', c: '#21908f', y: '#6bd3cf', k: '#1b1b1f', n: '#f4f2ea',
  // 손목밴드
  X: '#1b1b1f',
  // 흰 7부 바지
  P: '#8f8b80', q: '#f2f0e8', Q: '#d3cfc1', g: '#ffffff',
  // 신발 (흰색 + 청록)
  O: '#4d4d4d', f: '#f2f0e8', F: '#cfcbbf', G: '#2fb3b2',
};

function pro(id, name, price, draw) {
  return { id, name, cat: 'wear', slot: 'partner', price, builtin: true, partner: { ...draw, items: RACKET_MAP } };
}

export const PROS = [pro('b_pro_nadal', '라파엘 나달', 500, { rows: nadalRows(), pal: NADAL_PAL, ox: 2, dy: 1, racket: 'b_r_bb_aero', lefty: true })];
