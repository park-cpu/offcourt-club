// ─────────────────────────────────────────────────────────────
// 앱 상태 + 파생 데이터(레이팅/전적/코인) + 로그인 세션
// ─────────────────────────────────────────────────────────────
import { db, COLLECTIONS } from './db.js';
import { computeRatings, computeStats, computeCoins, computeBalls, ntrpToRating, RULES } from './rules.js';
import { BUILTIN_ITEMS } from './avatar-items.js';
import { DEFAULT_LOOK, LOOK_VERSION, DEFAULT_WEAR, HAIRS_BY_SEX } from './pixel.js';

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
// 볼 · 미션 규칙: settings.ballRules = [{from:'날짜', attend, play, win, weekly:[{id,kind,goal,reward}]}]
// 관리자가 바꾸면 그날부터 새 규칙 (지난 기록은 그때 규칙 그대로). 주간 미션은 그 주 일요일 기준 → 이번 주부터 바로 적용
export const ballRulesAt = (date) => {
  const v = (settings().ballRules || []).filter((r) => r.from <= date).sort((a, b) => a.from.localeCompare(b.from)).pop();
  return v ? { ...RULES.balls, ...v } : RULES.balls;
};
export const weekRules = (wk) => ballRulesAt(addDays(wk, 6));
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
  const { ratings, deltas, spDeltas } = computeRatings(players, guests, state.matches);
  const allStats = computeStats(players, state.matches, spDeltas, null);
  const coins = computeCoins(players, state.attendance, state.coinLogs, state.matches, settings());
  const balls = computeBalls(players, state.attendance, state.matches, state.purchases, weekStart, ballRulesAt, weekRules, state.ballLogs || []);
  derivedCache = { ratings, deltas, spDeltas, allStats, coins, balls };
  return derivedCache;
}

// 대진용 레이팅: 회원은 계산된 레이팅, 게스트는 입력한 NTRP 기준
export const ratingOf = (id) => derived().ratings.get(id) ?? ntrpToRating(person(id).ntrp);
export const ratingMap = (ids) => new Map(ids.map((id) => [id, ratingOf(id)]));

// 시즌 = 반기 고정 (v1.27.8~): 1~6월 상반기 · 7~12월 하반기, 첫 경기 · 일정이 있는 반기부터 지금 반기까지 자동
//   관리자가 예전에 만든 시즌(settings.seasons)과 기간이 똑같으면 그 id · 이름을 그대로 씀 (주소 · 표시 유지)
export function seasonList() {
  const t = today();
  const saved = settings().seasons || [];
  let first = t;
  for (const m of state.matches) if (m.date && m.date < first) first = m.date;
  for (const x of state.schedules) if (x.date && x.date < first) first = x.date;
  const out = [];
  let y = Number(first.slice(0, 4));
  let half = Number(first.slice(5, 7)) <= 6 ? 1 : 2;
  const endY = Number(t.slice(0, 4));
  const endHalf = Number(t.slice(5, 7)) <= 6 ? 1 : 2;
  while (y < endY || (y === endY && half <= endHalf)) {
    const start = half === 1 ? `${y}-01-01` : `${y}-07-01`;
    const end = half === 1 ? `${y}-06-30` : `${y}-12-31`;
    const old = saved.find((x) => x.start === start && x.end === end);
    out.push({ id: old?.id || `h${y}_${half}`, name: old?.name || `${y} ${half === 1 ? '상반기' : '하반기'}`, start, end });
    if (half === 2) y++;
    half = half === 1 ? 2 : 1;
  }
  return out.sort((a, b) => b.start.localeCompare(a.start));
}
export const seasonOf = (date) => seasonList().find((s) => date >= s.start && date <= s.end);
export const currentSeason = () => seasonOf(today()) || seasonList()[0] || null;
// type: 'official'(공식전 시즌 순위) | 'coin'(코인전 랭킹) | 생략(전체)
export const seasonStats = (season, type) => {
  const { spDeltas } = derived();
  return computeStats(playersMap(), state.matches, spDeltas, season, type);
};

// ── 일정/출석 ─────────────────────────────────────────
export const scheduleById = (id) => state.schedules.find((s) => s.id === id);
// 일정 시작 · 종료 시각 (ms)
export const scheduleTime = (s, key = 'end') => {
  const [y, mo, d] = s.date.split('-').map(Number);
  const [hh, mm] = (s[key] || '23:59').split(':').map(Number);
  return new Date(y, mo - 1, d, hh, mm).getTime();
};
// 정해진 경기 시간이 끝났는지 (v1.13.0~ 끝나면 새 대진 불가)
export const scheduleEnded = (s, now = Date.now()) => !!s && now >= scheduleTime(s, 'end');
// 참가자가 점수 입력 · 수정할 수 있는 시간인지 (종료 후 RULES.recordGraceMin분까지)
export const recordOpen = (s, now = Date.now()) => !!s && now < scheduleTime(s, 'end') + RULES.recordGraceMin * 60000;
export const attendanceOf = (scheduleId) =>
  state.attendance.filter((a) => a.scheduleId === scheduleId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
export const matchesOf = (scheduleId) =>
  state.matches.filter((m) => m.scheduleId === scheduleId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
// 정원: 신청 순서대로 앞 capacity명은 확정, 나머지는 대기 (취소 시 대기자가 자동으로 올라감)
export const capacityOf = (s) => Math.max(0, Number(s?.capacity) || 0);
// 일정 종류 (v1.29.0~): 매치 · 연습. 예전 일정(kind 없음)은 매치
export const SESSION_KINDS = { match: '매치', practice: '연습' };
export const kindOf = (s) => (s?.kind === 'practice' ? 'practice' : 'match');
// 회원별 매치 · 연습 참여 횟수 = 도착 체크한 일정 수 (range {start,end} 있으면 그 기간만)
export const sessionCounts = (range) => {
  const kinds = new Map(state.schedules.map((s) => [s.id, kindOf(s)]));
  const out = new Map();
  for (const a of state.attendance) {
    if (!a.arrived || a.isGuest || !kinds.has(a.scheduleId)) continue;
    if (range && !(a.date >= range.start && a.date <= range.end)) continue;
    const c = out.get(a.playerId) || { match: 0, practice: 0, last: '' };
    c[kinds.get(a.scheduleId)]++;
    if ((a.date || '') > c.last) c.last = a.date || '';
    out.set(a.playerId, c);
  }
  return out;
};
export const rosterOf = (s) => {
  const cap = capacityOf(s);
  return attendanceOf(s.id).map((a, i) => ({ ...a, waiting: cap > 0 && i >= cap, order: i + 1, waitNo: cap > 0 && i >= cap ? i - cap + 1 : 0 }));
};
export const countText = (s) => {
  const n = attendanceOf(s.id).length;
  const cap = capacityOf(s);
  return cap ? `${Math.min(n, cap)}/${cap}` : String(n);
};

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

// ── 아바타 · 아이템 ─────────────────────────────────────
// 기본 아이템(코드) + 관리자 아이템(state.items). 판매 중지 아이템도 보유자는 계속 착용
// 기본 아이템을 관리자가 고치면 같은 id의 items 문서에 이름·가격·판매 여부만 저장 (그림은 코드 그대로)
const BUILTIN_IDS = new Set(BUILTIN_ITEMS.map((it) => it.id));
export const isBuiltinId = (id) => BUILTIN_IDS.has(id);
/** 관리자가 새로 등록한 아이템만 (기본 아이템 수정 기록 제외) */
export const customItems = () => state.items.filter((it) => !BUILTIN_IDS.has(it.id));
let itemsCache = null, itemsSrc = null;
export const itemsMap = () => {
  if (itemsSrc !== state.items) {
    itemsSrc = state.items;
    const over = new Map(state.items.filter((it) => BUILTIN_IDS.has(it.id)).map((it) => [it.id, it]));
    const builtins = BUILTIN_ITEMS.map((b) => {
      const o = over.get(b.id);
      return o ? { ...b, name: o.name || b.name, price: o.price ?? b.price, active: o.active !== false, edited: true } : b;
    });
    itemsCache = new Map([...builtins, ...customItems()].map((it) => [it.id, it]));
  }
  return itemsCache;
};
// 성별에 따라 기본 옷·헤어가 다름 (레퍼런스 남/여 캐릭터)
export const lookOf = (playerId) => {
  const saved = state.avatars.find((a) => a.id === playerId);
  const sex = state.players.find((p) => p.id === playerId)?.gender === 'F' ? 'F' : 'M';
  const look = { ...DEFAULT_LOOK, hairColor: DEFAULT_WEAR[sex].hair, ...(saved || {}), sex, v: LOOK_VERSION };
  // 성별에 맞는 헤어만 (예전 값은 기본으로)
  if (!HAIRS_BY_SEX[sex].some(([k]) => k === look.hair)) look.hair = sex === 'F' ? 'f' : 'm';
  return look;
};
export const ownedSet = (playerId) => new Set(state.purchases.filter((p) => p.playerId === playerId).map((p) => p.itemId));
