"""1-4단계: 소리에서 '퐁' 타구음 찾기 (공이 안 보여도 친 순간을 정확히 잡는 단서)

입력: 영상의 소리를 모노 wav로 (유튜브면 yt-dlp -f 140 → ffmpeg -ac 1 -ar 22050 audio.wav)
출력: out/<이름>.audio.json = [[초, 세기], ...]  세기 = 주변 소음 대비 배수
"""
import argparse
import json
import wave

import numpy as np


def onsets(x, sr, win=0.005, thr=6.0, gap=0.12):
    # 높은 소리만 (타구음은 날카로움): 1차 차분 = 간단한 고역 통과
    y = np.diff(x.astype(np.float32))
    n = int(sr * win)
    m = len(y) // n
    e = (y[: m * n].reshape(m, n) ** 2).mean(1)  # 5ms 단위 에너지
    # 주변 1초 중앙값 대비
    k = int(1 / win)
    pad = np.pad(e, (k // 2, k // 2), mode='edge')
    from numpy.lib.stride_tricks import sliding_window_view

    med = np.median(sliding_window_view(pad, k)[: m], axis=1) + 1e-9
    r = e / med
    out = []
    i = 0
    while i < m:
        if r[i] > thr and (i == 0 or r[i] > r[i - 1]):
            j = min(m, i + int(gap / win))
            p = i + int(np.argmax(r[i:j]))
            out.append([round(p * win, 3), round(float(r[p]), 1)])
            i = j
        else:
            i += 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('wav')
    ap.add_argument('--name', default='match')
    ap.add_argument('--thr', type=float, default=6.0)
    a = ap.parse_args()
    w = wave.open(a.wav)
    sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16)
    res = onsets(x, sr, thr=a.thr)
    json.dump(res, open(f'out/{a.name}.audio.json', 'w'))
    print('타구음 후보', len(res))


if __name__ == '__main__':
    main()
