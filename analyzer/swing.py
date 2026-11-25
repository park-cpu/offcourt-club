"""자세(관절)로 선수 추적 · 스윙 · 서브 · 타점 찾기 (pose.py 결과 사용)

공이 안 보여도(특히 먼 쪽) 선수가 라켓을 휘두른 순간을 잡아 타구를 보완하고,
타점 높이 · 팔 뻗음 · 이동 속도 같은 '미스 원인' 재료를 만든다.
"""
import json
import math

import numpy as np

HW, SW, HL, SV = 5.485, 4.115, 11.885, 6.40
NOSE, LSH, RSH, LEL, REL, LWR, RWR, LHIP, RHIP, LKN, RKN, LAN, RAN = 0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16


def load_pose(name):
    return [json.loads(l) for l in open(f'out/{name}.pose.jsonl')]


def _pt(k, j, c=0.3):
    return k[j, :2] if k[j, 2] > c else None


def _mid(k, a, b):
    pa, pb = _pt(k, a), _pt(k, b)
    if pa is not None and pb is not None:
        return (pa + pb) / 2
    return pa if pa is not None else pb


def people(pose, C, dets_by_f=None):
    """프레임별 코트 위 사람 (발 → 코트 좌표, 상체 색은 같은 프레임 검출에서 가져옴)"""
    out = []
    for fr in pose:
        f = fr['f']
        ps = []
        for row in fr['p']:
            box = row[:4]
            k = np.array(row[4:], np.float64).reshape(17, 3)
            ank = [k[j, :2] for j in (LAN, RAN) if k[j, 2] > 0.3]
            foot = np.mean(ank, 0) if ank else np.array([(box[0] + box[2]) / 2, box[3]])
            cx, cy = C.to_court(f, float(foot[0]), float(foot[1]))
            if not (abs(cx) < HW + 2.5 and abs(cy) < HL + 4.5):
                continue
            hist = None
            if dets_by_f is not None:
                best = 0
                for p in dets_by_f.get(f, []):
                    iou = _iou(box, p[:4])
                    if iou > best and iou > 0.4:
                        best, hist = iou, np.array(p[5:], np.float32)
            ps.append({'f': f, 'box': box, 'k': k, 'court': (cx, cy), 'h': max(20.0, box[3] - box[1]), 'hist': hist})
        out.append(ps)
    return out


def _iou(a, b):
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0


def tracks(frames, fps, gap=0.8, jump=0.9):
    """프레임 사이 가장 가까운 사람끼리 이어 붙여 '조각 궤적'을 만듦"""
    live, done = [], []
    for ps in frames:
        if not ps:
            continue
        f = ps[0]['f']
        live2 = []
        for t in live:
            if (f - t[-1]['f']) / fps > gap:
                done.append(t)
            else:
                live2.append(t)
        live = live2
        pairs = []
        for i, p in enumerate(ps):
            for j, t in enumerate(live):
                d = math.dist(p['court'], t[-1]['court'])
                lim = jump * max(1, (f - t[-1]['f']) / 2)
                if d < lim:
                    pairs.append((d, i, j))
        used_p, used_t = set(), set()
        for d, i, j in sorted(pairs):
            if i in used_p or j in used_t:
                continue
            live[j].append(ps[i])
            used_p.add(i)
            used_t.add(j)
        for i, p in enumerate(ps):
            if i not in used_p:
                live.append([p])
    return [t for t in done + live if len(t) >= 3]


def assign_ids(trs, fps, k=4):
    """조각 궤적을 옷 색으로 4명에게 나눔. 같은 시간에 겹치는 조각은 다른 사람"""
    import cv2

    feats, idx = [], []
    for i, t in enumerate(trs):
        hs = [p['hist'] for p in t if p['hist'] is not None]
        t_id = None
        for p in t:
            p['track'] = i
        if len(hs) >= 3 and len(t) / fps * 2 >= 0.5:
            feats.append(np.mean(hs, 0))
            idx.append(i)
    if len(feats) < k:
        return {}
    X = np.array(feats, np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.001)
    _, labels, centers = cv2.kmeans(X, k, None, crit, 8, cv2.KMEANS_PP_CENTERS)
    lab = {i: int(l[0]) for i, l in zip(idx, labels)}
    dist = {i: [float(np.linalg.norm(X[n] - centers[c])) for c in range(k)] for n, i in enumerate(idx)}
    # 겹침 정리: 긴 조각부터 자리를 차지, 겹치는 짧은 조각은 다음으로 가까운 사람
    order = sorted(lab, key=lambda i: -len(trs[i]))
    occupied = {c: [] for c in range(k)}
    final = {}
    for i in order:
        a, b = trs[i][0]['f'], trs[i][-1]['f']
        for c in sorted(range(k), key=lambda c: dist[i][c]):
            if all(b < s or a > e for s, e in occupied[c]):
                occupied[c].append((a, b))
                final[i] = c
                break
    return final


def wrist_speed(t, fps):
    """조각 궤적 안에서 매 순간 손목 속도 (몸 기준, 키 대비 1초에 몇 배)"""
    sp = []
    for a, b in zip(t, t[1:]):
        dt = (b['f'] - a['f']) / fps
        if dt <= 0 or dt > 0.2:
            sp.append((b, 0.0, None))
            continue
        ca, cb = _mid(a['k'], LHIP, RHIP), _mid(b['k'], LHIP, RHIP)
        if ca is None or cb is None:
            sp.append((b, 0.0, None))
            continue
        best, which = 0.0, None
        for j in (LWR, RWR):
            wa, wb = _pt(a['k'], j), _pt(b['k'], j)
            if wa is None or wb is None:
                continue
            v = np.linalg.norm((wb - cb) - (wa - ca)) / dt / ((a['h'] + b['h']) / 2)
            if v > best:
                best, which = v, j
        sp.append((b, best, which))
    return sp


def swings(trs, fps, thr=3.2, gap=0.6):
    """손목이 빠르게 움직인 정점 = 스윙"""
    out = []
    for ti, t in enumerate(trs):
        sp = wrist_speed(t, fps)
        for n, (p, v, j) in enumerate(sp):
            if v < thr or j is None:
                continue
            lo = max(0, n - int(fps * 0.3 / 2))
            hi = min(len(sp), n + int(fps * 0.3 / 2) + 1)
            if v < max(x[1] for x in sp[lo:hi]):
                continue
            if out and out[-1]['track'] == ti and (p['f'] - out[-1]['f']) / fps < gap:
                continue
            out.append({'f': p['f'], 'track': ti, 'p': p, 'v': v, 'wrist': j})
    out.sort(key=lambda s: s['f'])
    return out


def describe(sw, trs, fps):
    """스윙 순간의 자세 → 서브 자세 · 타점 높이 · 팔 뻗음 · 이동 속도"""
    p, k, j = sw['p'], sw['p']['k'], sw['wrist']
    t = trs[sw['track']]
    # 스윙 전후 0.3초 중 손목이 가장 높았던 순간(서브 · 스매시 판단)
    win = [q for q in t if abs(q['f'] - p['f']) <= fps * 0.35]
    nose = _pt(k, NOSE, 0.2)
    sh = _mid(k, LSH, RSH)
    hip = _mid(k, LHIP, RHIP)
    kn = _mid(k, LKN, RKN)
    an = _mid(k, LAN, RAN)
    top = min((q['k'][j, 1] for q in win if q['k'][j, 2] > 0.3), default=None)
    head = nose[1] if nose is not None else (sh[1] - 0.12 * p['h'] if sh is not None else None)
    overhead = top is not None and head is not None and top < head - 0.12 * p['h']
    # 타점: 스윙 정점 바로 앞 프레임의 손목 위치(라켓 · 공은 손목 근처)
    w = _pt(k, j)
    foot_y = an[1] if an is not None else p['box'][3]
    height = None
    if w is not None:
        rel = (foot_y - w[1]) / p['h']  # 0 = 발, 1 = 머리 꼭대기
        height = 'low' if rel < 0.42 else 'high' if rel > 0.8 else 'mid'
    reach = None
    if w is not None and sh is not None:
        r = abs(w[0] - sh[0]) / p['h']
        reach = 'far' if r > 0.5 else 'close' if r < 0.18 else 'normal'
    # 이동 속도: 스윙 0.5초 전 → 스윙 순간 (m/s)
    prev = [q for q in t if fps * 0.3 <= p['f'] - q['f'] <= fps * 0.6]
    run = math.dist(prev[0]['court'], p['court']) / ((p['f'] - prev[0]['f']) / fps) if prev else None
    # 손목이 몸 어느 쪽인지 (포 · 백 판단용): 화면에서 엉덩이 중심보다 오른쪽이면 +1
    side = None
    if w is not None and hip is not None:
        side = 1 if w[0] > hip[0] else -1
    return {'overhead': overhead, 'height': height, 'reach': reach, 'run': run, 'side': side, 'hand': 'L' if j == LWR else 'R'}


# ── 소리 + 자세 + 공을 합쳐 타구 찾기 ───────────────────────
def fuse(frames, pose, aud, ball_hits, C, fps, aud_min=8.0, swing_min=1.5):
    """타구 = '퐁' 소리 + (그 순간 스윙한 선수 또는 선수 근처에서 꺾인 공)

    소리가 없거나 묻혀도, 공이 선수 근처에서 꺾이고 손목이 빠르게 움직였으면 타구로 인정.
    공만 꺾이고 스윙 · 소리가 없으면(공 튀기기 · 공 주고받기) 버림.
    """
    from collections import defaultdict

    dets_by_f = {fr['f']: fr['p'] for fr in frames}
    P = people(pose, C, dets_by_f)
    trs = tracks(P, fps)
    idmap = assign_ids(trs, fps)
    by_f = defaultdict(list)
    for ti, t in enumerate(trs):
        for p, v, j in wrist_speed(t, fps):
            by_f[p['f']].append((ti, v, j, p))
    fs = sorted(by_f)

    def window(f, w):
        import bisect

        a, b = bisect.bisect_left(fs, f - w), bisect.bisect_right(fs, f + w)
        return [x for k in fs[a:b] for x in by_f[k]]

    def best_swing(f, w, court=None, maxd=2.5):
        best = None
        for ti, v, j, p in window(f, w):
            if court is not None and math.dist(p['court'], court) > maxd:
                continue
            if j is not None and (best is None or v > best[1]):
                best = (ti, v, j, p)
        return best

    cands = []
    for t, s in aud:
        if s < aud_min:
            continue
        f = t * fps
        bh = min(ball_hits, key=lambda h: abs(h['f'] - f), default=None)
        if bh is not None and abs(bh['f'] - f) > fps * 0.35:
            bh = None
        sw = best_swing(f, fps * 0.3, bh['pl']['court'] if bh else None)
        if sw is None or sw[1] < swing_min:
            if bh is None:
                continue
            sw = best_swing(f, fps * 0.3, bh['pl']['court'], 3.5)
            if sw is None:
                continue
        cands.append({'f': int(round(f)), 'snd': s, 'sw': sw, 'ball': bh})
    # 소리는 없지만 공 꺾임 + 강한 스윙
    for bh in ball_hits:
        if any(abs(c['f'] - bh['f']) < fps * 0.4 for c in cands):
            continue
        sw = best_swing(bh['f'], fps * 0.3, bh['pl']['court'])
        if sw is not None and sw[1] >= 2.5:
            cands.append({'f': bh['f'], 'snd': 0, 'sw': sw, 'ball': bh})
    cands.sort(key=lambda c: c['f'])
    # 0.45초 안에 겹친 후보는 하나만 (소리 큰 쪽)
    hits = []
    for c in cands:
        if hits and c['f'] - hits[-1]['f'] < fps * 0.45:
            if (c['snd'], c['sw'][1]) > (hits[-1]['snd'], hits[-1]['sw'][1]):
                hits[-1] = c
            continue
        hits.append(c)
    # 선수 번호: 조각 궤적 → 사람(0~3). 번호가 없는 짧은 조각은 그 근처 시간의 가장 가까운 사람
    known = defaultdict(list)
    for ti, t in enumerate(trs):
        if ti in idmap:
            for p in t:
                known[p['f']].append((idmap[ti], p['court']))
    kf = sorted(known)
    for h in hits:
        ti, v, j, p = h['sw']
        pid = idmap.get(ti)
        if pid is None:
            import bisect

            a, b = bisect.bisect_left(kf, h['f'] - fps), bisect.bisect_right(kf, h['f'] + fps)
            near = [(math.dist(c, p['court']), i) for k in kf[a:b] for i, c in known[k]]
            pid = min(near)[1] if near else None
        h['pid'] = pid
        h['desc'] = describe({'p': p, 'wrist': j, 'track': ti}, trs, fps)
        h['court'] = p['court']
        h['box'] = p['box']
    # 사람(0~3) → P1~P4: 처음 나왔을 때 가까운 쪽 왼쪽부터 P1 · P2, 먼 쪽 P3 · P4
    first = {}
    for ti, t in sorted(enumerate(trs), key=lambda x: x[1][0]['f']):
        if ti in idmap and idmap[ti] not in first:
            first[idmap[ti]] = np.median(np.array([p['court'] for p in t]), axis=0)
    nears = sorted([k for k in first if first[k][1] < 0], key=lambda k: first[k][0])
    fars = sorted([k for k in first if first[k][1] >= 0], key=lambda k: first[k][0])
    slots = {}
    for s, k in zip(['P1', 'P2'], nears[:2]):
        slots[k] = s
    for s, k in zip(['P3', 'P4'], fars[:2]):
        slots[k] = s
    rest = [s for s in ['P1', 'P2', 'P3', 'P4'] if s not in slots.values()]
    for k in first:
        if k not in slots and rest:
            slots[k] = rest.pop(0)
    for h in hits:
        h['slot'] = slots.get(h['pid'])
    return hits, {'tracks': len(trs), 'ided': len(idmap)}
