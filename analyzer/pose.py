"""1-3단계: 사람 자세(관절 17개) 찾기 → 공이 안 보여도 스윙 · 서브를 찾고, 타점 높이를 잼

출력 out/<이름>.pose.jsonl — 한 줄 = 한 프레임 (2프레임마다)
  {"f": 프레임, "p": [[x1,y1,x2,y2, kx,ky,kc × 17]]}
관절 순서(COCO): 0 코 1·2 눈 3·4 귀 5·6 어깨 7·8 팔꿈치 9·10 손목 11·12 엉덩이 13·14 무릎 15·16 발목 (홀수 = 왼쪽)
모델 models/yolo11s-pose.pt 는 처음 실행할 때 Ultralytics 공식 저장소에서 자동으로 받음
"""
import argparse
import json
import time

import cv2
from ultralytics import YOLO


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('--name', default='match')
    ap.add_argument('--start', type=float, default=0)
    ap.add_argument('--end', type=float, default=None)
    ap.add_argument('--step', type=int, default=2, help='몇 프레임마다 (2 = 30fps 영상에서 1초 15번)')
    ap.add_argument('--model', default='models/yolo11s-pose.pt')
    a = ap.parse_args()

    model = YOLO(a.model)
    cap = cv2.VideoCapture(a.video)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    f0 = int(a.start * fps)
    f1 = min(total, int(a.end * fps)) if a.end else total
    cap.set(cv2.CAP_PROP_POS_FRAMES, f0)
    out = open(f'out/{a.name}.pose.jsonl', 'w')
    t0 = time.time()
    n = 0
    for f in range(f0, f1):
        if (f - f0) % a.step:
            if not cap.grab():
                break
            continue
        ok, frame = cap.read()
        if not ok:
            break
        r = model.predict(frame, imgsz=1920, conf=0.3, device='mps', verbose=False)[0]
        ps = []
        if r.keypoints is not None:
            for box, kp in zip(r.boxes.xyxy.tolist(), r.keypoints.data.tolist()):
                row = [round(v) for v in box]
                for x, y, c in kp:
                    row += [round(x, 1), round(y, 1), round(c, 2)]
                ps.append(row)
        out.write(json.dumps({'f': f, 'p': ps}) + '\n')
        n += 1
        if n % 300 == 0:
            el = time.time() - t0
            print(f'{f - f0}/{f1 - f0} 프레임 · {n / el:.1f}장/초 · 남은 시간 약 {(f1 - f) / a.step / (n / el) / 60:.1f}분', flush=True)
    print('끝', round((time.time() - t0) / 60, 1), '분')


if __name__ == '__main__':
    main()
