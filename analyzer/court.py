"""코트 맞추기: 영상 속 흰 선에 코트 도면을 겹쳐 화면 좌표 ↔ 코트 좌표(미터) 변환(호모그래피)을 구함.

대략적인 네 점(사람이 한 번 찍어 줌)에서 시작해, 도면 선이 흰 선 위에 정확히 오도록 네 점을 조금씩 옮겨 맞춤.
코트 좌표: 원점 = 네트 중앙, x 오른쪽 +, y 카메라에서 먼 쪽 + (analyzer/FORMAT.md)
"""
import json
import cv2
import numpy as np

HW, SW, HL, SV = 5.485, 4.115, 11.885, 6.40

# 도면의 선 (양 끝점, 미터)
LINES = [
    ((-HW, -HL), (HW, -HL)), ((-HW, HL), (HW, HL)),  # 베이스라인
    ((-HW, -HL), (-HW, HL)), ((HW, -HL), (HW, HL)),  # 복식 사이드라인
    ((-SW, -HL), (-SW, HL)), ((SW, -HL), (SW, HL)),  # 단식 사이드라인
    ((-SW, -SV), (SW, -SV)), ((-SW, SV), (SW, SV)),  # 서비스 라인
    ((0, -SV), (0, SV)),  # 센터 서비스 라인
]

# 처음 네 점에 쓰는 코트 위치
ANCHORS = {
    'near_service_left': (-SW, -SV),
    'near_service_right': (SW, -SV),
    'far_base_left': (-HW, HL),
    'far_base_right': (HW, HL),
}


def white_mask(frame):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, (0, 0, 175), (180, 60, 255))
    # 선은 가늘다: 큰 흰 덩어리(벽 · 옷)는 탑햇으로 줄임
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    top = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15)))
    return cv2.bitwise_and(m, cv2.inRange(top, 25, 255))


def samples(n=60):
    pts = []
    for (a, b) in LINES:
        for t in np.linspace(0, 1, n):
            pts.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return np.array(pts, np.float32)


def homography(img_pts):
    src = np.array([ANCHORS[k] for k in ANCHORS], np.float32)
    dst = np.array([img_pts[k] for k in ANCHORS], np.float32)
    return cv2.getPerspectiveTransform(src, dst)  # 코트 → 화면


def fit(frame, rough, iters=6):
    """rough: {anchor: [x, y]} 대략 위치 → (정밀 위치, 코트→화면 H, 맞춤 점수)"""
    h, w = frame.shape[:2]
    mask = white_mask(frame)
    dist = cv2.distanceTransform(255 - mask, cv2.DIST_L2, 3)
    dist = np.minimum(dist, 25)
    S = samples()

    def cost(p):
        H = homography(p)
        q = cv2.perspectiveTransform(S[None], H)[0]
        ok = (q[:, 0] >= 0) & (q[:, 0] < w - 1) & (q[:, 1] >= 0) & (q[:, 1] < h - 1)
        if ok.sum() < len(S) * 0.3:
            return 1e9
        qi = q[ok].astype(int)
        return float(dist[qi[:, 1], qi[:, 0]].mean())

    p = {k: np.array(v, np.float32) for k, v in rough.items()}
    best = cost(p)
    for step in [16, 8, 4, 2, 1, 0.5]:
        for _ in range(iters):
            improved = False
            for k in p:
                for d in [(step, 0), (-step, 0), (0, step), (0, -step)]:
                    q = dict(p)
                    q[k] = p[k] + np.array(d, np.float32)
                    c = cost(q)
                    if c < best:
                        best, p, improved = c, q, True
            if not improved:
                break
    return {k: v.tolist() for k, v in p.items()}, homography(p), best


def draw(frame, H, color=(0, 0, 255)):
    out = frame.copy()
    for (a, b) in LINES:
        q = cv2.perspectiveTransform(np.array([[a, b]], np.float32), H)[0]
        cv2.line(out, tuple(map(int, q[0])), tuple(map(int, q[1])), color, 2)
    return out


def save(path, pts, H, score):
    json.dump({'anchors': pts, 'court_to_img': np.asarray(H).tolist(), 'score': score}, open(path, 'w'), indent=1)


def load(path):
    d = json.load(open(path))
    H = np.array(d['court_to_img'], np.float64)
    return H, np.linalg.inv(H)


if __name__ == '__main__':
    import sys

    video, t, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
    rough = json.loads(sys.argv[4])
    cap = cv2.VideoCapture(video)
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, frame = cap.read()
    pts, H, score = fit(frame, rough)
    print('score(px)', round(score, 2), pts)
    save(out, pts, H, score)
    cv2.imwrite(out.replace('.json', '.jpg'), draw(frame, H))
