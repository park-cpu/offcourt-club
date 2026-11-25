"""분석 결과를 영상 위에 그려 새 영상으로 저장 (선수 상자 · 관절 · 공 꼬리 · 샷 이름 · 바운드 · 미니 코트)

  .venv/bin/python render.py match.mp4 --name match --t0 670 --t1 696 --out out/overlay.mp4
결과 영상은 유튜브에 올리거나 그대로 공유. 화면 글자는 한국어(맥 기본 글꼴).
"""
import argparse
import json
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

import events
import swing

KIND = {'serve': '서브', 'fh': '포핸드', 'bh': '백핸드', 'volley': '발리', 'overhead': '스매시', 'unknown': '샷'}
RES = {'in': ('인', (80, 200, 120)), 'out': ('아웃', (235, 80, 60)), 'net': ('네트', (200, 200, 200)), 'unknown': ('', (255, 255, 255))}
FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
EDGES = [(5, 7), (7, 9), (6, 8), (8, 10), (5, 6), (5, 11), (6, 12), (11, 12), (11, 13), (13, 15), (12, 14), (14, 16)]


def hex_rgb(c):
    c = c.lstrip('#')
    return tuple(int(c[i: i + 2], 16) for i in (0, 2, 4))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('--name', default='match')
    ap.add_argument('--t0', type=float, required=True)
    ap.add_argument('--t1', type=float, required=True)
    ap.add_argument('--out', default='out/overlay.mp4')
    ap.add_argument('--width', type=int, default=1280)
    a = ap.parse_args()

    res, d = events.build2(a.name, None, None)
    saved = json.load(open(f'out/{a.name}.result.json'))
    looks = saved.get('looks', {})
    fps, f0, C, pos = d['fps'], d['f0'], d['C'], d['pos']
    col = {k: hex_rgb(v['c']) for k, v in looks.items()}
    for k, c in {'P1': (90, 90, 90), 'P2': (90, 160, 185), 'P3': (230, 230, 230), 'P4': (30, 30, 30)}.items():
        col.setdefault(k, c)
    # 테두리는 너무 어두우면 안 보여서 밝게
    edge = {k: tuple(min(255, max(v, 120)) for v in c) for k, c in col.items()}

    # 프레임별 선수 (자세는 2프레임마다 → 빈 프레임은 앞 프레임 사용)
    who = {}
    for ti, t in enumerate(d['trs']):
        pid = d['idmap'].get(ti)
        slot = d['slots'].get(pid) if pid is not None else None
        if not slot:
            continue
        for p in t:
            who.setdefault(p['f'], []).append((slot, p))
    shots = [s for s in res['shots'] if a.t0 - 1 <= s['t'] <= a.t1]
    bounces = [b for b in d['bounces'] if a.t0 * fps <= b['f'] <= a.t1 * fps]

    cap = cv2.VideoCapture(a.video)
    W, H = int(cap.get(3)), int(cap.get(4))
    ow = a.width
    oh = int(H * ow / W) // 2 * 2
    sc = ow / W
    ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{ow}x{oh}', '-r', str(fps), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'fast', a.out], stdin=subprocess.PIPE)
    big = ImageFont.truetype(FONT, 26, index=6) if True else None
    mid = ImageFont.truetype(FONT, 20, index=6)
    small = ImageFont.truetype(FONT, 15, index=6)

    fa, fb = int(a.t0 * fps), int(a.t1 * fps)
    cap.set(cv2.CAP_PROP_POS_FRAMES, fa)
    last_ps = []
    for f in range(fa, fb):
        ok, im = cap.read()
        if not ok:
            break
        t = f / fps
        im = cv2.resize(im, (ow, oh))
        ov = im.copy()
        ps = who.get(f, None)
        if ps is None:
            ps = last_ps
        else:
            last_ps = ps
        # 관절 · 상자
        for slot, p in ps:
            x1, y1, x2, y2 = [v * sc for v in p['box']]
            c = edge[slot][::-1]
            k = p['k']
            for i, j in EDGES:
                if k[i, 2] > 0.3 and k[j, 2] > 0.3:
                    cv2.line(ov, (int(k[i, 0] * sc), int(k[i, 1] * sc)), (int(k[j, 0] * sc), int(k[j, 1] * sc)), c, 3, cv2.LINE_AA)
            L = int(min(x2 - x1, y2 - y1) * 0.25)
            for (px, py, dx, dy) in [(x1, y1, 1, 1), (x2, y1, -1, 1), (x1, y2, 1, -1), (x2, y2, -1, -1)]:
                cv2.line(ov, (int(px), int(py)), (int(px + dx * L), int(py)), c, 2, cv2.LINE_AA)
                cv2.line(ov, (int(px), int(py)), (int(px), int(py + dy * L)), c, 2, cv2.LINE_AA)
        # 바닥 그림자(발 위치 타원)
        for slot, p in ps:
            x1, y1, x2, y2 = [v * sc for v in p['box']]
            cv2.ellipse(ov, (int((x1 + x2) / 2), int(y2)), (int((x2 - x1) * 0.55), max(3, int((x2 - x1) * 0.16))), 0, 0, 360, edge[slot][::-1], 2, cv2.LINE_AA)
        # 공 꼬리
        i = f - f0
        trail = [(n, pos[i - n]) for n in range(0, 10) if 0 <= i - n < len(pos) and pos[i - n] is not None]
        for (n1, p1), (n2, p2) in zip(trail, trail[1:]):
            if n2 - n1 <= 2:
                cv2.line(ov, (int(p1[0] * sc), int(p1[1] * sc)), (int(p2[0] * sc), int(p2[1] * sc)), (0, 235, 255), max(1, 4 - n1 // 3), cv2.LINE_AA)
        if trail and trail[0][0] == 0:
            x, y = trail[0][1]
            cv2.circle(ov, (int(x * sc), int(y * sc)), 6, (0, 235, 255), -1, cv2.LINE_AA)
            cv2.circle(ov, (int(x * sc), int(y * sc)), 9, (255, 255, 255), 1, cv2.LINE_AA)
        # 바운드 표시 (1초 동안)
        for b in bounces:
            age = (f - b['f']) / fps
            if 0 <= age < 1.0:
                bx, by = b['bx'], b['by']
                inside = abs(bx) <= 5.6 and abs(by) <= 12.0
                c = (120, 200, 80) if inside else (60, 80, 235)
                cx, cy = C.to_img(b['f'], bx, by)
                rr = int((10 + age * 18) * sc * 1.6)
                cv2.ellipse(ov, (int(cx * sc), int(cy * sc)), (rr, max(2, rr // 3)), 0, 0, 360, c, 3, cv2.LINE_AA)
        im = ov

        # 미니 코트 (오른쪽 위)
        mw, mh = int(ow * 0.13), int(ow * 0.26)
        mx, my = ow - mw - 16, 16
        mini = im[my: my + mh, mx: mx + mw]
        cv2.addWeighted(np.full_like(mini, (60, 90, 40)), 0.75, mini, 0.25, 0, mini)
        M = lambda X, Y: (int(mx + mw / 2 + X / 7.2 * (mw / 2)), int(my + mh / 2 - Y / 13.5 * (mh / 2)))
        for x1_, y1_, x2_, y2_ in [(-5.485, -11.885, 5.485, -11.885), (-5.485, 11.885, 5.485, 11.885), (-5.485, -11.885, -5.485, 11.885), (5.485, -11.885, 5.485, 11.885), (-4.115, -11.885, -4.115, 11.885), (4.115, -11.885, 4.115, 11.885), (-4.115, 6.4, 4.115, 6.4), (-4.115, -6.4, 4.115, -6.4), (0, -6.4, 0, 6.4)]:
            cv2.line(im, M(x1_, y1_), M(x2_, y2_), (240, 240, 240), 1, cv2.LINE_AA)
        cv2.line(im, M(-6.2, 0), M(6.2, 0), (200, 200, 200), 2)
        for b in bounces:
            if b['f'] <= f:
                inside = abs(b['bx']) <= 5.6 and abs(b['by']) <= 12.0
                cv2.circle(im, M(b['bx'], b['by']), 3, (120, 200, 80) if inside else (60, 80, 235), -1, cv2.LINE_AA)
        for slot, p in ps:
            cv2.circle(im, M(*p['court']), 5, col[slot][::-1], -1, cv2.LINE_AA)
            cv2.circle(im, M(*p['court']), 5, (255, 255, 255), 1, cv2.LINE_AA)

        # 글자 (PIL)
        pil = Image.fromarray(cv2.cvtColor(im, cv2.COLOR_BGR2RGB))
        dr = ImageDraw.Draw(pil)
        for slot, p in ps:
            x1, y1, x2, y2 = [v * sc for v in p['box']]
            tx, ty = int(x1), int(y1) - 22
            dr.rounded_rectangle([tx - 2, ty - 1, tx + 36, ty + 19], 5, fill=(0, 0, 0, 160))
            dr.text((tx + 3, ty), slot, font=small, fill=edge[slot])
        done = [s for s in shots if s['t'] <= t]
        cur = [s for s in shots if 0 <= t - s['t'] < 1.3]
        for s in cur:
            hp = [p for sl, p in ps if sl == s['p']]
            if hp:
                x1, y1, x2, y2 = [v * sc for v in hp[0]['box']]
                lx, ly = int(x2) + 6, int(y1)
            else:
                lx, ly = 30, 90
            label = KIND.get(s['k'], '샷')
            rt, rc = RES.get(s['res'], RES['unknown'])
            text = f"{s['p']} {label}" + (f" · {rt}" if rt else '')
            w = dr.textlength(text, font=mid)
            dr.rounded_rectangle([lx - 6, ly - 4, lx + w + 8, ly + 28], 8, fill=(20, 20, 20))
            dr.text((lx, ly), text, font=mid, fill=rc if rt else (255, 255, 255))
        # 왼쪽 위 상태줄
        rid = shots[0]['r'] + 1 if shots else 0
        head = f"랠리 {rid} · {len(done)}구째" if done else f"랠리 {rid}"
        dr.rounded_rectangle([16, 16, 30 + dr.textlength(head, font=big), 58], 10, fill=(29, 82, 148))
        dr.text((24, 20), head, font=big, fill=(247, 241, 214))
        dr.text((18, oh - 26), 'Offcourt 영상 분석 시험판 · 자동 인식이라 틀릴 수 있어요', font=small, fill=(255, 255, 255))
        im = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
        ff.stdin.write(im.tobytes())
    ff.stdin.close()
    ff.wait()
    print('저장', a.out)


if __name__ == '__main__':
    main()
