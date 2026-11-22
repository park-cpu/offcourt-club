# Offcourt Club — 프로젝트 메모

테니스클럽 Offcourt 운영 웹앱. 빌드 도구 없는 순수 HTML/CSS/JS(ES modules).
- 사이트: https://park-cpu.github.io/offcourt-club/ (GitHub Pages, `main` 브랜치 root)
- 저장소: github.com/park-cpu/offcourt-club
- DB: Firebase Firestore 프로젝트 `offcourt-club` (서울), 경로 `clubs/offcourt/{collection}/{id}`
- 사용자는 비개발자. 설명은 한국어로, 쉬운 말로, 단계별로.

## 업데이트 절차
1. 코드 수정 → `js/version.js`의 `APP_VERSION` 올리기 → `CHANGELOG.md`에 한 줄 기록
2. 커밋까지 Claude가 함 (git user.name이 없으므로 `-c user.name="Offcourt" -c user.email="noreply@anthropic.com"`)
3. 푸시는 사용자가 GitHub Desktop의 **Push origin** 버튼으로 함 (이 PC에는 gh CLI 없음)
4. 실제 Firestore에는 테스트 데이터를 쓰지 말 것 (운영 데이터). 기능 테스트는 `js/config.js`를 임시로 `FIREBASE_CONFIG = null && {`(체험 모드)로 바꿔 로컬에서 하고, 커밋 전에 되돌린 뒤 `git show HEAD:js/config.js`로 확인할 것.
5. 로컬 테스트 서버: `python3 -m http.server 8766 --directory "<이 폴더>"` (사용자 허락 받고 실행) → 브라우저 창에서 http://localhost:8766 → 첫 화면 "데모 데이터로 체험하기". (미리보기 도구가 예전 폴더를 띄우는 문제가 있었음). 브라우저가 예전 JS를 캐시하면 `fetch(url,{cache:'reload'})`로 갱신 후 새로고침.
6. 빌드 도구가 없어 JS 파일에 버전 쿼리가 안 붙음 → 업데이트 직후(GitHub Pages 캐시 10분) 휴대폰에 예전/새 파일이 섞일 수 있음. index.html의 8초 안전장치가 새로고침 버튼을 띄움. 새 export를 추가할 때 이 점 유의.

## 확정된 규칙 (사용자와 합의됨)
- 레이팅: NTRP 시작값(3.0=1000, 0.5당 100) + Elo, 복식은 팀 평균, 점수차 배수(6:0 ×1.5 … 7:6 ×1.0), 처음 10경기 K=32 이후 20
- 시즌 순위는 공식전·코인전 따로 (v1.6.0~). 공식전 포인트 = 공식전 레이팅 변동 합 + 경기당 1점. 코인전 포인트 = 코인전 레이팅 변동 합 + 경기당 1점 + 코인전 순수익 × 10 (`RULES.coinPoint`, 출석·지급·대출 코인 제외). 시즌 포인트의 레이팅 변동은 고정 K=20(`RULES.kSeason`, v1.6.2~)으로 따로 계산해 신입 부풀림 방지. 각각 그 유형 최소 5경기부터 순위. 레이팅은 두 유형 합산. 시즌은 상·하반기. 홈 Top 3·순위는 공식전 기준
- 경기 유형: 코인전(승패·레이팅·코인) / 공식전(승패·레이팅) / 친선전(출석만)
- 코인: 가입 3, 도착 체크 시 +1, 코인전 승 +1/패 −1, 베이글 ±2. 마이너스 허용. 1개 미만이면 코인전 → 공식전 자동 전환
- 대출: 잔액 ≤0 + 남은 대출 없음 → 3코인(설정 가능). 상환 전 출석 코인은 상환에 사용, 보유 코인 상환, 관리자 탕감. 실제 돈 연동 없음
- 게스트: 대진 참여 가능, 게스트 낀 경기는 코인전 불가 + 승패·레이팅·순위 제외
- 노쇼 벌칙 없음
- 회원 등록은 관리자만 (자가 가입 없음). 관리자 1명, 로그인은 이름 + PIN 4자리
- 권한: 회원은 일정 등록·참가·출석·자기 경기 점수 입력(기존 기록도 참가자면 수정 가능), 관리자는 전부. NTRP 수정은 관리자만 (바꾸면 지난 경기까지 레이팅 재계산)
- 성별(M/F) 있음, 혼복 대진(팀당 남1·여1) 지원
- 코인·레이팅·순위는 저장하지 않고 경기 기록에서 매번 재계산 (`js/rules.js`)

## 아바타 · 볼 (v1.7.0~)
- 볼 = 꾸미기 전용 화폐 (코인전 코인과 별개). `RULES.balls` + `computeBalls` (rules.js): 도착·경기·승리·주간 미션 적립 − purchases. 저장하지 않고 재계산
- 그림: `js/pixel.js` (v1.7.3~ 배경 80×80, 아바타 34×66). 몸은 사용자가 준 레퍼런스(남·녀 캐릭터, 약 31×63칸)를 원본 해상도 그대로 옮긴 역할 문자 템플릿 `js/avatar-tpl.js` → 역할별로 피부·머리·옷 색을 칠함. 상의·하의·신발 아이템 = 색(color)만, 모자·얼굴·손 = paint(g, ANCHOR[성별]). 스타일 기준은 이 레퍼런스 (검은 테두리 대신 같은 색의 진한 톤, 작은 눈·볼터치). 기본 아이템은 `js/avatar-items.js`(id `b_…`, 바꾸지 말 것)
- 관리자 아이템 = `items` 문서에 작은 PNG data URL(`img`, 200KB 제한). 변환은 `js/pixelate.js` (기기 안에서 처리)
- 컬렉션: `items`, `purchases`(id `회원_아이템`), `avatars`(id = 회원 id). firestore.rules에 추가됨 → Firebase 콘솔 규칙도 같이 바꿔야 저장됨
- 화면: `#/avatar[/closet|shop|missions]`, `#/avatars`(구경), `#/admin/items`

## 날씨
- `js/weather.js`: Open-Meteo(무료·키 없음), 위치 고양시 일산(37.66, 126.77) — 좌표는 `WEATHER_PLACE`에서 변경. 일정 시간대 기온 범위 + 최대 강수확률. 1시간 캐시(localStorage). 실패해도 앱은 정상 동작.

## 앱 설치 · 서비스 워커 (v1.5.0~)
- `sw.js`는 `js/install.js`가 `sw.js?v=APP_VERSION`으로 등록 → 버전을 올리면 새 서비스 워커·캐시로 교체됨. 같은 사이트 파일은 항상 서버 먼저(no-cache), 오프라인일 때만 캐시. Firebase·날씨 등 외부 요청은 건드리지 않음
- 아이콘: `assets/icon-192/512/180.png`, `icon-maskable-512.png` (badge.png + 크림 배경)
- 미리보기 브라우저 창은 서비스 워커를 막아 로컬 테스트 불가 → 배포 후 실제 사이트에서 확인

## 정원 · 대기 · 공유
- 일정 `capacity`(0=무제한). 신청 순서(createdAt)로 정원까지 확정, 나머지 대기 (`rosterOf` in store.js). 신청 마감 없음
- 공유 텍스트는 `js/share.js` (navigator.share → 클립보드 → 복사용 창)

## 나중에 할 것
- 카카오 로그인 연동 (보류 중). 간단 버전 = 카카오 계정을 기존 회원에 연결(GitHub Pages 그대로), 보안 강화 버전 = Firebase Blaze + Cloud Functions 커스텀 토큰

## 디자인
- Offcourt 브랜드: 블루 #1D5294, 크림 #F7F1D6, 클레이 #B8835A, 포인트(레드) #E94C2B (`--point`), 홈 일정 카드 배경 #E7E3D9 (`--slide-bg`, 테두리 없음), 그레이. 홈 로고 = `assets/wordmark.png`, 앱 아이콘 = OC 심볼(`assets/icon-*.png`). 숫자·워드마크는 세리프(Newsreader), 본문 Pretendard
- 원칙: 한 화면에 한 정보, 큰 숫자, 높은 대비, 모바일 우선
