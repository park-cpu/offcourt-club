# Offcourt 영상 분석기 (Mac 시험판 0.1)

경기 영상 → 공 궤적 · 타구 · 바운드 → 앱에 넣는 결과 JSON (`FORMAT.md`).
지금은 Mac에서 직접 돌리고, 결과 파일을 앱의 **영상 분석 → 결과 파일 넣기**로 올립니다. 나중에 같은 코드를 서버로 옮길 예정.

## 처음 한 번 (설치)

```bash
cd analyzer
python3 -m venv .venv
.venv/bin/pip install opencv-python-headless numpy ultralytics
```
YOLO 모델(`models/yolo11s.pt`)은 처음 실행할 때 Ultralytics 공식 저장소에서 자동으로 받습니다.

## 분석 순서

1. **영상 받기** (유튜브면): `yt-dlp -f 137 -o match.mp4 <링크>` (1080p, 소리 없음)
2. **코트 맞추기**: 영상 한 장면에서 네 점의 대략 위치(픽셀)를 넣으면 흰 선에 맞춰 자동 보정
   ```bash
   .venv/bin/python court.py match.mp4 60 out/calib.json '{"near_service_left":[455,720],"near_service_right":[1478,706],"far_base_left":[725,495],"far_base_right":[1270,481]}'
   ```
   → `out/calib.jpg`에서 빨간 선이 코트 선과 겹치는지 확인
3. **사람 · 공 찾기** (가장 오래 걸림, 1080p 기준 영상 길이의 약 2/3):
   ```bash
   .venv/bin/python detect.py match.mp4 --name match --rough '<2번에서 나온 네 점>'
   .venv/bin/python motion.py match.mp4 --name match
   .venv/bin/python pose.py match.mp4 --name match        # 관절(자세), 약 10분
   ```
   소리(타구음): 유튜브면 `yt-dlp -f 140 -o audio.m4a <링크>` → `ffmpeg -i audio.m4a -ac 1 -ar 22050 audio.wav` →
   ```bash
   .venv/bin/python audio.py audio.wav --name match           # 1초
   ```
   pose · audio 결과가 있으면 4번이 자동으로 0.2 방식(소리 + 스윙 + 공)을 씀
4. **타구 · 바운드 · 샷 만들기** (몇 초):
   ```bash
   .venv/bin/python events.py --name match --youtube <유튜브 영상 id>
   ```
   → `out/match.result.json`을 앱에 넣기
5. 점검: `debug.py --name match --t0 30 --t1 60` (시간축 그림), `--frames 40.5,41.0 --video match.mp4` (장면에 표시)

## 지금 수준 (0.2) — 자세한 숫자는 ACCURACY.md

- 0.2: 공만 보던 방식 → 타구음 + 손목 스윙 + 공을 함께 봄. 서브 전 공 튀기기 · 공 주고받기를 덜 세고, 먼 쪽 타구를 더 잡음
- 타점 높이 · 공과의 거리 · 이동 속도 → 앱이 실수 원인 · 피드백 문장을 만듦

## 0.1 때 기록

- 코트 선 맞추기: 정확 (평균 1px). 15초마다 다시 맞춰 카메라가 밀려도 따라감
- 선수 찾기: 잘 됨. 옷 색으로 4명 구분
- 공: 가까운 쪽은 잘 보이지만 **먼 쪽 공은 4px 정도라 자주 놓침** → 먼 쪽 타구 · 바운드가 많이 빠짐
- 샷 종류(포 · 백 · 발리 · 서브)는 오른손잡이 가정의 단순 규칙

## 정확도를 올리려면

1. **촬영**: 더 높은 곳(2.5m 이상) · 코트 가운데 뒤 · 60fps → 먼 쪽 공이 커지고 덜 흐려짐 (가장 효과 큼)
2. **공 전용 모델**: 우리 영상으로 공 위치를 표시한 학습 데이터(수백~천 장면)를 만들어 YOLO를 다시 학습
3. 테니스 공 추적 전용 공개 모델(TrackNet 등) 사용 검토
