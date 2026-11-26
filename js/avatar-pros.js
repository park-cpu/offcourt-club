// ─────────────────────────────────────────────────────────────
// 선수 캐릭터 (v1.26.0~) — 상점 '선수' 칸에서 사서 내 아바타 옆에 세움
//   회원 아바타와 같은 방식(템플릿 + 아이템)으로 그림 → 같은 스타일
//   look = 회원 아바타와 같은 모양, own = 이 선수만 쓰는 옷(기존 옷을 색만 바꿔 복사)
//   lefty = 왼손잡이 → 좌우를 뒤집어 그림 (pixel.js partnerCanvas)
//   선수를 착용하면 무대를 2배 해상도로 그려 두 명이 같이 섬 (pixel.js drawStage)
//   id는 'b_pro_…' — 바꾸지 말 것 (구매 기록이 id로 연결됨)
//   ※ 클럽 안에서만 쓰는 팬아트 캐릭터 (실제 선수 사진 · 로고는 쓰지 않음)
// ─────────────────────────────────────────────────────────────
import { TENNIS_ITEMS } from './avatar-tennis.js';
import { RACKETS } from './avatar-rackets.js';

const BY_ID = new Map([...TENNIS_ITEMS, ...RACKETS].map((it) => [it.id, it]));
// 기존 아이템을 복사해 색만 바꿈 (무늬 · 모양은 그대로)
const recolor = (id, newId, color, acc) => ({ ...BY_ID.get(id), id: newId, color, acc: { ...BY_ID.get(id)?.acc, ...acc }, hidden: true, active: false });

function pro(id, name, price, look, own, extra = {}) {
  const items = new Map([...BY_ID, ...own.map((it) => [it.id, it])]);
  return { id, name, cat: 'wear', slot: 'partner', price, builtin: true, partner: { look: { wear: {}, deco: [], ...look }, items, ...extra } };
}

export const PROS = [
  // 라파엘 나달: 그을린 피부 · 짙은 머리 + 흰 헤어밴드 · 민소매 라임 상의 · 흰 7부 바지 · 노란 라켓 · 왼손잡이
  pro(
    'b_pro_nadal',
    '라파엘 나달',
    500,
    {
      sex: 'M',
      skin: 2,
      hair: 'spiky',
      hairColor: 0,
      wear: { top: 'b_pro_nadal_top', bottom: 'b_pro_nadal_pants', shoes: 'b_pro_nadal_shoes', hat: 'b_t_h_nk_band', racket: 'b_r_bb_aero' },
    },
    [
      recolor('b_t_nk_slam', 'b_pro_nadal_top', '#a6d33a', { a: '#1a1a1f' }),
      recolor('b_t_fl_capri', 'b_pro_nadal_pants', '#f2f0e8', { v: '#a6d33a' }),
      recolor('b_t_nk_vapor', 'b_pro_nadal_shoes', '#f2f0e8', { w: '#a6d33a', e: '#f2f0e8' }),
    ],
    { lefty: true }
  ),
];
