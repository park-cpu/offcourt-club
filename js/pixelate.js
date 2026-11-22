// ─────────────────────────────────────────────────────────────
// 사진 · 글자 → 픽셀 아이템 변환 (관리자 아이템 등록용, 모두 이 기기 안에서 처리)
//   1) 원하는 크기로 줄이기 (칸마다 평균색)
//   2) 배경 지우기 (가장자리와 비슷한 색을 바깥부터 지움)
//   3) 색 개수 줄이기 (k-means)
//   4) 바깥 테두리 그리기
// ─────────────────────────────────────────────────────────────
import { OUTLINE } from './pixel.js';

export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 열 수 없어요'));
    img.src = url;
  });
}

/** 글자를 큰 캔버스에 그림 (이후 pixelate로 줄임) */
export function textToCanvas(text, { color = '#1d5294', font = 'sans', bg = null } = {}) {
  const fam = font === 'serif' ? "700 96px Newsreader, 'Times New Roman', serif" : "800 96px 'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', sans-serif";
  const lines = String(text || ' ').split('\n').slice(0, 3);
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = fam;
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + 24;
  cv.width = Math.max(32, w);
  cv.height = lines.length * 104 + 16;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
  ctx.font = fam;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, 12, 8 + i * 104));
  return cv;
}

/**
 * @param src  Image | Canvas
 * @param opt  { size: 긴 변 픽셀 수, colors: 색 개수, removeBg, outline, cover: 정사각형 꽉 채우기, tolerance }
 * @returns    canvas (테두리 포함)
 */
export function pixelate(src, opt = {}) {
  const { size = 24, colors = 10, removeBg = true, outline = true, cover = false, tolerance = 48 } = opt;
  const sw = src.naturalWidth || src.width;
  const sh = src.naturalHeight || src.height;
  let w, h, sx = 0, sy = 0, cw = sw, ch = sh;
  if (cover) {
    // 정사각형으로 가운데를 잘라 꽉 채움 (배경 바탕용)
    w = h = size;
    const s = Math.min(sw, sh);
    sx = (sw - s) / 2;
    sy = (sh - s) / 2;
    cw = ch = s;
  } else {
    const k = size / Math.max(sw, sh);
    w = Math.max(1, Math.round(sw * k));
    h = Math.max(1, Math.round(sh * k));
  }

  // 1) 칸마다 평균색 (4배 크기로 부드럽게 줄인 뒤 4×4씩 평균)
  const F = 4;
  const big = document.createElement('canvas');
  big.width = w * F;
  big.height = h * F;
  const bctx = big.getContext('2d', { willReadFrequently: true });
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(src, sx, sy, cw, ch, 0, 0, w * F, h * F);
  const bd = bctx.getImageData(0, 0, w * F, h * F).data;
  const px = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < F; j++)
        for (let i = 0; i < F; i++) {
          const o = ((y * F + j) * w * F + x * F + i) * 4;
          const al = bd[o + 3];
          r += bd[o] * al;
          g += bd[o + 1] * al;
          b += bd[o + 2] * al;
          a += al;
        }
      const o = (y * w + x) * 4;
      px.set(a ? [r / a, g / a, b / a, a / (F * F)] : [0, 0, 0, 0], o);
    }

  // 2) 배경 지우기: 가장자리 칸들의 대표색과 비슷하면 바깥에서부터 지움
  if (removeBg) {
    const border = [];
    for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
    const opaque = border.filter((i) => px[i * 4 + 3] > 128);
    if (opaque.length) {
      const med = [0, 1, 2].map((c) => {
        const v = opaque.map((i) => px[i * 4 + c]).sort((a, b) => a - b);
        return v[v.length >> 1];
      });
      const near = (i) => Math.hypot(px[i * 4] - med[0], px[i * 4 + 1] - med[1], px[i * 4 + 2] - med[2]) < tolerance;
      const seen = new Uint8Array(w * h);
      const stack = border.filter((i) => px[i * 4 + 3] <= 128 || near(i));
      stack.forEach((i) => (seen[i] = 1));
      while (stack.length) {
        const i = stack.pop();
        px[i * 4 + 3] = 0;
        const x = i % w, y = (i / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (!seen[n] && (px[n * 4 + 3] <= 128 || near(n))) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
  }

  // 투명도는 있음/없음 두 가지로
  const on = [];
  for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] > 128) on.push(i);

  // 3) 색 개수 줄이기 (k-means)
  const pal = kmeans(on.map((i) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]), Math.max(2, colors));
  const pad = outline ? 1 : 0;
  const out = document.createElement('canvas');
  out.width = w + pad * 2;
  out.height = h + pad * 2;
  const octx = out.getContext('2d');
  const img = octx.createImageData(out.width, out.height);
  const mark = new Uint8Array(out.width * out.height);
  on.forEach((i, k) => {
    const c = pal.centers[pal.labels[k]];
    const x = (i % w) + pad, y = ((i / w) | 0) + pad;
    const o = (y * out.width + x) * 4;
    img.data.set([c[0], c[1], c[2], 255], o);
    mark[y * out.width + x] = 1;
  });

  // 4) 바깥 테두리
  if (outline) {
    const oc = [1, 3, 5].map((i) => parseInt(OUTLINE.slice(i, i + 2), 16));
    for (let y = 0; y < out.height; y++)
      for (let x = 0; x < out.width; x++) {
        if (mark[y * out.width + x]) continue;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => {
          const nx = x + a, ny = y + b;
          return nx >= 0 && ny >= 0 && nx < out.width && ny < out.height && mark[ny * out.width + nx];
        });
        if (nb) img.data.set([...oc, 255], (y * out.width + x) * 4);
      }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// 결정적 k-means (같은 사진이면 같은 결과)
function kmeans(points, k) {
  if (!points.length) return { centers: [], labels: [] };
  // 서로 먼 점부터 골라 시작점으로
  const centers = [points[0].slice()];
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const step = Math.max(1, Math.floor(points.length / 2000));
  while (centers.length < k) {
    let best = -1, bi = 0;
    for (let i = 0; i < points.length; i += step) {
      const m = Math.min(...centers.map((c) => d2(points[i], c)));
      if (m > best) { best = m; bi = i; }
    }
    if (best <= 1) break;
    centers.push(points[bi].slice());
  }
  const labels = new Array(points.length).fill(0);
  for (let it = 0; it < 10; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    points.forEach((p, i) => {
      let bi = 0, bd = Infinity;
      centers.forEach((c, j) => {
        const d = d2(p, c);
        if (d < bd) { bd = d; bi = j; }
      });
      labels[i] = bi;
      const s = sum[bi];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    });
    sum.forEach((s, j) => s[3] && (centers[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]));
  }
  return { centers: centers.map((c) => c.map(Math.round)), labels };
}
