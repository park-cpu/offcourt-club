// ─────────────────────────────────────────────────────────────
// 서버(공용 DB) 설정
// firebase 값이 비어 있으면 "체험 모드"로 동작합니다.
//   → 데이터가 이 브라우저에만 저장되고, 다른 회원과 공유되지 않아요.
// 실제 운영은 README.md 의 "Firebase 연결" 순서대로 값을 채워 주세요.
// ─────────────────────────────────────────────────────────────

export const FIREBASE_CONFIG = null;
/* 예시)
export const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "offcourt-xxxx.firebaseapp.com",
  projectId: "offcourt-xxxx",
  storageBucket: "offcourt-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef",
};
*/

// 같은 Firebase 프로젝트를 여러 클럽이 쓸 때 구분용 (보통 그대로 두세요)
export const CLUB_ID = 'offcourt';
