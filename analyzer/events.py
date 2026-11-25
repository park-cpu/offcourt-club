"""2단계: 저장된 사람 · 공 후보로 공 궤적 → 타구 · 바운드 → 랠리 · 샷 기록(JSON, analyzer/FORMAT.md)

빠름(몇 초). 규칙을 고치면서 여러 번 돌려 보는 부분.
"""
import argparse
import json
import math
from collections import Counter

import cv2
import numpy as np

HW, SW, HL, SV = 5.485, 4.115, 11.885, 6.40


# ── 불러오기 ─────────────────────────────────────────
def load(name, calib_fallback=None):
    frames = [json.loads(l) for l in open(f'out/{name}.dets.jsonl')]
    # 움직임 + 노란색 후보(motion.py)가 있으면 공 후보에 더함 (멀리 있는 작은 공 보강)
    try:
        mo = {}
        for l in open(f'out/{name}.motion.jsonl'):
            d = json.loads(l)
            mo[d['f']] = d['b']
        for fr in frames:
            for x, y, c in mo.get(fr['f'], []):
                if not any(abs(x - b[0]) < 12 and abs(y - b[1]) < 12 for b in fr['b']):
                    fr['b'].append([x, y, 8, 8, round(0.12 + 0.2 * c, 2)])
    except FileNotFoundError:
        pass
    try:
        meta = json.load(open(f'out/{name}.court.json'))
    except FileNotFoundError:  # 검출이 아직 진행 중이면 처음 맞춘 코트로
        c = json.load(open(calib_fallback))
        meta = {'fps': 30.0, 'width': 1920, 'height': 1080, 'courts': [{'f': 0, 'H': c['court_to_img']}]}
    return frames, meta


class Court:
    """프레임별 코트 변환 (15초마다 다시 맞춘 값 중 가장 가까운 것)"""

    def __init__(self, courts):
        self.fs = [c['f'] for c in courts]
        self.H = [np.array(c['H'], np.float64) for c in courts]
        self.Hi = [np.linalg.inv(h) for h in self.H]

    def idx(self, f):
        i = np.searchsorted(self.fs, f, side='right') - 1
        return max(0, i)

    def to_court(self, f, x, y):
        q = cv2.perspectiveTransform(np.array([[[x, y]]], np.float64), self.Hi[self.idx(f)])[0][0]
        return float(q[0]), float(q[1])

    def to_img(self, f, x, y):
        q = cv2.perspectiveTransform(np.array([[[x, y]]], np.float64), self.H[self.idx(f)])[0][0]
        return float(q[0]), float(q[1])


# ── 선수 ─────────────────────────────────────────────
def players_on_court(frames, C):
    """코트 안(여유 2m)에 발이 있는 사람만. 발 = 상자 아래 가운데"""
    out = []
    for fr in frames:
        ps = []
        for p in fr['p']:
            x1, y1, x2, y2, conf = p[:5]
            cx, cy = C.to_court(fr['f'], (x1 + x2) / 2, y2)
            if abs(cx) < HW + 2.2 and abs(cy) < HL + 4:
                ps.append({'box': (x1, y1, x2, y2), 'court': (cx, cy), 'hist': np.array(p[5:], np.float32)})
        out.append(ps)
    return out


def identify(players, k=4):
    """옷 색으로 4명 구분 (k-평균). 각 사람에게 0~3 번호"""
    feats = [p['hist'] for ps in players for p in ps]
    if len(feats) < k:
        return
    X = np.array(feats, np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.01)
    _, labels, centers = cv2.kmeans(X, k, None, crit, 5, cv2.KMEANS_PP_CENTERS)
    i = 0
    for ps in players:
        for p in ps:
            p['id'] = int(labels[i][0])
            i += 1
    # 같은 프레임에 같은 번호가 둘이면 거리로 다시 배정
    for ps in players:
        if len(ps) <= 1:
            continue
        used = set()
        for p in sorted(ps, key=lambda p: float(np.linalg.norm(p['hist'] - centers[p['id']]))):
            if p['id'] in used:
                d = [(float(np.linalg.norm(p['hist'] - centers[j])), j) for j in range(k) if j not in used]
                if d:
                    p['id'] = min(d)[1]
            used.add(p['id'])


# ── 공 궤적 ───────────────────────────────────────────
def in_play_area(C, f, x, y):
    """우리 코트 위 공만: 땅으로 투영했을 때 옆 코트(좌우 4m 밖)면 버림.
    먼 쪽 베이스라인보다 화면 위쪽(공중)은 좌우 폭만 확인"""
    fx_l, fy = C.to_img(f, -HW - 4, HL)
    fx_r, _ = C.to_img(f, HW + 4, HL)
    if y < fy:  # 먼 베이스라인보다 위 = 공중
        return fx_l - 250 < x < fx_r + 250 or y < fy - 150 and 0 < x < 1920
    cx, cy = C.to_court(f, x, y)
    return abs(cx) < HW + 4 and cy > -HL - 6


def ball_track(frames, fps, C=None):
    """공 후보 → 프레임별 공 위치 하나 (없으면 None)

    1) 같은 자리에 오래 있는 후보(바닥에 놓인 공)는 버림
    2) 앞뒤 프레임과 이어지는 후보만 골라 궤적으로 연결
    """
    n = len(frames)
    cands = [[(b[0], b[1], b[4]) for b in fr['b'] if C is None or in_play_area(C, fr['f'], b[0], b[1])] for fr in frames]
    # 1) 정지한 공 지우기: 0.5초 동안 4px 안에 계속 있으면 정지
    W = int(fps * 0.5)
    static = [set() for _ in range(n)]
    for i in range(n):
        for j, (x, y, c) in enumerate(cands[i]):
            hits = 0
            for k in range(max(0, i - W), min(n, i + W)):
                if any(abs(x - x2) < 4 and abs(y - y2) < 4 for x2, y2, _ in cands[k]):
                    hits += 1
            if hits > W * 1.4:
                static[i].add(j)
    cands = [[c for j, c in enumerate(cs) if j not in static[i]] for i, cs in enumerate(cands)]

    # 2) 연결: 이전 위치 · 속도로 다음 위치를 예상하고 가장 가까운 후보 선택
    pos = [None] * n
    last, vel, miss = None, (0.0, 0.0), 99
    for i in range(n):
        best = None
        if last is not None and miss <= 6:
            px, py = last[0] + vel[0] * (miss + 1), last[1] + vel[1] * (miss + 1)
            gate = 70 + 35 * miss
            for x, y, c in cands[i]:
                d = math.hypot(x - px, y - py)
                if d < gate and (best is None or d - c * 30 < best[0]):
                    best = (d - c * 30, x, y)
        if best is None:
            # 새로 시작: 신뢰도가 높거나, 다음 프레임에 이어지는 후보
            for x, y, c in sorted(cands[i], key=lambda t: -t[2]):
                nxt = cands[i + 1] if i + 1 < n else []
                if c >= 0.35 or any(math.hypot(x - x2, y - y2) < 90 for x2, y2, _ in nxt):
                    best = (0, x, y)
                    vel = (0.0, 0.0)
                    break
        if best is not None:
            _, x, y = best
            if last is not None and miss <= 6:
                vel = ((x - last[0]) / (miss + 1) * 0.7 + vel[0] * 0.3, (y - last[1]) / (miss + 1) * 0.7 + vel[1] * 0.3)
            pos[i] = (x, y)
            last, miss = (x, y), 0
        else:
            miss += 1
    # 짧은 구멍(4프레임 이하)은 직선으로 채움
    i = 0
    while i < n:
        if pos[i] is None:
            j = i
            while j < n and pos[j] is None:
                j += 1
            if 0 < i and j < n and j - i <= 4:
                a, b = pos[i - 1], pos[j]
                for k in range(i, j):
                    t = (k - i + 1) / (j - i + 1)
                    pos[k] = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            i = j
        else:
            i += 1
    # 너무 짧은 조각(0.3초 미만)이나 느린 조각(손에 든 공 · 굴러가는 공)은 지움
    i = 0
    while i < n:
        if pos[i] is not None:
            j = i
            while j < n and pos[j] is not None:
                j += 1
            sp = [math.hypot(pos[k + 1][0] - pos[k][0], pos[k + 1][1] - pos[k][1]) for k in range(i, j - 1)]
            if j - i < fps * 0.3 or (sp and float(np.median(sp)) < 3.5):
                for k in range(i, j):
                    pos[k] = None
            i = j
        else:
            i += 1
    return pos


def smooth(vals, k=2):
    out = []
    for i in range(len(vals)):
        w = [v for v in vals[max(0, i - k): i + k + 1] if v is not None]
        out.append(sum(w) / len(w) if w and vals[i] is not None else None)
    return out


# ── 타구 · 바운드 ─────────────────────────────────────
def near_player(ps, x, y, pad=0.7):
    """공이 어떤 선수 몸 근처(상자를 넓힌 범위)에 있으면 그 선수"""
    best = None
    for p in ps:
        x1, y1, x2, y2 = p['box']
        w, h = x2 - x1, y2 - y1
        if x1 - w * pad <= x <= x2 + w * pad and y1 - h * 0.6 <= y <= y2 + h * 0.1:
            d = math.hypot(x - (x1 + x2) / 2, y - (y1 + y2) / 2)
            if best is None or d < best[0]:
                best = (d, p)
    return best[1] if best else None


def find_events(pos, players, C, fps, f0):
    """공의 진행 방향(화면 2D)이 크게 꺾이는 곳 = 타구(선수 손 근처) 또는 바운드(땅)

    · 앞 3프레임 · 뒤 3프레임 평균 방향의 각도 차가 45° 넘거나 속도가 2배 넘게 바뀌면 꺾임
    · 공이 사라졌다 나타날 때 선수 근처에서 방향이 반대면 그것도 타구로 봄
    """
    n = len(pos)
    K = 3

    def vel(a, b):
        pts = [pos[k] for k in range(a, b + 1) if 0 <= k < n and pos[k] is not None]
        if len(pts) < 2:
            return None
        return ((pts[-1][0] - pts[0][0]) / (len(pts) - 1), (pts[-1][1] - pts[0][1]) / (len(pts) - 1))

    raw = []
    for i in range(n):
        if pos[i] is None:
            continue
        v1, v2 = vel(i - K, i), vel(i, i + K)
        if not v1 or not v2:
            continue
        s1, s2 = math.hypot(*v1), math.hypot(*v2)
        if s1 < 1 or s2 < 1:
            continue
        cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (s1 * s2)
        ang = math.degrees(math.acos(max(-1, min(1, cos))))
        ratio = max(s1, s2) / min(s1, s2)
        if ang > 45 or ratio > 2.2:
            raw.append((i, ang + (ratio - 1) * 20, v1, v2))
    # 가까운 후보끼리(0.2초 안) 가장 크게 꺾인 것 하나만
    picked = []
    for r in raw:
        if picked and r[0] - picked[-1][0] < fps * 0.2:
            if r[1] > picked[-1][1]:
                picked[-1] = r
            continue
        picked.append(r)
    # 공이 끊겼다 다시 나타난 곳 (0.7초 이내): 끊기기 전 · 후 방향이 반대(세로)면 그 사이에 타구
    i = 0
    while i < n:
        if pos[i] is None:
            j = i
            while j < n and pos[j] is None:
                j += 1
            if 0 < i and j < n and j - i <= fps * 0.7:
                v1, v2 = vel(i - 1 - K, i - 1), vel(j, j + K)
                if v1 and v2 and v1[1] * v2[1] < 0:
                    picked.append((i - 1 if abs(v1[1]) < abs(v2[1]) else j, 90, v1, v2))
            i = j
        else:
            i += 1
    picked.sort()
    events = []
    for i, score, v1, v2 in picked:
        x, y = pos[i]
        pl = near_player(players[i], x, y)
        # 꺾인 모양: 아래로 가다 위로 = bottom (바운드에 흔함)
        turn = 'bottom' if v1[1] > 0 and v2[1] < v1[1] * 0.3 else 'top' if v1[1] < 0 and v2[1] > 0 else 'side'
        events.append({'i': i, 'f': f0 + i, 'turn': turn, 'x': x, 'y': y, 'pl': pl, 'v1': v1, 'v2': v2})
    return events


def classify(events, pos, players, C, fps):
    """꺾임을 타구 / 바운드로 나눔

    타구: 선수 근처 + 꺾인 뒤 공이 상대 쪽으로 감
      (가까운 선수가 치면 화면 위로(멀어짐), 먼 선수가 치면 화면 아래로(다가옴))
    바운드: 선수와 떨어진 곳에서 아래로 가다 위로 꺾임
    """
    shots, bounces = [], []
    last_hit = None
    for e in events:
        pl = e['pl']
        if pl is not None:
            near = pl['court'][1] < 0
            away = e['v2'][1] < 0  # 화면 위로 = 카메라에서 멀어짐
            if away == near:
                if last_hit is not None and e['i'] - last_hit['i'] < fps * 1.5 and (last_hit['pl']['court'][1] < 0) == near:
                    continue  # 같은 쪽이 1.5초 안에 또 치는 건 같은 타구 · 서브 전 공 튀기기
                shots.append({**e, 'kind': 'hit'})
                last_hit = e
                continue
        if e['turn'] == 'bottom':
            bx, by = C.to_court(e['f'], e['x'], e['y'] + 4)
            if abs(bx) < HW + 4 and abs(by) < HL + 5:
                bounces.append({**e, 'bx': bx, 'by': by})
    return shots, bounces


def side_of(pl):
    return 'near' if pl['court'][1] < 0 else 'far'


def shot_kind(e, first, prev_bounce):
    pl = e['pl']
    x1, y1, x2, y2 = pl['box']
    cx = (x1 + x2) / 2
    px, py = pl['court']
    near = py < 0
    if first and abs(py) > HL - 1.5:
        return 'serve'
    if e['y'] < y1 + (y2 - y1) * 0.05 and not first:
        return 'overhead'
    if abs(py) < SV - 0.5 and not prev_bounce:
        return 'volley'
    # 오른손잡이 기준: 가까운 쪽(등을 보임)은 공이 몸 오른쪽이면 포핸드, 먼 쪽(얼굴을 보임)은 왼쪽이면 포핸드
    right = e['x'] > cx
    return 'fh' if right == near else 'bh'


def build(name, calib=None, video_id=None, start=None):
    frames, meta = load(name, calib)
    fps = meta['fps']
    f0 = frames[0]['f']
    C = Court(meta['courts'])
    players = players_on_court(frames, C)
    identify(players)
    pos = ball_track(frames, fps, C)
    events = find_events(pos, players, C, fps, f0)
    hits, bounces = classify(events, pos, players, C, fps)

    # 랠리 나누기: 공이 2초 넘게 안 보이거나 타구 간격이 4초를 넘으면 새 랠리
    def long_miss(a, b, n):
        run = 0
        for p in pos[a:b]:
            run = run + 1 if p is None else 0
            if run > n:
                return True
        return False

    rallies, cur = [], []
    for h in hits:
        if cur and (h['i'] - cur[-1]['i'] > fps * 4 or long_miss(cur[-1]['i'] + 1, h['i'], int(fps * 2))):
            rallies.append(cur)
            cur = []
        cur.append(h)
    if cur:
        rallies.append(cur)

    # 선수 번호: 처음 랠리에서 가까운 쪽 = P1 · P2 (왼쪽부터), 먼 쪽 = P3 · P4
    ids = {}
    seen = Counter()
    first_pos = {}
    for ps in players[: int(fps * 60)]:
        for p in ps:
            seen[p['id']] += 1
            first_pos.setdefault(p['id'], []).append(p['court'])
    if first_pos:
        med = {k: np.median(np.array(v), axis=0) for k, v in first_pos.items()}
        nears = sorted([k for k in med if med[k][1] < 0], key=lambda k: med[k][0])
        fars = sorted([k for k in med if med[k][1] >= 0], key=lambda k: med[k][0])
        for slot, k in zip(['P1', 'P2'], nears[:2]):
            ids[k] = slot
        for slot, k in zip(['P3', 'P4'], fars[:2]):
            ids[k] = slot
        for k in med:
            ids.setdefault(k, None)

    out_rallies, out_shots = [], []
    bi = 0
    for r_i, rally in enumerate(rallies):
        t0 = rally[0]['f'] / fps
        t1 = rally[-1]['f'] / fps + 2
        prev_hit_i = None
        for s_i, h in enumerate(rally):
            nxt = rally[s_i + 1]['i'] if s_i + 1 < len(rally) else h['i'] + int(fps * 3)
            # 이 타구 뒤 · 다음 타구 전의 바운드
            bs = [b for b in bounces if h['i'] < b['i'] < nxt]
            # 상대 코트(친 사람 반대쪽)에 떨어진 첫 바운드
            near = h['pl']['court'][1] < 0
            opp = [b for b in bs if (b['by'] > 0) == near]
            b = opp[0] if opp else None
            prev_bounce = prev_hit_i is not None and any(prev_hit_i < x['i'] < h['i'] and (x['by'] < 0) == near for x in bounces)
            kind = shot_kind(h, s_i == 0, prev_bounce or s_i == 0)
            res = 'unknown'
            if b is not None:
                if kind == 'serve':
                    inside = abs(b['bx']) <= SW + 0.15 and abs(b['by']) <= SV + 0.15
                else:
                    inside = abs(b['bx']) <= HW + 0.15 and abs(b['by']) <= HL + 0.15
                res = 'in' if inside else 'out'
            elif s_i + 1 < len(rally):
                res = 'in'  # 상대가 받아쳤으면 들어간 공
            elif bs and all((x['by'] > 0) != near for x in bs):
                res = 'net'  # 내 쪽에 떨어지고 끝남
            px, py = h['pl']['court']
            shot = {'t': round(h['f'] / fps, 2), 'r': r_i, 'p': ids.get(h['pl'].get('id')) or 'P?', 'k': kind, 'hx': round(px, 2), 'hy': round(py, 2), 'res': res}
            if b is not None:
                shot['bx'], shot['by'] = round(b['bx'], 2), round(b['by'], 2)
            out_shots.append(shot)
            prev_hit_i = h['i']
        last = out_shots[-1]
        last_near = last['hy'] < 0
        win = None
        if last['res'] == 'in':
            win = 'near' if last_near else 'far'
        elif last['res'] in ('out', 'net'):
            win = 'far' if last_near else 'near'
        out_rallies.append({'t0': round(t0, 2), 't1': round(t1, 2), 'win': win, 'end': 'winner' if last['res'] == 'in' else 'error' if last['res'] in ('out', 'net') else 'unknown'})

    result = {
        'v': 1,
        'title': name,
        'video': {'kind': 'youtube', 'id': video_id} if video_id else None,
        'duration': round(len(frames) / fps),
        'status': 'done',
        'engine': 'oc-analyzer 0.1',
        'players': {'P1': None, 'P2': None, 'P3': None, 'P4': None},
        'rallies': out_rallies,
        'shots': [s for s in out_shots if s['p'] != 'P?'],
    }
    seen_ball = sum(p is not None for p in pos) / max(1, len(pos))
    return result, {'pos': pos, 'players': players, 'hits': hits, 'bounces': bounces, 'ids': ids, 'C': C, 'fps': fps, 'f0': f0, 'ball_seen': seen_ball}


def build2(name, calib=None, video_id=None):
    """0.2: 소리 + 자세 + 공을 합쳐 타구를 찾음 (pose.py · audio.py 결과가 있을 때)"""
    import swing

    frames, meta = load(name, calib)
    fps = meta['fps']
    f0 = frames[0]['f']
    C = Court(meta['courts'])
    players = players_on_court(frames, C)
    pos = ball_track(frames, fps, C)
    events = find_events(pos, players, C, fps, f0)
    ball_hits, bounces = classify(events, pos, players, C, fps)
    pose = swing.load_pose(name)
    aud = json.load(open(f'out/{name}.audio.json'))
    hits, info = swing.fuse(frames, pose, aud, ball_hits, C, fps)
    hits = [h for h in hits if h['slot']]
    for h in hits:
        h['i'] = h['f'] - f0

    is_serve_pos = lambda h: abs(h['court'][1]) > HL - 1.6
    side = lambda h: h['court'][1] < 0
    strong = lambda h: h['desc']['overhead'] or h['snd'] >= 40 or h['sw'][1] >= 3.5

    def returned(k):
        """k번 타구 뒤 0.7~2.6초 안에 반대쪽 타구가 있으면 (= 서브가 넘어가 리턴됨)"""
        for j in range(k + 1, len(hits)):
            dt = (hits[j]['f'] - hits[k]['f']) / fps
            if dt > 2.6:
                break
            if dt >= 0.7 and side(hits[j]) != side(hits[k]):
                return True
        return False

    # 덩어리: 타구 사이가 3.5초 넘게 비면 나눔 → 덩어리마다 서브(또는 첫 주고받기)부터 랠리
    chunks, cur = [], []
    for k, h in enumerate(hits):
        if cur and (h['f'] - hits[cur[-1]]['f']) / fps > 3.5:
            chunks.append(cur)
            cur = []
        cur.append(k)
    if cur:
        chunks.append(cur)
    rallies = []
    serve_set = set()
    for ch in chunks:
        start = None
        # 서브: 베이스라인 + 0.7~2.6초 뒤 반대쪽 리턴, 그 앞은 같은 편 준비 동작(공 튀기기)뿐
        for n, k in enumerate(ch):
            if is_serve_pos(hits[k]) and returned(k) and all(side(hits[j]) == side(hits[k]) for j in ch[:n] if (hits[k]['f'] - hits[j]['f']) / fps < 6):
                start = n
        if start is not None:
            serve_set.add(ch[start])
        else:
            # 서브를 못 봤지만 양쪽이 주고받은 구간
            for n, k in enumerate(ch[:-1]):
                if side(hits[ch[n + 1]]) != side(hits[k]) and 0.6 <= (hits[ch[n + 1]]['f'] - hits[k]['f']) / fps <= 3:
                    start = n
                    break
        if start is None:
            # 한 번만 친 덩어리: 뚜렷한 서브 자세면 에이스 · 폴트로 남김
            k = max(ch, key=lambda k: hits[k]['snd'] * hits[k]['sw'][1])
            if is_serve_pos(hits[k]) and hits[k]['desc']['overhead'] and strong(hits[k]):
                serve_set.add(k)
                rallies.append([hits[k]])
            continue
        r = [hits[ch[start]]]
        for k in ch[start + 1:]:
            h, last = hits[k], r[-1]
            if side(h) == side(last) and (h['f'] - last['f']) / fps < 1.2:
                continue  # 같은 편이 1.2초 안에 또 = 같은 타구 · 잡음
            r.append(h)
        for h in r:
            h['_serve'] = False
        if ch[start] in serve_set:
            r[0]['_serve'] = True
        rallies.append(r)
    for k in serve_set:
        hits[k]['_serve'] = True

    # 손잡이: 서브 때 빠르게 움직인 손목
    hand_votes = {}
    for r in rallies:
        h = r[0]
        if is_serve_pos(h):
            hand_votes.setdefault(h['slot'], Counter())[h['desc']['hand']] += 1
    hand = {k: v.most_common(1)[0][0] for k, v in hand_votes.items()}

    def kind_of(h, first, prev_bounce):
        d = h['desc']
        px, py = h['court']
        if first and h.get('_serve'):
            return 'serve'
        if d['overhead']:
            return 'overhead'
        if abs(py) < SV - 1.0 and not prev_bounce:
            return 'volley'
        if d['side'] is None:
            return 'fh'
        near = py < 0
        own_right = (d['side'] > 0) if near else (d['side'] < 0)  # 가까운 쪽은 등, 먼 쪽은 얼굴이 보임
        return 'fh' if own_right == (hand.get(h['slot'], 'R') == 'R') else 'bh'

    out_rallies, out_shots = [], []
    for r_i, rally in enumerate(rallies):
        t0 = max(0, rally[0]['f'] / fps - 1)
        t1 = rally[-1]['f'] / fps + 2
        nxt_rally = rallies[r_i + 1] if r_i + 1 < len(rallies) else None
        for s_i, h in enumerate(rally):
            nxt = rally[s_i + 1]['i'] if s_i + 1 < len(rally) else h['i'] + int(fps * 3)
            near = h['court'][1] < 0
            bs = [b for b in bounces if h['i'] < b['i'] < nxt]
            opp = [b for b in bs if (b['by'] > 0) == near]
            b = opp[0] if opp else None
            prev = rally[s_i - 1] if s_i else None
            prev_bounce = prev is not None and any(prev['i'] < x['i'] < h['i'] and (x['by'] < 0) == near for x in bounces)
            kind = kind_of(h, s_i == 0, prev_bounce)
            res = 'unknown'
            if s_i + 1 < len(rally) and (rally[s_i + 1]['court'][1] < 0) != near:
                res = 'in'  # 상대가 받아쳤으면 들어간 공
            elif b is not None:
                if kind == 'serve':
                    inside = abs(b['bx']) <= SW + 0.15 and 0 <= abs(b['by']) <= SV + 0.15
                else:
                    inside = abs(b['bx']) <= HW + 0.15 and abs(b['by']) <= HL + 0.15
                res = 'in' if inside else 'out'
            elif bs and all((x['by'] > 0) != near for x in bs):
                res = 'net'
            fault = False
            if kind == 'serve' and len(rally) == 1 and nxt_rally and nxt_rally[0]['slot'] == h['slot'] and is_serve_pos(nxt_rally[0]) and (nxt_rally[0]['f'] - h['f']) / fps < 30:
                fault = True
                if res in ('in', 'unknown'):
                    res = 'out'
            px, py = h['court']
            d = h['desc']
            shot = {'t': round(h['f'] / fps, 2), 'r': r_i, 'p': h['slot'], 'k': kind, 'hx': round(px, 2), 'hy': round(py, 2), 'res': res}
            if b is not None:
                shot['bx'], shot['by'] = round(b['bx'], 2), round(b['by'], 2)
            if d.get('height'):
                shot['h'] = d['height']
            if d.get('reach'):
                shot['reach'] = d['reach']
            if d.get('run') is not None:
                shot['run'] = round(d['run'], 1)
            if fault:
                shot['fault'] = 1
            out_shots.append(shot)
        rs = [s for s in out_shots if s['r'] == r_i]
        last = rs[-1]
        last_near = last['hy'] < 0
        win = None
        if last['res'] == 'in':
            win = 'near' if last_near else 'far'
        elif last['res'] in ('out', 'net'):
            win = 'far' if last_near else 'near'
        ro = {'t0': round(t0, 2), 't1': round(t1, 2), 'win': win, 'end': 'fault' if last.get('fault') else 'winner' if last['res'] == 'in' else 'error' if last['res'] in ('out', 'net') else 'unknown'}
        if rs[0]['k'] == 'serve':
            ro['srv'] = rs[0]['p']
        out_rallies.append(ro)

    result = {
        'v': 1,
        'title': name,
        'video': {'kind': 'youtube', 'id': video_id} if video_id else None,
        'duration': round(len(frames) / fps),
        'status': 'done',
        'engine': 'oc-analyzer 0.2',
        'players': {'P1': None, 'P2': None, 'P3': None, 'P4': None},
        'hands': hand,
        'rallies': out_rallies,
        'shots': out_shots,
    }
    seen_ball = sum(p is not None for p in pos) / max(1, len(pos))
    return result, {'hits': hits, 'bounces': bounces, 'ball_seen': seen_ball, 'pos': pos, 'f0': f0, 'C': C, 'fps': fps, **info}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--name', default='match')
    ap.add_argument('--calib', default='out/calib.json')
    ap.add_argument('--youtube', default=None)
    ap.add_argument('--video', default=None, help='영상 파일 (선수별 옷 색을 재려면)')
    a = ap.parse_args()
    import os

    if os.path.exists(f'out/{a.name}.pose.jsonl') and os.path.exists(f'out/{a.name}.audio.json'):
        res, dbg = build2(a.name, a.calib, a.youtube)
        if a.video:
            import swing

            res['looks'] = swing.looks(a.video, dbg['hits'])
            print('옷 색', {k: v['n'] for k, v in res['looks'].items()})
    else:
        res, dbg = build(a.name, a.calib, a.youtube)
    json.dump(res, open(f'out/{a.name}.result.json', 'w'), ensure_ascii=False)
    kinds = Counter(s['k'] for s in res['shots'])
    resc = Counter(s['res'] for s in res['shots'])
    print(f"공 보인 프레임 {dbg['ball_seen']:.0%} · 타구 {len(dbg['hits'])} · 바운드 {len(dbg['bounces'])} · 랠리 {len(res['rallies'])} · 샷 {len(res['shots'])}")
    print('샷 종류', dict(kinds), '결과', dict(resc), '선수', dict(Counter(s['p'] for s in res['shots'])))
