// ─────────────────────────────────────────────────────────────
// 날씨 예보 (Open-Meteo, 무료 · 키 없음)
// 일정 시간대의 기온 범위와 최대 강수확률을 보여줍니다.
// 범위: 지난 7일 ~ 앞으로 16일. 1시간마다 새로 받아옵니다.
// ─────────────────────────────────────────────────────────────
import { h } from './ui.js';

// 지역을 바꾸려면 여기 좌표만 수정
export const WEATHER_PLACE = { name: '고양시 일산', lat: 37.66, lon: 126.77 };

const URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_PLACE.lat}&longitude=${WEATHER_PLACE.lon}` +
  '&hourly=temperature_2m,precipitation_probability&timezone=Asia%2FSeoul&forecast_days=16&past_days=7';
const KEY = 'offcourt-weather-v1';
const MAX_AGE = 60 * 60 * 1000;

let hours = null; // Map<'YYYY-MM-DDTHH', {t, p}>
let loading = false;

function setData(data) {
  hours = new Map();
  const { time, temperature_2m: t, precipitation_probability: p } = data.hourly;
  time.forEach((x, i) => hours.set(x.slice(0, 13), { t: t[i], p: p[i] }));
}

/** 앱 시작 시 한 번 호출. 받아오면 화면을 다시 그림 */
export function loadWeather() {
  try {
    const cached = JSON.parse(localStorage.getItem(KEY));
    if (cached?.data) {
      setData(cached.data);
      if (Date.now() - cached.at < MAX_AGE) return;
    }
  } catch {}
  if (loading) return;
  loading = true;
  fetch(URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((data) => {
      setData(data);
      try {
        localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data }));
      } catch {}
      window.dispatchEvent(new Event('rerender'));
    })
    .catch((e) => console.warn('weather unavailable', e)) // 날씨가 없어도 앱은 그대로 동작
    .finally(() => (loading = false));
}

/** 일정 시간대(start~end)의 기온 범위와 최대 강수확률. 예보 범위 밖이면 null */
export function weatherFor(date, start, end) {
  if (!hours || !date || !start) return null;
  const s = parseInt(start, 10);
  let e = parseInt(end || start, 10);
  if (end && !end.endsWith(':00')) e += 1; // 10:30 종료면 10시대 포함
  const list = [];
  for (let hr = s; hr < Math.max(e, s + 1); hr++) {
    const v = hours.get(`${date}T${String(hr).padStart(2, '0')}`);
    if (v && v.t != null) list.push(v);
  }
  if (!list.length) return null;
  const temps = list.map((v) => Math.round(v.t));
  const pops = list.map((v) => v.p).filter((x) => x != null);
  return { min: Math.min(...temps), max: Math.max(...temps), pop: pops.length ? Math.max(...pops) : null };
}

/** 작은 날씨 표시: "3~5° · 강수 20%" */
export function weatherChip(s, cls = '') {
  const w = weatherFor(s.date, s.start, s.end);
  if (!w) return null;
  const deg = (n) => `${n < 0 ? '−' : ''}${Math.abs(n)}°`;
  const temp = w.min === w.max ? deg(w.min) : `${deg(w.min)} ~ ${deg(w.max)}`;
  const rainy = w.pop != null && w.pop >= 50;
  return h(
    'span',
    { class: 'wx ' + cls + (rainy ? ' rainy' : ''), title: `${WEATHER_PLACE.name} 예보` },
    h('span', { class: 'wx-t' }, temp),
    w.pop != null && h('span', { class: 'wx-p' }, `${rainy ? '☔ ' : ''}강수 ${w.pop}%`)
  );
}
