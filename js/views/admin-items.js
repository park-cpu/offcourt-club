// ─────────────────────────────────────────────────────────────
// 관리자: 아바타 아이템 등록 · 수정 (사진 · 글자 → 픽셀 이미지 자동 변환)
// ─────────────────────────────────────────────────────────────
import { h, sheet, toast, field, select, confirmSheet, empty } from '../ui.js';
import { state, itemsMap, customItems } from '../store.js';
import { put, remove, uid, batch } from '../db.js';
import { BUILTIN_ITEMS } from '../avatar-items.js';
import { stageCanvas, itemThumb, scaleTo, SLOTS, SLOT_LABEL, BG_LABEL, DEFAULT_LOOK, STAGE_W } from '../pixel.js';
import { pixelate, fileToImage, textToCanvas } from '../pixelate.js';
import { pageHead, backLink } from './common.js';

const KINDS = [...SLOTS.map(([s, l]) => [`wear:${s}`, `착용 · ${l}`]), ['bg:base', '배경 · 바탕 (화면 전체)'], ['bg:deco', '배경 · 소품 (포스터 · 글자 등)']];
// 종류별 기본값: 크기(긴 변 픽셀), 아바타 기준 위치
const PRESET = {
  hat: { size: 30, x: 1, y: 0 },
  face: { size: 18, x: 6, y: 15 },
  top: { size: 22, x: 4, y: 28 },
  bottom: { size: 16, x: 8, y: 47 },
  shoes: { size: 22, x: 3, y: 57 },
  hand: { size: 18, x: 22, y: 28 },
  deco: { size: 28 },
  base: { size: 80 },
};
// 소품 처음 위치: 왼쪽 위 벽 (아바타와 안 겹치게)
const decoPos = (cv) => ({ x: 3, y: Math.max(2, Math.min(8, 56 - cv.height)) });
const kindText = (it) => (it.cat === 'wear' ? `착용 · ${SLOT_LABEL[it.slot]}` : BG_LABEL[it.slot]);

// 카테고리 필터 (상점과 같은 순서) · 판매 중지 보기 — 화면이 다시 그려져도 유지
const FILTERS = [['all', '전체'], ...SLOTS, ['base', '배경'], ['deco', '소품']];
const view = { filter: 'all', showOff: false };
const rerender = () => window.dispatchEvent(new Event('rerender'));

export function itemsAdmin() {
  const all = itemsMap();
  const sold = new Map();
  state.purchases.forEach((p) => sold.set(p.itemId, (sold.get(p.itemId) || 0) + 1));
  const inCat = (it) => view.filter === 'all' || it.slot === view.filter;
  const byPrice = (a, b) => a.price - b.price || a.name.localeCompare(b.name, 'ko');
  const custom = [...customItems()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const builtin = BUILTIN_ITEMS.filter((b) => !b.hidden).map((b) => all.get(b.id));
  const count = (k) => [...custom, ...builtin].filter((it) => it.active !== false && (k === 'all' || it.slot === k)).length;
  const mine = custom.filter(inCat);
  const onSale = builtin.filter((it) => inCat(it) && it.active !== false).sort(byPrice);
  const off = builtin.filter((it) => inCat(it) && it.active === false).sort(byPrice);

  const row = (it, onclick) =>
    h(
      'button',
      { class: 'rank-row' + (it.active === false ? ' dim' : ''), onclick },
      h('span', { class: 'row-thumb' }, itemThumb(it, 40)),
      h('span', { class: 'rank-main' }, h('strong', {}, it.name), h('small', {}, `${kindText(it)} · 구매 ${sold.get(it.id) || 0}명${it.active === false ? ' · 판매 중지' : ''}${it.edited ? ' · 수정함' : ''}`)),
      h('span', { class: 'sp' }, it.price, h('small', {}, '볼'))
    );
  const catLabel = FILTERS.find(([k]) => k === view.filter)[1];
  return h(
    'div',
    { class: 'page' },
    backLink('#/admin', '관리자'),
    pageHead('아바타 아이템', 'Items', h('button', { class: 'btn primary small', onclick: () => itemSheet() }, '+ 추가')),
    h('p', { class: 'muted small' }, '종류를 골라서 보고, 아이템을 누르면 이름 · 가격 · 판매 여부를 고칠 수 있어요.'),
    h('div', { class: 'sticky-bar' }, h('div', { class: 'chips-scroll' }, FILTERS.map(([k, l]) => h('button', { class: 'chip' + (view.filter === k ? ' on' : ''), onclick: () => { view.filter = k; rerender(); } }, `${l} ${count(k)}`)))),
    view.filter !== 'all' && onSale.length + mine.length > 0 &&
      h('button', { class: 'btn ghost block', onclick: () => bulkPriceSheet(catLabel, [...mine.filter((it) => it.active !== false), ...onSale]) }, `${catLabel} 가격 한꺼번에 바꾸기`),
    mine.length > 0 && [h('h2', {}, `직접 등록한 아이템 ${mine.length}개`), h('div', { class: 'rank-list' }, mine.map((it) => row(it, () => itemSheet(it))))],
    h('h2', {}, `기본 아이템 · 판매 중 ${onSale.length}개`),
    onSale.length ? h('div', { class: 'rank-list' }, onSale.map((it) => row(it, () => builtinSheet(it)))) : empty('이 종류의 판매 중인 기본 아이템이 없어요'),
    off.length > 0 &&
      h('button', { class: 'btn ghost block', onclick: () => { view.showOff = !view.showOff; rerender(); } }, view.showOff ? '판매 중지 아이템 숨기기' : `판매 중지 아이템 ${off.length}개 보기`),
    view.showOff && off.length > 0 && h('div', { class: 'rank-list' }, off.map((it) => row(it, () => builtinSheet(it))))
  );
}

// 카테고리 가격 한꺼번에: +/- 볼 (판매 중인 아이템만, 0볼 아래로는 안 내려감)
function bulkPriceSheet(label, list) {
  sheet(`${label} 가격 바꾸기`, (close) => {
    const delta = h('input', { class: 'input', type: 'number', inputmode: 'numeric', placeholder: '예) -40 (내리기) · 20 (올리기)' });
    const preview = h('p', { class: 'muted small' });
    const d = () => Math.round(Number(delta.value) || 0);
    const show = () => {
      const ps = list.map((it) => Math.max(0, it.price + d()));
      preview.textContent = `판매 중 ${list.length}개 → ${Math.min(...ps)}~${Math.max(...ps)}볼`;
    };
    delta.addEventListener('input', show);
    show();
    return h(
      'div',
      { class: 'stack' },
      field('얼마나 바꿀까요? (볼)', delta, '마이너스(-)를 붙이면 내려요. 이미 산 사람의 볼은 그대로예요.'),
      preview,
      h(
        'button',
        {
          class: 'btn primary block',
          onclick: async () => {
            if (!d()) return toast('바꿀 볼 수를 입력해 주세요');
            const now = Date.now();
            await batch(
              list.map((it) => ({
                type: 'put',
                col: 'items',
                doc: BUILTIN_ITEMS.some((b) => b.id === it.id)
                  ? { id: it.id, name: it.name, price: Math.max(0, it.price + d()), active: it.active !== false, updatedAt: now }
                  : { ...state.items.find((x) => x.id === it.id), price: Math.max(0, it.price + d()), updatedAt: now },
              }))
            );
            close();
            toast(`${list.length}개 가격을 바꿨어요`);
          },
        },
        '한꺼번에 바꾸기'
      )
    );
  });
}

// 기본 아이템: 이름 · 가격 · 판매 여부만 (같은 id 문서에 저장)
function builtinSheet(it) {
  const orig = BUILTIN_ITEMS.find((b) => b.id === it.id);
  sheet(it.name, (close) => {
    const name = h('input', { class: 'input', value: it.name, maxLength: 20 });
    const price = h('input', { class: 'input', type: 'number', min: 0, value: it.price });
    const active = h('input', { type: 'checkbox', checked: it.active !== false });
    return h(
      'div',
      { class: 'stack' },
      h('div', { class: 'thumb-big' }, itemThumb(it, 160)),
      field('이름', name, `원래 이름: ${orig.name}`),
      field('가격 (볼)', price, `원래 가격: ${orig.price}볼`),
      h('label', { class: 'check' }, active, ' 상점에서 판매'),
      h('p', { class: 'muted small' }, '판매를 멈춰도 이미 산 사람은 계속 쓸 수 있어요. 가격을 바꿔도 이미 산 사람의 볼은 그대로예요.'),
      h(
        'button',
        {
          class: 'btn primary block',
          onclick: async () => {
            if (!name.value.trim()) return toast('이름을 입력해 주세요');
            await put('items', { id: it.id, name: name.value.trim(), price: Math.max(0, Number(price.value) || 0), active: active.checked, updatedAt: Date.now() });
            close();
            toast('저장했어요');
          },
        },
        '저장'
      ),
      it.edited &&
        h(
          'button',
          {
            class: 'btn ghost block',
            onclick: async () => {
              await remove('items', it.id);
              close();
              toast('원래대로 되돌렸어요');
            },
          },
          '원래대로 되돌리기'
        )
    );
  });
}

// 새 아이템 등록 / 등록한 아이템 수정 (이름 · 가격 · 판매 · 그림 · 위치)
function itemSheet(orig = null) {
  const editing = !!orig;
  sheet(editing ? orig.name : '아이템 추가', (close) => {
    const st = { mode: editing ? 'keep' : 'photo', src: null, canvas: null, keep: null };
    const name = h('input', { class: 'input', maxLength: 20, placeholder: '예) 페더러 포스터', value: orig?.name || '' });
    const kind = select({ class: 'input' }, KINDS, editing ? `${orig.cat}:${orig.slot}` : 'bg:deco');
    kind.disabled = editing;
    const price = h('input', { class: 'input', type: 'number', min: 0, value: orig?.price ?? 50 });
    const active = h('input', { type: 'checkbox', checked: orig?.active !== false });
    const file = h('input', { class: 'input', type: 'file', accept: 'image/*' });
    const text = h('textarea', { class: 'input', rows: 2, maxLength: 24, placeholder: '예) OFFCOURT\n(줄바꿈 3줄까지)' });
    const color = h('input', { class: 'input color', type: 'color', value: '#1d5294' });
    const font = select({ class: 'input' }, [['sans', '고딕'], ['serif', '세리프']], 'sans');
    const size = h('input', { type: 'range', min: 6, max: 72, value: 28 });
    const colors = h('input', { type: 'range', min: 2, max: 16, value: 10 });
    const rmBg = h('input', { type: 'checkbox', checked: true });
    const outline = h('input', { type: 'checkbox', checked: true });
    const px = h('input', { type: 'range', min: -10, max: 34, value: orig?.x ?? 0 });
    const py = h('input', { type: 'range', min: -10, max: 66, value: orig?.y ?? 0 });
    const pxLbl = h('span', {});
    const pyLbl = h('span', {});
    const sizeLbl = h('span', {});
    const colorsLbl = h('span', {});
    const big = h('div', { class: 'thumb-big checker' });
    const stage = h('div', { class: 'stage-wrap small' });
    const photoBox = h('div', { class: 'stack' }, field('사진', file, '사진은 이 기기에서 바로 변환돼요 (원본은 올라가지 않아요)'));
    const textBox = h('div', { class: 'stack' }, field('글자', text), h('div', { class: 'grid2' }, field('색', color), field('글꼴', font)));
    const posBox = h(
      'div',
      { class: 'stack' },
      h('div', { class: 'grid2' }, field(h('span', {}, '가로 위치 ', pxLbl), px), field(h('span', {}, '세로 위치 ', pyLbl), py)),
      editing && h('p', { class: 'muted small' }, '위치를 바꾸면 이 아이템을 입은 모든 회원의 아바타에 바로 적용돼요.')
    );
    const sizeField = field(h('span', {}, '크기 ', sizeLbl), size, '긴 변의 픽셀 수');
    const convBox = h(
      'div',
      { class: 'stack' },
      sizeField,
      field(h('span', {}, '색 개수 ', colorsLbl), colors, '적을수록 더 도트 느낌'),
      h('div', { class: 'row gap wrap' }, h('label', { class: 'check' }, rmBg, ' 배경 지우기'), h('label', { class: 'check' }, outline, ' 테두리'))
    );
    const modeSeg = h('div', { class: 'seg small' });
    const MODES = editing ? [['keep', '지금 그림'], ['photo', '새 사진'], ['text', '새 글자']] : [['photo', '사진'], ['text', '글자']];

    const slotOf = () => kind.value.split(':');
    const applyPreset = () => {
      const [cat, slot] = slotOf();
      const p = PRESET[slot];
      size.value = p.size;
      if (cat === 'wear' && !editing) {
        px.value = p.x;
        py.value = p.y;
      }
      rmBg.checked = slot !== 'base';
      outline.checked = slot !== 'base';
      render();
    };
    const renderMode = () => {
      modeSeg.replaceChildren(
        ...MODES.map(([k, l]) =>
          h('button', { class: st.mode === k ? 'on' : '', onclick: () => { st.mode = k; if (k === 'text') { colors.value = 3; rmBg.checked = false; } renderMode(); render(); } }, l)
        )
      );
      photoBox.hidden = st.mode !== 'photo';
      textBox.hidden = st.mode !== 'text';
      convBox.hidden = st.mode === 'keep';
    };

    let raf = 0;
    function render() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const [cat, slot] = slotOf();
        posBox.hidden = cat !== 'wear';
        sizeField.hidden = slot === 'base';
        sizeLbl.textContent = `${size.value}px`;
        colorsLbl.textContent = colors.value;
        pxLbl.textContent = px.value;
        pyLbl.textContent = py.value;
        if (st.mode === 'keep') {
          st.canvas = st.keep;
        } else {
          const src = st.mode === 'photo' ? st.src : text.value.trim() ? textToCanvas(text.value, { color: color.value, font: font.value }) : null;
          st.canvas = src
            ? pixelate(src, {
                size: slot === 'base' ? STAGE_W : Number(size.value),
                colors: Number(colors.value),
                removeBg: rmBg.checked,
                outline: outline.checked,
                cover: slot === 'base',
              })
            : null;
        }
        if (!st.canvas) {
          big.replaceChildren(h('span', { class: 'muted small' }, st.mode === 'keep' ? '그림을 불러오는 중…' : st.mode === 'photo' ? '사진을 골라 주세요' : '글자를 입력해 주세요'));
          stage.replaceChildren();
          return;
        }
        const shown = st.canvas.cloneNode();
        shown.getContext('2d').drawImage(st.canvas, 0, 0);
        shown.className = 'pixel';
        big.replaceChildren(scaleTo(shown, 180));
        // 기본 아바타에 입혀 / 놓아 보기
        const tmp = { id: '__preview', cat, slot, canvas: st.canvas, x: Number(px.value), y: Number(py.value) };
        const items = new Map(itemsMap()).set(tmp.id, tmp);
        const look = { ...DEFAULT_LOOK, wear: {}, deco: [] };
        if (cat === 'wear') look.wear[slot] = tmp.id;
        else if (slot === 'base') look.base = tmp.id;
        else look.deco = [{ id: tmp.id, ...decoPos(st.canvas) }];
        stage.replaceChildren(stageCanvas(look, items));
      });
    }

    // 수정: 지금 그림을 캔버스로 불러옴 (다시 변환하지 않음 → 화질 그대로)
    if (editing && orig.img) {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        cv.getContext('2d').drawImage(img, 0, 0);
        st.keep = cv;
        render();
      };
      img.src = orig.img;
    }

    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        st.src = await fileToImage(f);
        if (!name.value) name.value = f.name.replace(/\.[^.]+$/, '').slice(0, 20);
      } catch (e) {
        toast(e.message);
      }
      render();
    });
    [text, color, font, size, colors, rmBg, outline, px, py].forEach((el) => el.addEventListener('input', render));
    kind.addEventListener('change', applyPreset);

    const save = async () => {
      if (!name.value.trim()) return toast('이름을 입력해 주세요');
      if (!st.canvas) return toast(st.mode === 'photo' ? '사진을 골라 주세요' : st.mode === 'text' ? '글자를 입력해 주세요' : '그림을 불러오는 중이에요');
      const [cat, slot] = slotOf();
      const newPic = st.mode !== 'keep';
      const img = newPic ? st.canvas.toDataURL('image/png') : orig.img;
      if (img.length > 200000) return toast('그림이 너무 커요. 크기나 색 개수를 줄여 주세요');
      const it = {
        ...(orig || { id: uid('it_'), cat, slot, createdAt: Date.now() }),
        name: name.value.trim(),
        price: Math.max(0, Number(price.value) || 0),
        active: active.checked,
        img,
        w: st.canvas.width,
        h: st.canvas.height,
      };
      if (editing) it.updatedAt = Date.now();
      if (cat === 'wear') Object.assign(it, { x: Number(px.value), y: Number(py.value) });
      if (slot === 'deco' && (newPic || !editing)) Object.assign(it, decoPos(st.canvas));
      await put('items', it);
      close();
      toast(editing ? '저장했어요' : '아이템을 등록했어요');
    };

    const del = async () => {
      if (!(await confirmSheet('아이템 삭제', `${orig.name}을(를) 지울까요?\n이미 산 사람의 아바타에서도 사라져요. 볼은 돌려주지 않아요.`, '삭제', true))) return;
      await remove('items', orig.id);
      close();
      toast('삭제했어요');
    };

    renderMode();
    applyPreset();
    return h(
      'div',
      { class: 'stack' },
      field('이름', name),
      h('div', { class: 'grid2' }, field('종류', kind, editing ? '종류는 바꿀 수 없어요' : null), field('가격 (볼)', price)),
      editing && h('label', { class: 'check' }, active, ' 상점에서 판매'),
      editing && h('p', { class: 'muted small' }, '판매를 멈춰도 이미 산 사람은 계속 쓸 수 있어요. 그림을 바꾸면 이미 산 사람의 아바타도 새 그림으로 바뀌어요.'),
      modeSeg,
      photoBox,
      textBox,
      h('div', { class: 'preview-pair' }, big, stage),
      convBox,
      posBox,
      h('button', { class: 'btn primary block', onclick: save }, editing ? '저장' : '등록'),
      editing && h('button', { class: 'btn ghost block danger-text', onclick: del }, '삭제')
    );
  });
}
