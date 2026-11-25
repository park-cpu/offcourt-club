// ─────────────────────────────────────────────────────────────
// 기능 켜기 · 끄기 (v1.19.0~)
//   false = 회원에게 메뉴 · 버튼 · 화면을 숨김 (코드 · 저장된 데이터는 그대로)
//   다시 켜려면 true로 바꾸고 버전을 올리면 됨
// ─────────────────────────────────────────────────────────────
import { isAdmin } from './store.js';

export const FEATURES = {
  // 영상 분석: 정확도가 아직 부족해 숨김 (2026-11-25). 관리자는 '내 정보 → 영상 분석 (숨김 중)'으로 계속 볼 수 있음
  analysis: false,
};

/** 이 사람에게 보여 줄지: 켜져 있으면 모두, 꺼져 있으면 관리자만(adminToo = true일 때) */
export const featureOn = (key, adminToo = false) => FEATURES[key] || (adminToo && isAdmin());
