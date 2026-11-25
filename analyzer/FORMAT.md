# 영상 분석 결과 형식 (v1)

분석기(Mac 시험판 · 나중에 서버)가 만드는 JSON. 앱은 이 형식을 Firestore `analyses` 컬렉션에 그대로 저장하고 화면을 그립니다.

## 코트 좌표 (미터)

- 원점 = 네트 중앙. 위에서 내려다본 코트
- `x`: 좌우. 카메라에서 볼 때 오른쪽이 +. 복식 사이드라인 ±5.485, 단식 ±4.115
- `y`: 앞뒤. 카메라 쪽(가까운 쪽) 베이스라인 −11.885, 먼 쪽 베이스라인 +11.885, 서비스 라인 ±6.40

## 문서

```jsonc
{
  "id": "a_xxx",                // 앱이 정함
  "v": 1,                       // 형식 버전
  "title": "11월 25일 제2경기",
  "date": "2026-11-25",
  "matchId": "m_xxx",           // 선택: 앱의 경기 기록과 연결
  "scheduleId": "s_xxx",        // 선택
  "video": { "kind": "youtube", "id": "mQ-Zo5mHD9w" },   // 또는 { "kind": "file", "url": "https://..." }
  "duration": 1255,             // 초
  "status": "done",             // queued(대기) · processing(분석 중) · done · error
  "engine": "oc-analyzer 0.1",
  "players": { "P1": "p_abc", "P2": null, "P3": null, "P4": null },  // 영상 속 선수 → 회원 id (앱에서 지정)
  "rallies": [
    { "t0": 12.4, "t1": 21.0, "win": "far", "end": "error", "srv": "P1" }  // win: near|far|null, end: winner|error|fault|unknown, srv: 서버(0.2~, 선택)
  ],
  "shots": [
    {
      "t": 12.9,          // 영상 속 시각(초)
      "r": 0,             // rallies 순번
      "p": "P1",          // 친 선수 (P1 · P2 = 처음 가까운 쪽, P3 · P4 = 먼 쪽)
      "k": "serve",       // serve · fh(포핸드) · bh(백핸드) · volley · overhead · unknown
      "hx": 1.2, "hy": -12.0,   // 친 위치 (선택)
      "bx": -2.1, "by": 4.8,    // 바운드 위치 (네트면 by≈0, 모르면 생략)
      "res": "in",        // in · out · net · unknown
      // ↓ 분석기 0.2~ (자세 · 소리), 모두 선택
      "h": "mid",         // 타점 높이 low(무릎 아래쪽) · mid · high(어깨 위)
      "reach": "normal",  // 공과 몸 거리 close(붙음) · normal · far(뻗음)
      "run": 1.2,         // 치기 직전 0.5초 이동 속도 m/s (2.5 이상 = 뛰면서 침)
      "fault": 1          // 서브 폴트
    }
  ]
}
```

- 방향(크로스 · 스트레이트 · 가운데)과 깊이(짧게 · 중간 · 깊게)는 앱이 `hx`·`bx`·`by`로 계산
- 실수 원인 · 선수별 피드백 문장은 앱이 `h`·`reach`·`run`·위치·바운드로 만듦 (`js/coach.js`)
- `hands`(선택): 슬롯별 손잡이 추정 {"P1": "R"} — 서브 때 움직인 손목
- 문서 하나에 25분 경기 약 150랠리 · 700샷 ≈ 70KB (Firestore 1MB 제한 안쪽)
