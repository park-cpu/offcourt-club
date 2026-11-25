"""점검용 그림: 공의 화면 세로 위치를 시간축으로 그리고 타구(빨강) · 바운드(파랑)를 표시
python debug.py --name dev --t0 0 --t1 40  → out/dev.timeline.png
python debug.py --name dev --frames 12.5,13.0 --video 영상.mp4 → 해당 시각 장면에 공 · 선수 표시
"""
import argparse

import cv2
import numpy as np

import events


def timeline(name, calib, t0, t1, out):
    res, d = events.build(name, calib)
    fps, f0, pos = d['fps'], d['f0'], d['pos']
    i0, i1 = int(t0 * fps), min(len(pos), int(t1 * fps))
    W, H = (i1 - i0) * 3, 560
    img = np.full((H, W + 60, 3), 255, np.uint8)
    for gy in range(0, 1081, 120):
        y = int(gy / 1080 * 500) + 30
        cv2.line(img, (60, y), (W + 60, y), (230, 230, 230), 1)
        cv2.putText(img, str(gy), (5, y + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (120, 120, 120), 1)
    for s in range(int(t0), int(t1) + 1):
        x = 60 + int((s * fps - i0) * 3)
        cv2.line(img, (x, 20), (x, H - 20), (200, 200, 200) if s % 5 else (150, 150, 150), 1)
        if s % 5 == 0:
            cv2.putText(img, f'{s}s', (x + 2, H - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1)
    # 선수 근처 여부: 공 근처에 선수가 있으면 회색 점
    for i in range(i0, i1):
        p = pos[i]
        if p is None:
            continue
        x = 60 + (i - i0) * 3
        y = int(p[1] / 1080 * 500) + 30
        near = events.near_player(d['players'][i], p[0], p[1]) is not None
        cv2.circle(img, (x, y), 2, (160, 160, 160) if near else (0, 0, 0), -1)
    for hh in d['hits']:
        if i0 <= hh['i'] < i1:
            x = 60 + (hh['i'] - i0) * 3
            cv2.line(img, (x, 20), (x, H - 20), (0, 0, 255), 1)
            cv2.putText(img, d['ids'].get(hh['pl'].get('id')) or '?', (x + 2, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)
    for b in d['bounces']:
        if i0 <= b['i'] < i1:
            x = 60 + (b['i'] - i0) * 3
            y = int(b['y'] / 1080 * 500) + 30
            cv2.circle(img, (x, y), 6, (255, 0, 0), 2)
    cv2.imwrite(out, img)
    print('saved', out)


def frames(name, calib, video, ts, out):
    res, d = events.build(name, calib)
    cap = cv2.VideoCapture(video)
    tiles = []
    for t in ts:
        i = int(t * d['fps'])
        cap.set(cv2.CAP_PROP_POS_FRAMES, d['f0'] + i)
        ok, fr = cap.read()
        for p in d['players'][i]:
            x1, y1, x2, y2 = map(int, p['box'])
            cv2.rectangle(fr, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(fr, f"{d['ids'].get(p.get('id'))} ({p['court'][0]:.1f},{p['court'][1]:.1f})", (x1, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        for k in range(max(0, i - 20), i + 1):
            if d['pos'][k]:
                cv2.circle(fr, tuple(map(int, d['pos'][k])), 4 if k < i else 9, (0, 0, 255), 2 if k == i else -1)
        cv2.putText(fr, f'{t:.2f}s', (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 3)
        tiles.append(cv2.resize(fr, (960, 540)))
    while len(tiles) % 2:
        tiles.append(np.zeros_like(tiles[0]))
    rows = [np.hstack(tiles[k: k + 2]) for k in range(0, len(tiles), 2)]
    cv2.imwrite(out, np.vstack(rows))
    print('saved', out)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--name', default='dev')
    ap.add_argument('--calib', default='out/calib.json')
    ap.add_argument('--t0', type=float, default=0)
    ap.add_argument('--t1', type=float, default=40)
    ap.add_argument('--frames', default=None)
    ap.add_argument('--video', default=None)
    a = ap.parse_args()
    if a.frames:
        frames(a.name, a.calib, a.video, [float(x) for x in a.frames.split(',')], f'out/{a.name}.frames.png')
    else:
        timeline(a.name, a.calib, a.t0, a.t1, f'out/{a.name}.timeline.png')
