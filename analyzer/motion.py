"""움직이는 작은 노란 물체(공) 후보: 앞 · 뒤 프레임과의 차이 + 노란색"""
import cv2
import numpy as np


def candidates(prev, cur, nxt, ymin=150):
    g = [cv2.cvtColor(x, cv2.COLOR_BGR2GRAY) for x in (prev, cur, nxt)]
    d1 = cv2.absdiff(g[1], g[0])
    d2 = cv2.absdiff(g[2], g[1])
    mov = cv2.bitwise_and(cv2.threshold(d1, 12, 255, cv2.THRESH_BINARY)[1], cv2.threshold(d2, 12, 255, cv2.THRESH_BINARY)[1])
    hsv = cv2.cvtColor(cur, cv2.COLOR_BGR2HSV)
    yel = cv2.inRange(hsv, (22, 60, 110), (48, 255, 255))
    m = cv2.bitwise_and(mov, cv2.dilate(yel, np.ones((3, 3), np.uint8)))
    m = cv2.dilate(m, np.ones((3, 3), np.uint8))
    m[:ymin] = 0
    n, lab, st, cen = cv2.connectedComponentsWithStats(m)
    out = []
    for k in range(1, n):
        x, y, w, h, a = st[k]
        if 4 <= a <= 700 and max(w, h) <= 45:
            out.append((float(cen[k][0]), float(cen[k][1]), round(min(1.0, a / 60), 2)))
    return out


if __name__ == '__main__':
    import argparse, json, time
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('--name', default='match')
    ap.add_argument('--end', type=float, default=None)
    a = ap.parse_args()
    cap = cv2.VideoCapture(a.video)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    end = min(total, int(a.end * fps)) if a.end else total
    out = open(f'out/{a.name}.motion.jsonl', 'w')
    buf = [cap.read()[1], cap.read()[1]]
    out.write(json.dumps({'f': 0, 'b': []}) + '\n')
    t0 = time.time()
    for f in range(1, end - 1):
        ok, nxt = cap.read()
        if not ok:
            break
        c = candidates(buf[0], buf[1], nxt)
        out.write(json.dumps({'f': f, 'b': [[round(x, 1), round(y, 1), cf] for x, y, cf in c]}) + '\n')
        buf = [buf[1], nxt]
        if f % 3000 == 0:
            print(f, '/', end, round(f / (time.time() - t0), 1), 'fps', flush=True)
