// ─────────────────────────────────────────────────────────────
// 관리자: 경기장 목록 (settings.venues) — 일정 등록 때 고르면 주소 · 지도가 자동으로 붙음
// ─────────────────────────────────────────────────────────────
import { h, sheet, toast, field, confirmSheet, empty } from '../ui.js';
import { settings } from '../store.js';
import { put, uid } from '../db.js';
import { pageHead, backLink } from './common.js';
import { venueList, mapLink } from './schedule.js';

const saveList = (venues) => put('settings', { ...settings(), id: 'main', venues });

// ── 날씨 위치 찾기 (v1.14.0~) ─────────────────────────────
// 주소(없으면 경기장 이름)로 OpenStreetMap 검색 → 위도 · 경도 + 지역 이름(예: 고양시 덕양구)
// 상세 주소가 안 나오면 뒤에서부터 한 단어씩 줄여 다시 찾음. 날씨는 동네 수준이면 충분
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=kr&accept-language=ko&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('geocode ' + r.status);
  return (await r.json())[0] || null;
}
async function findPlace(v) {
  const tries = [];
  const shrink = (text, min) => {
    const w = (text || '').split(/\s+/).filter(Boolean);
    for (let n = w.length; n >= min; n--) tries.push(w.slice(0, n).join(' '));
  };
  shrink(v.address, 2); // 주소: 전체 → 뒤에서부터 줄이기
  shrink(v.name, 1); // 이름: '파주 법원읍 테니스장' → '파주 법원읍' → '파주'
  for (const q of [...new Set(tries)].slice(0, 6)) {
    const hit = await geocode(q).catch(() => null);
    if (hit) {
      const a = hit.address || {};
      const place = [a.city || a.county || a.province, a.borough || a.town || a.village || a.suburb || a.quarter].filter(Boolean).join(' ');
      return { lat: Math.round(Number(hit.lat) * 1000) / 1000, lon: Math.round(Number(hit.lon) * 1000) / 1000, wxPlace: place || v.name };
    }
    await sleep(1100); // OpenStreetMap 이용 규칙: 1초에 한 번
  }
  return null;
}
const wxText = (v) => (v.lat != null ? `☀ ${v.wxPlace || '위치 저장됨'}` : '☀ 기본 위치(고양시 일산)');

function editVenue(v) {
  sheet(v ? '경기장 수정' : '경기장 추가', (close) => {
    const name = h('input', { class: 'input', value: v?.name || '', placeholder: '예) 법원읍 테니스장' });
    const address = h('input', { class: 'input', value: v?.address || '', placeholder: '예) 경기 파주시 법원읍 …' });
    const mapUrl = h('input', { class: 'input', type: 'url', value: v?.mapUrl || '', placeholder: '선택 · 비우면 주소로 지도 검색' });
    const save = async () => {
      const doc = { ...(v || {}), id: v?.id || uid('v_'), name: name.value.trim(), address: address.value.trim(), mapUrl: mapUrl.value.trim() };
      if (!doc.name) return toast('경기장 이름을 입력해 주세요');
      const list = venueList();
      if (list.some((x) => x.name === doc.name && x.id !== doc.id)) return toast('같은 이름의 경기장이 있어요');
      // 새 경기장이거나 주소 · 이름이 바뀌면 날씨 위치를 다시 찾음
      if (doc.lat == null || doc.address !== (v?.address || '') || doc.name !== (v?.name || '')) {
        saveBtn.disabled = true;
        saveBtn.textContent = '날씨 위치 찾는 중…';
        const p = await findPlace(doc);
        delete doc.lat;
        delete doc.lon;
        delete doc.wxPlace;
        if (p) Object.assign(doc, p);
        else toast('날씨 위치를 못 찾아 기본 위치(고양시 일산) 날씨로 보여요');
      }
      await saveList(v ? list.map((x) => (x.id === v.id ? doc : x)) : [...list, doc]);
      close();
      toast('저장했어요');
    };
    const saveBtn = h('button', { class: 'btn primary block', onclick: () => save() }, '저장');
    const del = async () => {
      if (!(await confirmSheet('경기장 삭제', `${v.name}을(를) 목록에서 뺄까요? 지난 일정은 그대로예요.`, '삭제', true))) return;
      await saveList(venueList().filter((x) => x.id !== v.id));
      close();
      toast('삭제했어요');
    };
    return h(
      'div',
      { class: 'stack' },
      field('이름', name),
      field('주소', address, '주소를 넣으면 지도가 자동으로 연결돼요'),
      field('네이버 지도 링크', mapUrl, '선택 사항 · 주소 검색이 정확하지 않을 때만'),
      v && h('p', { class: 'muted small' }, `날씨: ${wxText(v)}`),
      saveBtn,
      v && h('button', { class: 'btn ghost block danger-text', onclick: del }, '목록에서 삭제')
    );
  });
}

export function venuesAdmin() {
  const list = venueList();
  return h(
    'div',
    { class: 'page' },
    backLink('#/admin', '관리자'),
    pageHead('경기장 관리', 'Courts'),
    h('p', { class: 'muted' }, '여기 등록한 경기장은 일정 등록 때 목록에서 고를 수 있고, 주소로 네이버 지도가 자동 연결돼요.'),
    list.length
      ? h(
          'div',
          { class: 'menu' },
          list.map((v) =>
            h(
              'div',
              { class: 'link-row', onclick: () => editVenue(v) },
              h('span', {}, h('strong', {}, v.name), h('small', { class: 'venue-addr muted' }, v.address || '주소 미등록'), h('small', { class: 'venue-addr muted' }, wxText(v))),
              h('span', { onclick: (e) => e.stopPropagation() }, mapLink({ venue: v.name, address: v.address, mapUrl: v.mapUrl }))
            )
          )
        )
      : empty('등록된 경기장이 없어요'),
    h('button', { class: 'btn primary block', onclick: () => editVenue(null) }, '＋ 경기장 추가'),
    list.length > 0 && h('button', { class: 'btn ghost block', onclick: (e) => fillAll(e.currentTarget) }, '☀️ 날씨 위치 한 번에 찾기'),
    h('p', { class: 'muted small' }, '날씨는 경기장 주소의 지역 예보로 보여줘요. 위치를 못 찾은 경기장은 고양시 일산 날씨로 나와요.')
  );
}

// 위치가 없는 경기장들의 날씨 위치를 차례로 찾아 한 번에 저장
async function fillAll(btn) {
  const list = venueList();
  const todo = list.filter((v) => v.lat == null);
  if (!todo.length) return toast('모든 경기장에 날씨 위치가 있어요');
  btn.disabled = true;
  const out = [];
  let found = 0;
  let n = 0;
  for (const v of list) {
    if (v.lat != null) {
      out.push(v);
      continue;
    }
    btn.textContent = `찾는 중… ${++n}/${todo.length}`;
    const p = await findPlace(v);
    if (p) found++;
    out.push(p ? { ...v, ...p } : v);
    await sleep(1100);
  }
  await saveList(out);
  toast(`${found}곳 찾았어요${found < todo.length ? ` · ${todo.length - found}곳은 기본 위치` : ''}`);
}
