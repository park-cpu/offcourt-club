// ─────────────────────────────────────────────────────────────
// 날씨 예보 (Open-Meteo, 무료 · 키 없음)
// 일정 시간대의 기온 범위, 최대 강수확률, 최대 풍속(v1.18.0~)을 보여줍니다.
// 범위: 지난 7일 ~ 앞으로 16일. 1시간마다 새로 받아옵니다.
// v1.14.0~ 경기장마다 위치(settings.venues[].lat/lon)가 있으면 그 지역 날씨,
//          없으면 기본 위치(WEATHER_PLACE).
// ─────────────────────────────────────────────────────────────
import { h } from './ui.js';
import { settings } from './store.js';

// 경기장 위치를 못 찾았을 때 쓰는 기본 위치
export const WEATHER_PLACE = { name: '고양시 일산', lat: 37.66, lon: 126.77 };

const KEY = 'offcourt-weather-v3'; // v3: 풍속 추가
const MAX_AGE = 60 * 60 * 1000;
const RETRY = 5 * 60 * 1000; // 실패하면 5분 뒤 다시
const WINDY = 5; // 초속 5m 이상이면 강조 (공이 눈에 띄게 흔들리는 정도)

const places = new Map(); // locKey → { hours: Map<'YYYY-MM-DDTHH', {t, p}>, at }
const loading = new Set();
const failedAt = new Map();

const locKey = (p) => `${Number(p.lat).toFixed(2)},${Number(p.lon).toFixed(2)}`;

/** 일정의 날씨 위치: 같은 이름의 경기장에 위치가 저장돼 있으면 그곳, 아니면 기본 위치 */
function placeOf(s) {
  const v = s && (settings().venues || []).find((x) => x.name === s.venue && x.lat != null && x.lon != null);
  return v ? { name: v.wxPlace || v.name, lat: v.lat, lon: v.lon } : WEATHER_PLACE;
}

function toHours(data) {
  const m = new Map();
  const { time, temperature_2m: t, precipitation_probability: p, wind_speed_10m: w } = data.hourly;
  time.forEach((x, i) => m.set(x.slice(0, 13), { t: t[i], p: p[i], w: w?.[i] }));
  return m;
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function fetchPlace(p) {
  const k = locKey(p);
  if (loading.has(k) || Date.now() - (failedAt.get(k) || 0) < RETRY) return;
  const have = places.get(k);
  if (have && Date.now() - have.at < MAX_AGE) return;
  loading.add(k);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${Number(p.lat).toFixed(3)}&longitude=${Number(p.lon).toFixed(3)}` +
    '&hourly=temperature_2m,precipitation_probability,wind_speed_10m&wind_speed_unit=ms&timezone=Asia%2FSeoul&forecast_days=16&past_days=7';
  fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((data) => {
      const at = Date.now();
      places.set(k, { hours: toHours(data), at });
      try {
        const c = readCache();
        c[k] = { at, data: { hourly: data.hourly } };
        // 오래된 위치는 정리 (하루 지난 것)
        Object.keys(c).forEach((x) => at - c[x].at > 24 * MAX_AGE && delete c[x]);
        localStorage.setItem(KEY, JSON.stringify(c));
      } catch {}
      window.dispatchEvent(new Event('rerender'));
    })
    .catch((e) => {
      failedAt.set(k, Date.now());
      console.warn('weather unavailable', e); // 날씨가 없어도 앱은 그대로 동작
    })
    .finally(() => loading.delete(k));
}

/** 앱 시작 시 호출: 저장해 둔 예보를 꺼내고, 오래됐으면 기본 위치 + 경기장 위치들을 새로 받음 */
export function loadWeather() {
  const c = readCache();
  Object.entries(c).forEach(([k, v]) => {
    try {
      if (!places.has(k) && v?.data) places.set(k, { hours: toHours(v.data), at: v.at });
    } catch {}
  });
  fetchPlace(WEATHER_PLACE);
  (settings().venues || []).forEach((v) => v.lat != null && v.lon != null && fetchPlace(v));
}

/** 일정 시간대(start~end)의 기온 범위 · 최대 강수확률 · 최대 풍속(m/s). 예보 범위 밖이면 null
 *  네 번째 값으로 일정(s)을 주면 그 경기장 위치의 날씨 */
export function weatherFor(date, start, end, s) {
  if (!date || !start) return null;
  const p = placeOf(s);
  const got = places.get(locKey(p));
  if (!got || Date.now() - got.at > MAX_AGE) fetchPlace(p); // 처음 보는 경기장이면 받아옴 (받으면 다시 그림)
  const hours = got?.hours;
  if (!hours) return null;
  const st = parseInt(start, 10);
  let e = parseInt(end || start, 10);
  if (end && !end.endsWith(':00')) e += 1; // 10:30 종료면 10시대 포함
  const list = [];
  for (let hr = st; hr < Math.max(e, st + 1); hr++) {
    const v = hours.get(`${date}T${String(hr).padStart(2, '0')}`);
    if (v && v.t != null) list.push(v);
  }
  if (!list.length) return null;
  const temps = list.map((v) => Math.round(v.t));
  const pops = list.map((v) => v.p).filter((x) => x != null);
  const winds = list.map((v) => v.w).filter((x) => x != null);
  return { min: Math.min(...temps), max: Math.max(...temps), pop: pops.length ? Math.max(...pops) : null, wind: winds.length ? Math.round(Math.max(...winds)) : null };
}

/** 작은 날씨 표시 (v1.22.0~ 모든 화면 같은 모양): "8~11℃ | 9% | 5m/s"
 *  비 올 확률 50% 이상 = 파란 굵게, 바람 초속 5m 이상 = 빨간 굵게. 무엇인지는 title(길게 누르면 나오는 설명)에 */
export function weatherChip(s, cls = '') {
  const w = weatherFor(s.date, s.start, s.end, s);
  if (!w) return null;
  const deg = (n) => `${n < 0 ? '−' : ''}${Math.abs(n)}`;
  const temp = w.min === w.max ? `${deg(w.min)}℃` : `${deg(w.min)}~${deg(w.max)}℃`;
  const rainy = w.pop != null && w.pop >= 50;
  const windy = w.wind != null && w.wind >= WINDY;
  const bar = () => h('span', { class: 'wx-bar', 'aria-hidden': 'true' }, '|');
  return h(
    'span',
    { class: 'wx ' + cls + (rainy ? ' rainy' : ''), title: `${placeOf(s).name} 예보 · 기온 ${temp} · 강수확률 ${w.pop ?? '-'}% · 바람 ${w.wind ?? '-'}m/s` },
    h('span', { class: 'wx-t' }, temp),
    w.pop != null && [bar(), h('span', { class: 'wx-p', 'aria-label': `강수확률 ${w.pop}%` }, `${w.pop}%`)],
    w.wind != null && [bar(), h('span', { class: 'wx-p wx-w' + (windy ? ' windy' : ''), 'aria-label': `바람 ${w.wind}m/s` }, `${w.wind}m/s`)]
  );
}
