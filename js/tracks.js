// ─────────────────────────────────────────────────────────────
// 영상 위 그래픽 (v1.17.0~)
//   위치 데이터(선수 상자 · 공 · 바운드)는 분석 문서와 따로 'analysisTracks/{분석 id}'에 저장
//   → 앱 시작 때 모두 받지 않고, 분석 화면을 열 때만 받음 (문서 하나 ≈ 300~400KB)
//   Firestore는 배열 안 배열을 못 넣으므로 JSON 문자열 하나로 저장
//   유튜브 재생 시각은 iframe postMessage(infoDelivery)로 받아 사이를 시계로 채움
// ─────────────────────────────────────────────────────────────
import { db } from './db.js';

const COL = 'analysisTracks';
const LKEY = (id) => `offcourt-tracks-${id}`;
const cache = new Map();

export async function saveTracks(id, tracks) {
  const data = JSON.stringify(tracks);
  if (data.length > 1000000) throw new Error('too-big');
  if (db.mode === 'firebase') await db.fs.setDoc(db.ref(COL, id), { id, data, at: Date.now() });
  else localStorage.setItem(LKEY(id), data);
  cache.set(id, tracks);
}

export async function loadTracks(id) {
  if (cache.has(id)) return cache.get(id);
  let data = null;
  try {
    if (db.mode === 'firebase') {
      const snap = await db.fs.getDoc(db.ref(COL, id));
      data = snap.exists() ? snap.data().data : null;
    } else data = localStorage.getItem(LKEY(id));
  } catch (e) {
    console.warn('tracks', e);
  }
  const t = data ? JSON.parse(data) : null;
  cache.set(id, t);
  return t;
}

export async function removeTracks(id) {
  cache.delete(id);
  try {
    if (db.mode === 'firebase') await db.fs.deleteDoc(db.ref(COL, id));
    else localStorage.removeItem(LKEY(id));
  } catch (e) {
    console.warn('tracks', e);
  }
}

// ── 유튜브 재생 시각 ─────────────────────────────────
// iframe에 'listening'을 보내면 infoDelivery로 currentTime · playerState가 옴 (약 0.25초마다)
const yt = { t: 0, at: 0, playing: false, rate: 1 };
let listening = false;
function onMsg(e) {
  if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
  let d;
  try {
    d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
  } catch {
    return;
  }
  const info = d?.info;
  if (!info) return;
  if (typeof info.currentTime === 'number') {
    yt.t = info.currentTime;
    yt.at = performance.now();
  }
  if (typeof info.playerState === 'number') yt.playing = info.playerState === 1;
  if (typeof info.playbackRate === 'number') yt.rate = info.playbackRate;
}
export function listenYouTube(iframe) {
  if (!listening) {
    window.addEventListener('message', onMsg);
    listening = true;
  }
  const hello = () => iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'oc', channel: 'widget' }), '*');
  iframe.addEventListener('load', hello);
  // 이미 로드된 경우 · 놓친 경우를 위해 몇 번 더
  [500, 1500, 3000].forEach((ms) => setTimeout(hello, ms));
}
// 샷을 눌러 이동했을 때 바로 맞추기 (다음 infoDelivery가 오기 전까지)
export function hintTime(t) {
  yt.t = t;
  yt.at = performance.now();
}
export const nowTime = () => yt.t + (yt.playing ? ((performance.now() - yt.at) / 1000) * yt.rate : 0);

// ── 그리기 ────────────────────────────────────────────
const KIND = { serve: '서브', fh: '포핸드', bh: '백핸드', volley: '발리', overhead: '스매시', unknown: '샷' };
const RES = { in: ['인', '#5fd08a'], out: ['아웃', '#ff6b5b'], net: ['네트', '#d9d9d9'] };

function segAt(tr, t) {
  for (const s of tr.segs) if (t >= s.t0 && t < s.t0 + s.n / tr.fps) return s;
  return null;
}
function boxAt(seg, k, t, fps) {
  const arr = seg.p[k];
  if (!arr) return null;
  const x = (t - seg.t0) * fps;
  const i = Math.floor(x);
  const get = (j) => (j >= 0 && j < seg.n && arr[j * 4] >= 0 ? arr.slice(j * 4, j * 4 + 4) : null);
  const a = get(i);
  const b = get(i + 1);
  if (a && b) {
    const u = x - i;
    return a.map((v, n) => v + (b[n] - v) * u);
  }
  return a || b;
}

/** 캔버스 하나에 시각 t의 장면을 그림. opt: { names: {P1: '홍길동'}, colors: {P1: '#36363a'}, shots, rallies } */
export function drawOverlay(cv, tr, t, opt) {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth;
  const H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const seg = segAt(tr, t);
  if (!seg) return;
  const s = W / tr.w;
  const X = (v) => v * s;
  const light = (hex) => {
    const n = parseInt((hex || '#888888').slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(v, 130));
    return `rgb(${c.join(',')})`;
  };
  const font = (px, w = 700) => `${w} ${px}px Pretendard, -apple-system, sans-serif`;
  const fs = Math.max(10, Math.min(16, W / 48));

  // 선수: 모서리 괄호 + 발밑 타원 + 이름표
  const boxes = {};
  for (const k of Object.keys(seg.p)) {
    const b = boxAt(seg, k, t, tr.fps);
    if (!b) continue;
    boxes[k] = b;
    const [x1, y1, x2, y2] = b.map(X);
    const c = light(opt.colors?.[k]);
    const L = Math.min(x2 - x1, y2 - y1) * 0.25;
    g.strokeStyle = c;
    g.lineWidth = 2;
    g.beginPath();
    for (const [px, py, dx, dy] of [[x1, y1, 1, 1], [x2, y1, -1, 1], [x1, y2, 1, -1], [x2, y2, -1, -1]]) {
      g.moveTo(px + dx * L, py);
      g.lineTo(px, py);
      g.lineTo(px, py + dy * L);
    }
    g.stroke();
    g.beginPath();
    g.ellipse((x1 + x2) / 2, y2, (x2 - x1) * 0.55, Math.max(2, (x2 - x1) * 0.16), 0, 0, Math.PI * 2);
    g.stroke();
    const name = opt.names?.[k] || k;
    g.font = font(fs * 0.85);
    const w = g.measureText(name).width + 10;
    g.fillStyle = 'rgba(0,0,0,.6)';
    g.beginPath();
    g.roundRect(x1, y1 - fs * 1.4, w, fs * 1.25, 4);
    g.fill();
    g.fillStyle = c;
    g.fillText(name, x1 + 5, y1 - fs * 0.45);
  }

  // 공 꼬리 (최근 0.3초)
  const f = (t - seg.t0) * 30;
  const pts = [];
  for (let i = 0; i < seg.b.length; i += 3) {
    const df = f - seg.b[i];
    if (df >= -0.5 && df < 9) pts.push([df, X(seg.b[i + 1]), X(seg.b[i + 2])]);
  }
  if (pts.length) {
    g.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      if (pts[i - 1][0] - pts[i][0] > 2.5) continue;
      g.strokeStyle = `rgba(255,235,0,${1 - pts[i][0] / 10})`;
      g.lineWidth = Math.max(1, 4 - pts[i][0] / 3);
      g.beginPath();
      g.moveTo(pts[i - 1][1], pts[i - 1][2]);
      g.lineTo(pts[i][1], pts[i][2]);
      g.stroke();
    }
    const last = pts[pts.length - 1];
    if (last[0] < 1.5) {
      g.fillStyle = '#ffeb00';
      g.beginPath();
      g.arc(last[1], last[2], Math.max(3, W / 220), 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 1;
      g.stroke();
    }
  }

  // 바운드 (1초 동안 퍼지는 타원)
  for (const [bt, bx, by, inside] of tr.bn) {
    const age = t - bt;
    if (age < 0 || age >= 1) continue;
    const r = (10 + age * 18) * s * 1.6;
    g.strokeStyle = inside ? `rgba(95,208,138,${1 - age})` : `rgba(255,107,91,${1 - age})`;
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(X(bx), X(by), r, Math.max(2, r / 3), 0, 0, Math.PI * 2);
    g.stroke();
  }

  // 샷 이름 (친 뒤 1.2초)
  for (const sh of opt.shots || []) {
    const age = t - sh.t;
    if (age < 0 || age >= 1.2) continue;
    const b = boxes[sh.p];
    const [lx, ly] = b ? [X(b[2]) + 6, X(b[1])] : [12, fs * 4];
    const [rt, rc] = RES[sh.res] || ['', '#fff'];
    const text = `${opt.names?.[sh.p] || sh.p} ${KIND[sh.k] || '샷'}${rt ? ' · ' + rt : ''}`;
    g.font = font(fs * 1.05);
    const w = g.measureText(text).width + 14;
    const x = Math.min(lx, W - w - 4);
    g.globalAlpha = age > 0.9 ? (1.2 - age) / 0.3 : 1;
    g.fillStyle = 'rgba(20,20,20,.85)';
    g.beginPath();
    g.roundRect(x, ly, w, fs * 1.7, 6);
    g.fill();
    g.fillStyle = rt ? rc : '#fff';
    g.fillText(text, x + 7, ly + fs * 1.2);
    g.globalAlpha = 1;
  }

  // 왼쪽 위: 랠리 · 몇 구째
  const ri = (opt.rallies || []).findIndex((r) => t >= r.t0 - 0.7 && t <= r.t1 + 0.7);
  if (ri >= 0) {
    const n = (opt.shots || []).filter((x) => x.r === ri && x.t <= t).length;
    const head = n ? `랠리 ${ri + 1} · ${n}구째` : `랠리 ${ri + 1}`;
    g.font = font(fs * 1.1);
    const w = g.measureText(head).width + 18;
    g.fillStyle = 'rgba(29,82,148,.92)';
    g.beginPath();
    g.roundRect(8, H - fs * 2.6 - 8, w, fs * 2, 8);
    g.fill();
    g.fillStyle = '#F7F1D6';
    g.fillText(head, 17, H - fs * 1.15 - 8);
  }
}
