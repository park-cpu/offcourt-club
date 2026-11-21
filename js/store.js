// ─────────────────────────────────────────────────────────────
// 앱 상태 + 파생 데이터(레이팅/전적/코인) + 로그인 세션
// ─────────────────────────────────────────────────────────────
import { db, COLLECTIONS } from './db.js';
import { computeRatings, computeStats, computeCoins } from './rules.js';

export const state = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
state.ready = false;

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);

let derivedCache = null;
let timer = null;

export async function startStore() {
  await db.start((col, docs) => {
    state[col] = docs;
    derivedCache = null;
    clearTimeout(timer);
    timer = setTimeout(() => listeners.forEach((fn) => fn()), 16);
  });
  state.ready = true;
}

// ── 설정 ─────────────────────────────────────────────
export const DEFAULT_SETTINGS = {
  id: 'main',
  clubName: 'Offcourt',
  adminId: null,
  initialCoins: 3,
  attendCoin: 1,
  minGames: 5,
  loanAmount: 3,
  seasons: [],
};
export const settings = () => ({ ...DEFAULT_SETTINGS, ...(state.settings.find((s) => s.id === 'main') || {}) });

// ── 조회 헬퍼 ─────────────────────────────────────────
export const playersMap = () => new Map(state.players.map((p) => [p.id, p]));
export const guestsMap = () => new Map(state.guests.map((g) => [g.id, g]));
export const activePlayers = () =>
  state.players.filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

export const person = (id) =>
  state.players.find((p) => p.id === id) || state.guests.find((g) => g.id === id) || { id, name: '(삭제됨)', ntrp: 3 };
export const nameOf = (id) => person(id).name;
export const isGuestId = (id) => !state.players.some((p) => p.id === id);

export function derived() {
  if (derivedCache) return derivedCache;
  const players = playersMap();
  const guests = guestsMap();
  const { ratings, deltas } = computeRatings(players, guests, state.matches);
  const allStats = computeStats(players, state.matches, deltas, null);
  const coins = computeCoins(players, state.attendance, state.coinLogs, state.matches, settings());
  derivedCache = { ratings, deltas, allStats, coins };
  return derivedCache;
}

export const seasonOf = (date) => settings().seasons.find((s) => date >= s.start && date <= s.end);
export const currentSeason = () => {
  const s = settings().seasons;
  return seasonOf(today()) || [...s].sort((a, b) => b.start.localeCompare(a.start))[0] || null;
};
export const seasonStats = (season) => {
  const { deltas } = derived();
  return computeStats(playersMap(), state.matches, deltas, season);
};

// ── 일정/출석 ─────────────────────────────────────────
export const scheduleById = (id) => state.schedules.find((s) => s.id === id);
export const attendanceOf = (scheduleId) =>
  state.attendance.filter((a) => a.scheduleId === scheduleId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
export const matchesOf = (scheduleId) =>
  state.matches.filter((m) => m.scheduleId === scheduleId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
export const courtsOf = (s) =>
  String(s?.courts || '')
    .split(/[,\s/]+/)
    .map((x) => x.trim())
    .filter(Boolean);

// ── 날짜 ─────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseYmd = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s, n) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const weekStart = (s) => {
  const d = parseYmd(s);
  const dow = (d.getDay() + 6) % 7; // 월=0
  d.setDate(d.getDate() - dow);
  return ymd(d);
};
export const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export const dowOf = (s) => DOW[parseYmd(s).getDay()];
export const fmtDate = (s) => {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
};
export const fmtShort = (s) => {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}.${d.getDate()}`;
};
export const careerText = (ym) => {
  if (!ym) return '-';
  const [y, m] = ym.split('-').map(Number);
  const now = new Date();
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  if (months < 0) return '-';
  const yy = Math.floor(months / 12);
  const mm = months % 12;
  return yy ? `${yy}년 ${mm}개월` : `${mm}개월`;
};

// ── 로그인 세션 (이 기기에 저장) ───────────────────────
const SESSION_KEY = 'offcourt-session';
export const session = {
  get() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (s && state.players.some((p) => p.id === s.playerId && p.active !== false)) return s;
    } catch {}
    return null;
  },
  set(playerId) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ playerId, at: Date.now() }));
  },
  clear() {
    localStorage.removeItem(SESSION_KEY);
  },
};
export const me = () => {
  const s = session.get();
  return s ? state.players.find((p) => p.id === s.playerId) : null;
};
export const isAdmin = () => {
  const m = me();
  return !!m && m.id === settings().adminId;
};

export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}:offcourt`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
