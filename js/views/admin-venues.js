// ─────────────────────────────────────────────────────────────
// 관리자: 경기장 목록 (settings.venues) — 일정 등록 때 고르면 주소 · 지도가 자동으로 붙음
// ─────────────────────────────────────────────────────────────
import { h, sheet, toast, field, confirmSheet, empty } from '../ui.js';
import { settings } from '../store.js';
import { put, uid } from '../db.js';
import { pageHead, backLink } from './common.js';
import { venueList, mapLink } from './schedule.js';

const saveList = (venues) => put('settings', { ...settings(), id: 'main', venues });

function editVenue(v) {
  sheet(v ? '경기장 수정' : '경기장 추가', (close) => {
    const name = h('input', { class: 'input', value: v?.name || '', placeholder: '예) 법원읍 테니스장' });
    const address = h('input', { class: 'input', value: v?.address || '', placeholder: '예) 경기 파주시 법원읍 …' });
    const mapUrl = h('input', { class: 'input', type: 'url', value: v?.mapUrl || '', placeholder: '선택 · 비우면 주소로 지도 검색' });
    const save = async () => {
      const doc = { id: v?.id || uid('v_'), name: name.value.trim(), address: address.value.trim(), mapUrl: mapUrl.value.trim() };
      if (!doc.name) return toast('경기장 이름을 입력해 주세요');
      const list = venueList();
      if (list.some((x) => x.name === doc.name && x.id !== doc.id)) return toast('같은 이름의 경기장이 있어요');
      await saveList(v ? list.map((x) => (x.id === v.id ? doc : x)) : [...list, doc]);
      close();
      toast('저장했어요');
    };
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
      h('button', { class: 'btn primary block', onclick: save }, '저장'),
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
              h('span', {}, h('strong', {}, v.name), h('small', { class: 'venue-addr muted' }, v.address || '주소 미등록')),
              h('span', { onclick: (e) => e.stopPropagation() }, mapLink({ venue: v.name, address: v.address, mapUrl: v.mapUrl }))
            )
          )
        )
      : empty('등록된 경기장이 없어요'),
    h('button', { class: 'btn primary block', onclick: () => editVenue(null) }, '＋ 경기장 추가')
  );
}
