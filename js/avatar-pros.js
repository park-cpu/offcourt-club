// ─────────────────────────────────────────────────────────────
// 선수 캐릭터 (v1.26.0~) — 상점 '선수 스킨' 칸에서 사서 착용하면 내 아바타 대신 선수가 나옴 (v1.27.3~ 스킨)
//   v1.26.1~ 조합이 아니라 선수마다 새로 그린 도트 (회원 아바타와 같은 크기 · 비율 · 테두리 방식)
//   rows = 글자 격자, pal = 글자 → 색 (v1.27.0~ 캐리커처 도트: 실제 체형 비율 · 진한 외곽선)
//   racket = 손에 드는 라켓 아이템 id (js/avatar-rackets.js), lefty = 왼손잡이 → 좌우 뒤집어 그림
//   그리기는 pixel.js partnerCanvas → drawStage에서 아바타 자리에 (person = 사람 부분 칸 범위, 가운데 맞춤)
//   id는 'b_pro_…' — 바꾸지 말 것 (구매 기록이 id로 연결됨)
//   ※ 클럽 안에서만 쓰는 팬아트 캐릭터 (실제 사진 · 로고는 쓰지 않음)
// ─────────────────────────────────────────────────────────────
import { RACKETS } from './avatar-rackets.js';

const RACKET_MAP = new Map(RACKETS.map((it) => [it.id, it]));


// ── 라파엘 나달 (v1.27.1~): 사용자가 고른 도트 그림을 칸 단위로 옮김 (40×63칸, 오른쪽을 봄)
//   원본 그림의 도트 격자(가로 23.3px · 세로 21.2px)를 찾아 칸마다 가운데 색을 읽고 20색으로 정리
//   흰 배경은 지우고, 헤어밴드 · 셔츠 · 손목 · 신발의 로고는 바탕색으로 덮음. 라켓도 그림에 포함
//   v1.27.2~ 회원 아바타 비율에 맞춤: 머리(목까지 21줄)를 1.3배 → 27줄, 몸(40줄)을 세로 0.9배 → 36줄 = 키 63줄
const NADAL_ROWS = [
  '.............bbbbff.....................',
  '.............bbbbff.....................',
  '..........bbbffffbbff...................',
  '..........fffffbbbbbbb..................',
  '......bbbffffbbbbieeeee.................',
  '......bbbffffbbbbieeeee.................',
  '.....bbbffffbffiieeeeeeee...............',
  '.....bffbbbbbfieeeeeeeeee...............',
  '.....bffbbbbbieeeeeeeipppi..............',
  '.....bffbbbbbieeeeeeeipppi..............',
  '....bffffbbbieeeeipppppppi..............',
  '....ffbbbieeeeeiipppppppppb.............',
  '....bbbbieeeeiiccpiiiippppb.............',
  '....bbbbeeiiibfbbpiiiiippbl.............',
  '....bbbbeeiiibfbbpiiiiippbl.............',
  '.....bbbiipppbbbbppppiippp..............',
  '......bbbbppjpbpppppppppppp.............',
  '..eeeeiibbppjpbppppppppjjpp.............',
  '..eeeeiibbppjpbppppppppjjpp.............',
  '.ieeeiccbbpppapppppppppppp..............',
  '.iii....bbbbbbppppppppdddh..............',
  '......bbbbbbpjppppppppooo...............',
  '......bbbbbbpjppppppppooo...............',
  '......bbbbbbppppppppppooo...............',
  '.........bpppphhhppppproo...............',
  '..........ppppphhhappprrr...............',
  '......iiiiiipppaahhpppppp...............',
  '......iieeeeipppjiiibc..................',
  '.....ieeeeeeiiiiiiee....................',
  '....ieeeeeeipppieeeeee..................',
  '....ieeeeeipppppieeeeei.................',
  '....ieeeeiipppppieeieei.................',
  '....ieeeeiipppppieeeeeii.........iiil...',
  '....ieeeiiiepppbieeeeiii.......iiiddii..',
  '....ieiiiieeejhieeeeeiei......iicccccii.',
  '....iipppeeeeiieeeeeiiei.....iicdcddcdi.',
  '....ipajphieieegggggipi......icddcddcddi',
  '....ijppppjiigggggttipi.....idcddcddcdli',
  '.....jpppjjiggggttttippi....idccdcddcdci',
  '.....jppjjiggttttttdippp....idcddcddcdii',
  '.....ijjjigttttttdddipppi...iccccccccci.',
  '......iiigttttddddddipppi...idcddcddiii.',
  '........itttdddddddddipppii.iiccccciii..',
  '........itdddddddddddijppppiliiiiiiii...',
  '.........iiiiiiiiiiidiiaapppcdiiiii.....',
  '.......ieeeeeeeiieeeei..iijjii..........',
  '.......ieeeeeeiiieeeei..iili............',
  '......ieeeeeeiiieeeeeei.iddi............',
  '......ieeeeiiiiiiiieeei.idgc............',
  '......ieeeeeii.iiieeeei..ii.............',
  '.....iiiiieei....ieeiiii................',
  '.....ippppiii....iiiiapi................',
  '.....ippppi.......ippppi................',
  '....ipppppi.......ippppi................',
  '....ippppi.........ippppi...............',
  '....iaaai..........ijaaai...............',
  '....idddi...........idddi...............',
  '...iddddi...........iddddi..............',
  '...iddddi...........iddddi..............',
  '..illddddi..........ilddddii............',
  '.iddldddddi........ildldddddi...........',
  'cdddddddlli........illlddddddi..........',
  'ccccdddliii........iiilldddcci..........',
];
const NADAL_PAL = { a: '#f3a56b', b: '#21130c', c: '#b0b0b0', d: '#faf9fa', e: '#202645', f: '#70422b', g: '#65658d', h: '#a0623e', i: '#0b0e15', j: '#de8651', l: '#dfdce1', o: '#5e1312', p: '#fdb981', r: '#d6373c', t: '#aba8c8' };

function pro(id, name, price, draw) {
  return { id, name, cat: 'wear', slot: 'partner', price, builtin: true, partner: { ...draw, items: RACKET_MAP } };
}

// w = 격자 폭, body = 뒤집기 전 몸(팔 포함)의 왼쪽 · 오른쪽 칸, dy = 위 여백(발끝을 바닥에 맞춤)
// hand = 라켓 쥔 손의 줄(racketPaint 기준), rx = 라켓을 오른쪽으로 옮길 칸
export const PROS = [
  pro('b_pro_nadal', '라파엘 나달', 500, { rows: NADAL_ROWS, pal: NADAL_PAL, w: 40, body: [0, 39], person: [0, 27], dy: 1 }),
];
