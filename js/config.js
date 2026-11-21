// ─────────────────────────────────────────────────────────────
// 서버(공용 DB) 설정 — Firebase 프로젝트 offcourt-club
// FIREBASE_CONFIG 를 null 로 바꾸면 "체험 모드"(이 브라우저에만 저장)로 동작합니다.
// 이 값들은 웹페이지에 원래 공개되는 값이라 GitHub에 올려도 괜찮아요.
// 데이터 보호는 Firestore 규칙(firestore.rules)이 담당합니다.
// ─────────────────────────────────────────────────────────────

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA2KVGzRUkfYs3q-BWHvvqyYTS-q8I_ghg',
  authDomain: 'offcourt-club.firebaseapp.com',
  projectId: 'offcourt-club',
  storageBucket: 'offcourt-club.firebasestorage.app',
  messagingSenderId: '273623876481',
  appId: '1:273623876481:web:074767e01d997afb23de80',
};

// 같은 Firebase 프로젝트를 여러 클럽이 쓸 때 구분용 (보통 그대로 두세요)
export const CLUB_ID = 'offcourt';
