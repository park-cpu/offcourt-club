// ─────────────────────────────────────────────────────────────
// 관리자: 아바타 아이템 등록 (사진 · 글자 → 픽셀 이미지 자동 변환)
// ─────────────────────────────────────────────────────────────
import { h, sheet, toast, field, select, confirmSheet, empty } from '../ui.js';
import { state, itemsMap } from '../store.js';
import { put, remove, uid } from '../db.js';
import { BUILTIN_ITEMS } from '../avatar-items.js';
import { stageCanvas, itemThumb, scaleTo, SLOTS, SLOT_LABEL, BG_LABEL, DEFAULT_LOOK, STAGE_W } from '../pixel.js';
import { pixelate, fileToImage, textToCanvas } from '../pixelate.js';
import { pageHead, backLink } from './common.js';

const KINDS = [...SLOTS.map(([s, l]) => [`wear:${s}`, `착용 · ${l}`]), ['bg:base', '배경 · 바탕 (화면 전체)'], ['bg:deco', '배경 · 소품 (포스터 · 글자 등)']];
// 종류별 기본값: 크기(긴 변 픽셀), 아바타 기준 위치
const PRESET = {
  hat: { size: 22, x: 5, y: 0 },
  face: { size: 16, x: 8, y: 11 },
  top: { size: 16, x: 8, y: 22 },
  bottom: { size: 14, x: 9, y: 33 },
  shoes: { size: 14, x: 9, y: 42 },
  hand: { size: 16, x: 22, y: 16 },
  deco: { size: 28 },
  base: { size: 80 },
};
// 소품 처음 위치: 왼쪽 위 벽 (아바타와 안 겹치게)
const decoPos = (cv) => ({ x: 4, y: Math.max(2, Math.min(8, 56 - cv.height)) });
const kindText = (it) => (it.cat === 'wear' ? `착용 · ${SLOT_LABEL[it.slot]}` : BG_LABEL[it.slot]);

export function itemsAdmin() {
  const list = [...state.items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const sold = new Map();
  state.purchases.forEach((p) => sold.set(p.itemId, (sold.get(p.itemId) || 0) + 1));
  const row = (it, onclick) =>
    h(
      onclick ? 'button' : 'div',
      { class: 'rank-row' + (it.active === false ? ' dim' : ''), onclick },
      h('span', { class: 'row-thumb' }, itemThumb(it, 40)),
      h('span', { class: 'rank-main' }, h('strong', {}, it.name), h('small', {}, `${kindText(it)} · 구매 ${sold.get(it.id) || 0}명${it.active === false ? ' · 판매 중지' : ''}`)),
      h('span', { class: 'sp' }, it.price, h('small', {}, '볼'))
    );
  return h(
    'div',
    { class: 'page' },
    backLink('#/admin', '관리자'),
    pageHead('아바타 아이템', 'Items', h('button', { class: 'btn primary small', onclick: () => newItemSheet() }, '+ 추가')),
    h('p', { class: 'muted small' }, '사진이나 글자를 넣으면 픽셀 그림으로 바꿔서 등록해요. 사진은 배경이 단순할수록 깔끔하게 나와요.'),
    list.length ? h('div', { class: 'rank-list' }, list.map((it) => row(it, () => editItemSheet(it)))) : empty('아직 등록한 아이템이 없어요'),
    h('details', { class: 'block' }, h('summary', {}, h('h2', { class: 'inline' }, `기본 아이템 ${BUILTIN_ITEMS.length}개`)), h('div', { class: 'rank-list' }, BUILTIN_ITEMS.map((it) => row(it))))
  );
}

function editItemSheet(it) {
  sheet(it.name, (close) => {
    const name = h('input', { class: 'input', value: it.name, maxLength: 20 });
    const price = h('input', { class: 'input', type: 'number', min: 0, value: it.price });
    const active = h('input', { type: 'checkbox', checked: it.active !== false });
    return h(
      'div',
      { class: 'stack' },
      h('div', { class: 'thumb-big' }, itemThumb(it, 160)),
      field('이름', name),
      field('가격 (볼)', price),
      h('label', { class: 'check' }, active, ' 상점에서 판매'),
      h('p', { class: 'muted small' }, '판매를 멈춰도 이미 산 사람은 계속 쓸 수 있어요.'),
      h(
        'button',
        {
          class: 'btn primary block',
          onclick: async () => {
            if (!name.value.trim()) return toast('이름을 입력해 주세요');
            await put('items', { ...it, name: name.value.trim(), price: Math.max(0, Number(price.value) || 0), active: active.checked });
            close();
            toast('저장했어요');
          },
        },
        '저장'
      ),
      h(
        'button',
        {
          class: 'btn ghost block danger-text',
          onclick: async () => {
            if (!(await confirmSheet('아이템 삭제', `${it.name}을(를) 지울까요?\n이미 산 사람의 아바타에서도 사라져요. 볼은 돌려주지 않아요.`, '삭제', true))) return;
            await remove('items', it.id);
            close();
            toast('삭제했어요');
          },
        },
        '삭제'
      )
    );
  });
}

function newItemSheet() {
  sheet('아이템 추가', (close) => {
    const st = { mode: 'photo', src: null, canvas: null };
    const name = h('input', { class: 'input', maxLength: 20, placeholder: '예) 페더러 포스터' });
    const kind = select({ class: 'input' }, KINDS, 'bg:deco');
    const price = h('input', { class: 'input', type: 'number', min: 0, value: 50 });
    const file = h('input', { class: 'input', type: 'file', accept: 'image/*' });
    const text = h('textarea', { class: 'input', rows: 2, maxLength: 24, placeholder: '예) OFFCOURT\n(줄바꿈 3줄까지)' });
    const color = h('input', { class: 'input color', type: 'color', value: '#1d5294' });
    const font = select({ class: 'input' }, [['sans', '고딕'], ['serif', '세리프']], 'sans');
    const size = h('input', { type: 'range', min: 8, max: 64, value: 28 });
    const colors = h('input', { type: 'range', min: 2, max: 16, value: 10 });
    const rmBg = h('input', { type: 'checkbox', checked: true });
    const outline = h('input', { type: 'checkbox', checked: true });
    const px = h('input', { type: 'range', min: -10, max: 40, value: 0 });
    const py = h('input', { type: 'range', min: -10, max: 56, value: 0 });
    const sizeLbl = h('span', {});
    const colorsLbl = h('span', {});
    const big = h('div', { class: 'thumb-big checker' });
    const stage = h('div', { class: 'stage-wrap small' });
    const photoBox = h('div', { class: 'stack' }, field('사진', file, '사진은 이 기기에서 바로 변환돼요 (원본은 올라가지 않아요)'));
    const textBox = h('div', { class: 'stack' }, field('글자', text), h('div', { class: 'grid2' }, field('색', color), field('글꼴', font)));
    const posBox = h('div', { class: 'grid2' }, field('가로 위치', px), field('세로 위치', py));
    const sizeField = field(h('span', {}, '크기 ', sizeLbl), size, '긴 변의 픽셀 수');
    const modeSeg = h('div', { class: 'seg small' });

    const slotOf = () => kind.value.split(':');
    const applyPreset = () => {
      const [cat, slot] = slotOf();
      const p = PRESET[slot];
      size.value = p.size;
      if (cat === 'wear') {
        px.value = p.x;
        py.value = p.y;
      }
      rmBg.checked = slot !== 'base';
      outline.checked = slot !== 'base';
      render();
    };
    const renderMode = () => {
      modeSeg.replaceChildren(
        ...[['photo', '사진'], ['text', '글자']].map(([k, l]) => h('button', { class: st.mode === k ? 'on' : '', onclick: () => { st.mode = k; if (k === 'text') { colors.value = 3; rmBg.checked = false; } renderMode(); render(); } }, l))
      );
      photoBox.hidden = st.mode !== 'photo';
      textBox.hidden = st.mode !== 'text';
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
        const src = st.mode === 'photo' ? st.src : text.value.trim() ? textToCanvas(text.value, { color: color.value, font: font.value }) : null;
        if (!src) {
          st.canvas = null;
          big.replaceChildren(h('span', { class: 'muted small' }, st.mode === 'photo' ? '사진을 골라 주세요' : '글자를 입력해 주세요'));
          stage.replaceChildren();
          return;
        }
        st.canvas = pixelate(src, {
          size: slot === 'base' ? STAGE_W : Number(size.value),
          colors: Number(colors.value),
          removeBg: rmBg.checked,
          outline: outline.checked,
          cover: slot === 'base',
        });
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
      if (!st.canvas) return toast(st.mode === 'photo' ? '사진을 골라 주세요' : '글자를 입력해 주세요');
      const img = st.canvas.toDataURL('image/png');
      if (img.length > 200000) return toast('그림이 너무 커요. 크기나 색 개수를 줄여 주세요');
      const [cat, slot] = slotOf();
      const it = { id: uid('it_'), name: name.value.trim(), cat, slot, price: Math.max(0, Number(price.value) || 0), img, w: st.canvas.width, h: st.canvas.height, active: true, createdAt: Date.now() };
      if (cat === 'wear') Object.assign(it, { x: Number(px.value), y: Number(py.value) });
      if (slot === 'deco') Object.assign(it, decoPos(st.canvas));
      await put('items', it);
      close();
      toast('아이템을 등록했어요');
    };

    renderMode();
    applyPreset();
    return h(
      'div',
      { class: 'stack' },
      field('이름', name),
      h('div', { class: 'grid2' }, field('종류', kind), field('가격 (볼)', price)),
      modeSeg,
      photoBox,
      textBox,
      h('div', { class: 'preview-pair' }, big, stage),
      sizeField,
      field(h('span', {}, '색 개수 ', colorsLbl), colors, '적을수록 더 도트 느낌'),
      h('div', { class: 'row gap wrap' }, h('label', { class: 'check' }, rmBg, ' 배경 지우기'), h('label', { class: 'check' }, outline, ' 테두리')),
      posBox,
      h('button', { class: 'btn primary block', onclick: save }, '등록')
    );
  });
}
