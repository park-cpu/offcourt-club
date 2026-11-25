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
- 레이팅: NTRP 시작값(3.0=1000, 0.5당 100) + Elo, 복식은 팀 평균, 점수차 배수(6:0 ×1.5 … 7:6 ×1.0), 처음 8경기(`RULES.provisionalGames`, v1.13.1~ 예전 10) K=40(v1.11.1~, 예전 32) 이후 20
- 시즌 순위는 공식전·코인전 따로 (v1.6.0~). 공식전 포인트 = 공식전 레이팅 변동 합 + 경기당 1점. 코인전 포인트 = 코인전 레이팅 변동 합 + 경기당 1점 + 코인전 순수익 × 10 (`RULES.coinPoint`, 출석·지급·대출 코인 제외). 시즌 포인트의 레이팅 변동은 고정 K=20(`RULES.kSeason`, v1.6.2~)으로 따로 계산해 신입 부풀림 방지. 각각 그 유형 최소 5경기부터 순위. 적응 기간(v1.11.0~): 회원마다 처음 8경기(`RULES.provisionalGames`, 레이팅 반영 경기 기준, v1.13.1~ 예전 10)는 시즌 포인트·경기 수에서 제외 (`spDeltas` 값 null → `computeStats`가 range 있을 때 `adapt`로 셈). 관리자 홈 'NTRP 확인 필요' = 8경기 이상 + 추정 NTRP 차이 ≥0.5 (`ntrpChecks` in admin.js). 레이팅은 두 유형 합산. 시즌은 상·하반기. 홈 Top 3·순위는 공식전 기준. 반올림한 점수가 같으면 같은 등수(`withPlaces` in rank.js, `r.place`, v1.11.2~). 레이팅 탭 등수는 8경기 이상 + 최근 30일(`RULES.ratingActiveDays`, v1.11.4~ 30) 안에 경기한 회원만, 나머지는 '적응 중' · '쉬는 중' (v1.11.3~). 단식 순위(v1.10.0~, `computeStats` type `'singles'`) = 1:1 공식전·코인전 합산, 포인트 = 레이팅 변동 + 경기당 1점
- 경기 유형: 코인전(승패·레이팅·코인) / 공식전(승패·레이팅) / 친선전(출석만)
- 코인: 가입 3, 도착 체크 시 +1, 코인전 승 +1/패 −1, 베이글 ±2. 마이너스 허용. 1개 미만이면 코인전 → 공식전 자동 전환
- 대출: 잔액 ≤0 + 남은 대출 없음 → 3코인(설정 가능). 상환 전 출석 코인은 상환에 사용, 보유 코인 상환, 관리자 탕감. 실제 돈 연동 없음
- 게스트: 대진 참여 가능, 게스트 낀 경기는 코인전 불가 + 승패·레이팅·순위 제외
- 노쇼 벌칙 없음
- 회원 등록은 관리자만 (자가 가입 없음). 관리자 1명, 로그인은 이름 + PIN 4자리
- 권한: 회원은 일정 등록·참가·출석·자기 경기 점수 입력·수정 — 단 일정 종료 후 30분(`RULES.recordGraceMin`)까지만 (`canRecord`/`recordOpen`, v1.13.0~), 관리자는 전부. 일정 종료 시간이 지나면(`scheduleEnded`) 회원은 새 대진·대진 취소 불가, 경기 화면은 결과 탭부터. NTRP 수정은 관리자만 (바꾸면 지난 경기까지 레이팅 재계산)
- 성별(M/F) 있음, 혼복 대진(팀당 남1·여1) 지원
- 코인·레이팅·순위는 저장하지 않고 경기 기록에서 매번 재계산 (`js/rules.js`)

## 아바타 · 볼 (v1.7.0~)
- 볼 = 꾸미기 전용 화폐 (코인전 코인과 별개). 모든 회원 기본 300개(`RULES.balls.start`), 관리자 지급 · 회수는 `ballLogs` 컬렉션(v1.8.0~). `RULES.balls` + `computeBalls` (rules.js): 도착·경기·승리·주간 미션 적립 − purchases. 저장하지 않고 재계산. 볼·미션 규칙은 관리자가 `#/admin/balls`에서 변경 → `settings.ballRules` 버전 목록(from 날짜). 날짜별 적립은 `ballRulesAt(date)`, 주간 미션은 그 주 일요일 기준 `weekRules(월요일)` → 바꾼 주부터 적용, 지난 기록은 그대로
- 그림: `js/pixel.js` (v1.7.3~ 배경 80×80, 아바타 34×66). 몸은 사용자가 준 레퍼런스(남·녀 캐릭터, 약 31×63칸)를 원본 해상도 그대로 옮긴 역할 문자 템플릿 `js/avatar-tpl.js` → 역할별로 피부·머리·옷 색을 칠함. 상의·하의·신발 아이템 = 색(color)만, 모자·얼굴·손 = paint(g, ANCHOR[성별]). 스타일 기준은 이 레퍼런스 (검은 테두리 대신 같은 색의 진한 톤, 작은 눈·볼터치). 기본 아이템은 `js/avatar-items.js`(id `b_…`, 바꾸지 말 것). 테니스 의류(v1.7.7~)는 `js/avatar-tennis.js` (id `b_t_…`): 역할 격자에 무늬(pattern)를 칠하고 강조색은 `acc`(상의 a·b, 하의 v, 신발 w·밑창 e, 양말 y·Y·z 고정). 상의·하의·신발 순서로 pattern 적용, 반바지·스커트·민소매는 맨살 역할(S·s·L)로 바꿈. 예전 단색 옷·모자는 `active:false`. 신발은 `SHOE_SHAPES`(모양 5가지, 왼발 16칸 글자 → 오른발 뒤집기, v1.7.8~). 라켓(v1.7.9~)은 `racket` 칸, `js/avatar-rackets.js`의 `racketPaint` (45도, s·t 회전 좌표로 그림, 줄 사이 '#rrggbbaa' 반투명 → `Grid.toCanvas`가 알파 지원). 아바타 폭 `AVATAR_W` 50. 테니스 모자는 `js/avatar-tennis.js`의 `capT·visorT·bandT·bucketT`(실제 색으로 그림). 기본 옷(아무것도 안 입었을 때)은 숨은 아이템 `b_d_tee · b_d_shorts · b_d_shoes` (`pixel.js`의 `BASE_WEAR`, `hidden:true`). 헤어스타일은 `js/avatar-hair.js`(top = 템플릿 위쪽 줄 교체, back = 몸 뒤에 먼저 그림), 목록은 `HAIRS_BY_SEX`
- 관리자 아이템 = `items` 문서에 작은 PNG data URL(`img`, 200KB 제한). 변환은 `js/pixelate.js` (기기 안에서 처리). 기본 아이템 수정(v1.7.4~) = 같은 id(`b_…`)의 `items` 문서에 name·price·active만 저장 → `itemsMap`이 덮어씀, 관리자 목록은 `customItems()`
- 컬렉션: `items`, `purchases`(id `회원_아이템`), `avatars`(id = 회원 id), `ballLogs`. firestore.rules에 추가됨 → Firebase 콘솔 규칙도 같이 바꿔야 저장됨
- 화면: `#/avatar[/closet|shop|missions]`, `#/avatars`(구경), `#/admin/items`

## 날씨
- `js/weather.js`: Open-Meteo(무료·키 없음), 위치 고양시 일산(37.66, 126.77) — 좌표는 `WEATHER_PLACE`에서 변경. 일정 시간대 기온 범위 + 최대 강수확률. 1시간 캐시(localStorage). 실패해도 앱은 정상 동작.

## 앱 설치 · 서비스 워커 (v1.5.0~)
- `sw.js`는 `js/install.js`가 `sw.js?v=APP_VERSION`으로 등록 → 버전을 올리면 새 서비스 워커·캐시로 교체됨. 같은 사이트 파일은 항상 서버 먼저(no-cache), 오프라인일 때만 캐시. Firebase·날씨 등 외부 요청은 건드리지 않음
- 아이콘: `assets/icon-192/512/180.png`, `icon-maskable-512.png` (badge.png + 크림 배경)
- 미리보기 브라우저 창은 서비스 워커를 막아 로컬 테스트 불가 → 배포 후 실제 사이트에서 확인

## 공개 범위 · 일정 (v1.8.0~)
- 로그인 안 한 방문자는 홈 · 주간 일정 · 일정 상세만 (`app.js`의 PUBLIC, 나머지는 `membersOnly`). 일정 수정 · 삭제는 등록자 + 관리자 (`canEditSchedule`)
- 경기장 목록 `settings.venues` = [{id, name, address, mapUrl}] (v1.8.1~, `venueList()` in schedule.js — 비어 있으면 지난 일정 경기장명으로 임시 목록). 관리자 `#/admin/venues`, 일정 등록 때 '새 경기장 직접 입력' → 목록 저장 선택. 일정 문서에 venue · address · mapUrl 복사 저장
- 지도 = `mapUrl`(선택) → 없으면 `https://map.naver.com/p/search/주소(없으면 경기장명)`

## 정원 · 대기 · 공유
- 일정 `capacity`(0=무제한). 신청 순서(createdAt)로 정원까지 확정, 나머지 대기 (`rosterOf` in store.js). 신청 마감 없음
- 공유 텍스트는 `js/share.js` (navigator.share → 클립보드 → 복사용 창)

## 랠리 게임 (v1.9.0~)
- `js/views/rally.js` 하나에 전부 (캔버스 256×240, 원근 `proj`, 5×7 글꼴 `FONT`, 공 궤적은 해석식 `ballAt` → 타이밍 판정 정확). 난이도 `DIFFS`, 샷 품질 `QUAL`. 상대 샷 종류 `SPINS`(v1.12.0~, 공마다 rest·damp) — 어려움·프로만 `vary` 확률로 리듬 변화 + `jitter`. 파워 라인(v1.12.1~): 목표 `POWER_LINE` 0.65 고정(v1.12.2~), 퍼펙트는 타이밍 퍼펙트 + |힘−pt| ≤ `DIFFS.band`. 화면이 다시 그려져도 게임이 안 끊기게 `game.root`를 재사용. 기록은 localStorage `oc_rally_v1` (Firestore 아님). `_rally` export는 테스트용
- 조작(v1.9.4~): 왼쪽 조이스틱(`game.stick`) + 오른쪽 SWING. 쉬움은 자동 이동(`DIFFS.auto`), 나머지는 조이스틱으로 직접 이동(`RUN`) + 칠 때 민 쪽이 방향, 타점 거리 `REACH`
- 클럽 랭킹(v1.9.1~): `rallyScores` 컬렉션, id `회원_난이도`, 항목별 최고값만 저장 (`submitClub`). 로그인 회원만 올라감. 점수 단위 v1.12.2~ 1/10 (`SCORE_V`=2): 예전 문서(sv 없음)는 `clubRows()`가 /10 해서 보여주고 다음 제출 때 sv:2로 저장, 이 기기 기록은 `loadRec`이 한 번 변환
- 그래픽은 레퍼런스 분위기(NES 테니스)만 참고한 자체 그림 — 특정 게임 로고 · 캐릭터는 쓰지 않음

## 나중에 할 것
- 카카오 로그인 연동 (보류 중). 간단 버전 = 카카오 계정을 기존 회원에 연결(GitHub Pages 그대로), 보안 강화 버전 = Firebase Blaze + Cloud Functions 커스텀 토큰

## 기타 화면 (v1.13.0~)
- 당겨서 새로고침: app.js 안 IIFE (`.ptr`), 랠리 · 캔버스 · 시트 위에서는 꺼짐. CSS `overscroll-behavior-y: contain`으로 브라우저 기본 새로고침은 막음
- 회원 페이지 최근 경기 = `recentList` (rank.js) 한 줄 요약, 5개 + 더 보기 10개씩

## 디자인
- Offcourt 브랜드: 블루 #1D5294, 크림 #F7F1D6, 클레이 #B8835A, 포인트(레드) #E94C2B (`--point`), 홈 일정 카드 배경 #E7E3D9 (`--slide-bg`, 테두리 없음), 그레이. 홈 로고 = `assets/wordmark.png`, 앱 아이콘 = OC 심볼(`assets/icon-*.png`). 숫자·워드마크는 세리프(Newsreader), 본문 Pretendard
- 확대 · 글자 선택 금지(v1.9.6~): index.html viewport `user-scalable=no`, style.css 전체 `user-select:none`(입력칸 제외), app.js에서 iOS gesture · 두 손가락 touchmove 막음
- 원칙: 한 화면에 한 정보, 큰 숫자, 높은 대비, 모바일 우선
