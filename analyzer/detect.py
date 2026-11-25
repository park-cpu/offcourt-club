"""1단계: 영상의 모든 프레임에서 사람 · 공 후보를 찾아 파일로 저장 (가장 오래 걸리는 부분, 한 번만 돌림)

출력 out/<이름>.dets.jsonl — 한 줄 = 한 프레임
  {"f": 프레임, "p": [[x1,y1,x2,y2,conf,hist...]], "b": [[x,y,w,h,conf]]}
+ out/<이름>.court.json — 15초마다 다시 맞춘 코트 변환
"""
import argparse
import json
import time

import cv2
import numpy as np
from ultralytics import YOLO

import court


def torso_hist(frame, box):
    """옷 색으로 선수를 구분하려고 상체 색 분포(HSV 8×4)를 저장"""
    x1, y1, x2, y2 = map(int, box)
    h = y2 - y1
    w = x2 - x1
    crop = frame[max(0, y1 + int(h * 0.2)): max(1, y1 + int(h * 0.5)), max(0, x1 + int(w * 0.2)): max(1, x2 - int(w * 0.2))]
    if crop.size == 0:
        return [0.0] * 32
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [8, 4], [0, 180, 0, 256]).flatten()
    hist /= hist.sum() + 1e-6
    return [round(float(v), 3) for v in hist]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('--name', default='match')
    ap.add_argument('--start', type=float, default=0)
    ap.add_argument('--end', type=float, default=None)
    ap.add_argument('--rough', required=True, help='코트 네 점 대략 위치 JSON (court.ANCHORS)')
    ap.add_argument('--model', default='models/yolo11s.pt')
    a = ap.parse_args()

    model = YOLO(a.model)
    cap = cv2.VideoCapture(a.video)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    f0 = int(a.start * fps)
    f1 = min(total, int(a.end * fps)) if a.end else total
    cap.set(cv2.CAP_PROP_POS_FRAMES, f0)

    rough = json.loads(a.rough)
    courts = []
    out = open(f'out/{a.name}.dets.jsonl', 'w')
    t0 = time.time()
    for f in range(f0, f1):
        ok, frame = cap.read()
        if not ok:
            break
        if (f - f0) % int(fps * 15) == 0:
            pts, H, score = court.fit(frame, rough)
            if score < 3:  # 잘 맞았을 때만 다음 기준으로 사용
                rough = pts
            courts.append({'f': f, 'H': np.asarray(H).tolist(), 'score': round(score, 2)})
        r = model.predict(frame, imgsz=1920, classes=[0, 32], conf=0.08, device='mps', verbose=False)[0]
        persons, balls = [], []
        for (x1, y1, x2, y2), c, k in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist()):
            if k == 0 and c >= 0.35:
                persons.append([round(x1), round(y1), round(x2), round(y2), round(c, 2)] + torso_hist(frame, (x1, y1, x2, y2)))
            elif k == 32:
                balls.append([round((x1 + x2) / 2, 1), round((y1 + y2) / 2, 1), round(x2 - x1, 1), round(y2 - y1, 1), round(c, 2)])
        out.write(json.dumps({'f': f, 'p': persons, 'b': balls}) + '\n')
        if (f - f0) % 300 == 0:
            done = f - f0 + 1
            el = time.time() - t0
            print(f'{done}/{f1 - f0} 프레임 · {done / el:.1f} fps · 남은 시간 약 {(f1 - f - 1) / max(done / el, 0.1) / 60:.1f}분', flush=True)
    json.dump({'fps': fps, 'width': int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), 'height': int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)), 'f0': f0, 'f1': f1, 'courts': courts}, open(f'out/{a.name}.court.json', 'w'))
    print('끝', round((time.time() - t0) / 60, 1), '분')


if __name__ == '__main__':
    main()
