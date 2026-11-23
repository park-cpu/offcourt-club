// ─────────────────────────────────────────────────────────────
// 라켓 (브랜드별 모델, v1.7.9~)
//   오른손에 쥐고 45도로 기울인 모양 → 라켓 면(줄)이 정면으로 보임
//   s = 손잡이 → 헤드 방향 거리, t = 그와 수직 방향 거리 (둘 다 칸 단위)
//   줄 사이 빈칸은 반투명('#rrggbbaa') → 뒤 배경이 비쳐 보임
//   id는 'b_r_…' — 한 번 정하면 바꾸지 마세요 (구매 기록이 id로 연결됨)
// ─────────────────────────────────────────────────────────────
import { shade } from './pixel.js';

const R2 = Math.SQRT1_2;
const GAP = '#f4f2ea40';

// 로고 (줄 면 가운데에 3×3 정도로 찍는 글자 모양)
const LOGOS = {
  W: ['1...1', '1.1.1', '.1.1.'], // 윌슨
  b: ['1.1', '1.1', '1.1'], // 바볼랏 (줄 무늬 두 줄)
  H: ['1.1', '111', '1.1'], // 헤드
  Y: ['1.1', '.1.', '.1.'], // 요넥스
  P: ['11.', '11.', '1..'], // 프린스
  T: ['111', '.1.', '.1.'], // 테크니화이버
  D: ['11.', '1.1', '11.'], // 던롭
};

/**
 * 라켓 그리기
 * o = { frame, frame2(투톤 · 없으면 frame), string, grip, logo, logoColor, head(헤드 크기 1=100sq in), beam(1|2 프레임 두께), split(투톤 나누는 방식) }
 */
export function racketPaint(o) {
  const head = o.head || 1;
  const K = 1.2; // 전체 크기
  const a = 6.8 * K * Math.sqrt(head), b = 5.1 * K * Math.sqrt(head); // 헤드 반지름 (길이 · 폭)
  const c = 6 + 4.1 * K + a; // 헤드 가운데까지 거리
  const beam = o.beam || 2; // 프레임 두께 (두꺼워야 고유 색이 잘 보임)
  const f1 = o.frame, f2 = o.frame2 || o.frame;
  return (g, A) => {
    const hx = 26.5, hy = A.hand + 3.5; // 손 가운데
    const at = (x, y) => {
      const dx = x + 0.5 - hx, dy = y + 0.5 - hy;
      return [(dx - dy) * R2, (dx + dy) * R2]; // s, t
    };
    // 기본은 고유 색(frame), 보조 색(frame2)은 일부에만: side = 한쪽 면, tip = 헤드 끝, throat = 목 + 헤드 아랫부분
    const frameColor = (s, t, e = 0) => {
      const two = o.split === 'side' ? t > 0.5 : o.split === 'tip' ? s > c + a * 0.6 : o.split === 'throat' ? s < c - a * 0.55 : false;
      const col = two ? f2 : f1;
      return e > 0.82 && t < -b * 0.35 ? shade(col, 0.2) : col; // 위쪽 바깥 테두리만 살짝 밝게
    };
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const [s, t] = at(x, y);
        // 손잡이 + 그립 끝
        if (s >= -3.2 && s < 5.5 && Math.abs(t) <= 0.95) {
          g.set(x, y, s < -2.2 ? shade(o.grip, -0.35) : (Math.round(s) % 3 === 0 ? shade(o.grip, -0.15) : o.grip));
          continue;
        }
        // 목 (V자 두 갈래)
        if (s >= 5.5 && s < c - a + 1.2) {
          const k = (s - 5.5) / (c - a + 1.2 - 5.5);
          const off = 0.6 + k * (b * 0.62);
          if (Math.abs(Math.abs(t) - off) <= 0.9 || (s < 6.6 && Math.abs(t) <= 1)) g.set(x, y, frameColor(s, t));
          continue;
        }
        // 헤드
        const e = ((s - c) / a) ** 2 + (t / b) ** 2;
        const ei = ((s - c) / (a - beam)) ** 2 + (t / (b - beam)) ** 2;
        if (e <= 1 && ei > 1) g.set(x, y, frameColor(s, t, e));
        else if (ei <= 1) {
          // 줄: 세로줄(s 방향) · 가로줄(t 방향)
          const si = Math.round((s - c) / 1.0), ti = Math.round(t / 1.0);
          const onMain = Math.abs(t - ti) < 0.36 && ti % 2 === 0;
          const onCross = Math.abs(s - c - si) < 0.36 && si % 2 === 0;
          g.set(x, y, onMain || onCross ? o.string : GAP);
        }
      }
    // 목 안쪽 브리지
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const [s, t] = at(x, y);
        if (Math.abs(s - (c - a + 0.9)) <= 0.5 && Math.abs(t) <= b * 0.55 && !g.get(x, y)) g.set(x, y, f1);
      }
    // 로고 (줄 면 가운데)
    if (o.logo) {
      const cx = Math.round(hx - 0.5 + c * R2), cy = Math.round(hy - 0.5 - c * R2);
      const L = LOGOS[o.logo], ox = Math.floor(L[0].length / 2);
      L.forEach((row, dy) => row.split('').forEach((v, dx) => v === '1' && g.set(cx - ox + dx, cy - 1 + dy, o.logoColor || f1)));
    }
  };
}

const racket = (id, name, price, o) => ({ id, name, cat: 'wear', slot: 'racket', price, builtin: true, paint: racketPaint(o), brand: name.split(' ')[0] });
const NAT = '#ece6d2'; // 기본 줄 (흰색)

// 2026년 기준 최신 모델 · 고유 색 (id는 그대로 두고 이름 · 색만 최신으로)
export const RACKETS = [
  // 윌슨
  racket('b_r_wl_blade', '윌슨 블레이드 98 v10 (2026)', 180, { frame: '#1d7a43', frame2: '#0e3d23', split: 'tip', string: NAT, grip: '#1b1b1f', logo: 'W', logoColor: '#1b1b1f', head: 0.98 }),
  racket('b_r_wl_ultra', '윌슨 울트라 100 v5', 160, { frame: '#1f62e0', frame2: '#1b1b1f', split: 'throat', string: NAT, grip: '#1b1b1f', logo: 'W', logoColor: '#1b1b1f' }),
  racket('b_r_wl_defyer98', '윌슨 디파이어 98 프로 (2026)', 190, { frame: '#e3262c', frame2: '#1b1b1f', split: 'throat', string: NAT, grip: '#1b1b1f', logo: 'W', logoColor: '#1b1b1f', head: 0.98 }),
  racket('b_r_wl_defyer100', '윌슨 디파이어 100 (2026)', 180, { frame: '#e3262c', frame2: '#f4f2ea', split: 'tip', string: NAT, grip: '#1b1b1f', logo: 'W', logoColor: '#1b1b1f' }),
  racket('b_r_wl_clash', '윌슨 클래시 100 v3', 160, { frame: '#c4202e', frame2: '#1b1b1f', split: 'side', string: NAT, grip: '#1b1b1f', logo: 'W', logoColor: '#1b1b1f' }),
  racket('b_r_wl_prostaff', '윌슨 프로스태프 97 v14', 180, { frame: '#1b1b1f', frame2: '#7a2430', split: 'throat', string: NAT, grip: '#2a2a2e', logo: 'W', logoColor: '#c9a874', head: 0.97 }),
  racket('b_r_wl_shift', '윌슨 시프트 99 v1', 160, { frame: '#f4f2ea', frame2: '#8fc7dc', split: 'throat', string: '#e2dcc4', grip: '#f4f2ea', logo: 'W', logoColor: '#1b1b1f', head: 0.99 }),
  // 바볼랏
  racket('b_r_bb_aero', '바볼랏 퓨어 에어로 (2026)', 180, { frame: '#e8e23a', frame2: '#7d838b', split: 'side', string: '#e8e23a', grip: '#1b1b1f', logo: 'b', logoColor: '#1b1b1f' }),
  racket('b_r_bb_aero98', '바볼랏 퓨어 에어로 98 (2026)', 190, { frame: '#7d838b', frame2: '#e8e23a', split: 'side', string: NAT, grip: '#1b1b1f', logo: 'b', logoColor: '#1b1b1f', head: 0.98 }),
  racket('b_r_bb_drive', '바볼랏 퓨어 드라이브 (2025)', 170, { frame: '#1d62d0', frame2: '#f4f2ea', split: 'tip', string: NAT, grip: '#1d62d0', logo: 'b', logoColor: '#f4f2ea' }),
  racket('b_r_bb_strike', '바볼랏 퓨어 스트라이크 97 (4세대)', 170, { frame: '#f4f2ea', frame2: '#d0262e', split: 'tip', string: NAT, grip: '#1b1b1f', logo: 'b', logoColor: '#1b1b1f', head: 0.97 }),
  racket('b_r_bb_evo', '바볼랏 에보 드라이브 (오버사이즈)', 120, { frame: '#3f9aa8', frame2: '#1b1b1f', split: 'throat', string: NAT, grip: '#1b1b1f', logo: 'b', logoColor: '#f4f2ea', head: 1.15 }),
  // 헤드
  racket('b_r_hd_speed', '헤드 스피드 MP (2026)', 170, { frame: '#f4f2ea', frame2: '#1b1b1f', split: 'side', string: NAT, grip: '#1b1b1f', logo: 'H', logoColor: '#1b1b1f' }),
  racket('b_r_hd_boom', '헤드 붐 MP (2026)', 160, { frame: '#23b5a6', frame2: '#f06fa8', split: 'tip', string: NAT, grip: '#1b1b1f', logo: 'H', logoColor: '#1b1b1f' }),
  racket('b_r_hd_extreme', '헤드 익스트림 MP', 160, { frame: '#d8e23a', frame2: '#1b1b1f', split: 'throat', string: '#1b1b1f', grip: '#1b1b1f', logo: 'H', logoColor: '#1b1b1f' }),
  racket('b_r_hd_radical', '헤드 래디컬 MP', 160, { frame: '#f07a1a', frame2: '#1f2a55', split: 'tip', string: NAT, grip: '#1f2a55', logo: 'H', logoColor: '#1f2a55' }),
  racket('b_r_hd_gravity', '헤드 그래비티 프로', 170, { frame: '#d0262e', frame2: '#2a56c8', split: 'side', string: NAT, grip: '#1b1b1f', logo: 'H', logoColor: '#f4f2ea' }),
  racket('b_r_hd_prestige', '헤드 프레스티지 프로', 180, { frame: '#1b1b1f', frame2: '#c8292f', split: 'throat', string: NAT, grip: '#1b1b1f', logo: 'H', logoColor: '#c8292f', head: 0.95 }),
  // 요넥스
  racket('b_r_yx_vcore', '요넥스 브이코어 98 (2026)', 180, { frame: '#a8142a', frame2: '#d9c7a0', split: 'tip', string: NAT, grip: '#1b1b1f', logo: 'Y', logoColor: '#1b1b1f', head: 0.98 }),
  racket('b_r_yx_ezone', '요넥스 이존 100 (2025)', 170, { frame: '#2a6ad6', frame2: '#1b1b1f', split: 'throat', string: NAT, grip: '#1b1b1f', logo: 'Y', logoColor: '#1b1b1f' }),
  racket('b_r_yx_percept', '요넥스 퍼셉트 97', 160, { frame: '#556330', frame2: '#1b1b1f', split: 'throat', string: NAT, grip: '#1b1b1f', logo: 'Y', logoColor: '#f4f2ea', head: 0.97 }),
  // 프린스 · 테크니화이버 · 던롭
  racket('b_r_pr_textreme', '프린스 텍스트림 투어 100', 140, { frame: '#1b1b1f', frame2: '#3f9a4f', split: 'tip', string: NAT, grip: '#1b1b1f', logo: 'P', logoColor: '#3f9a4f' }),
  racket('b_r_tf_tf40', '테크니화이버 TF40 305', 160, { frame: '#1b1b1f', frame2: '#f4f2ea', split: 'side', string: '#d8392b', grip: '#1b1b1f', logo: 'T', logoColor: '#f4f2ea', head: 0.98 }),
  racket('b_r_tf_tfight', '테크니화이버 티파이트 305', 150, { frame: '#f07a1a', frame2: '#3a3d44', split: 'throat', string: NAT, grip: '#1b1b1f', logo: 'T', logoColor: '#1b1b1f', head: 0.98 }),
  racket('b_r_dl_cx', '던롭 CX 200', 150, { frame: '#1b1b1f', frame2: '#c8292f', split: 'side', string: NAT, grip: '#1b1b1f', logo: 'D', logoColor: '#c8292f', head: 0.98 }),
  racket('b_r_dl_sx', '던롭 SX 300', 140, { frame: '#f0d02a', frame2: '#2a56c8', split: 'tip', string: NAT, grip: '#1b1b1f', logo: 'D', logoColor: '#1b1b1f' }),
];
