// ─────────────────────────────────────────────────────────────
// 아바타 꾸미기 · 상점 · 미션 · 구경하기
// ─────────────────────────────────────────────────────────────
import { h, sheet, toast, confirmSheet, empty, fmtNum } from '../ui.js';
import { state, me, derived, itemsMap, lookOf, ownedSet, today, weekStart, fmtShort, activePlayers, weekRules, ballRulesAt } from '../store.js';
import { put, uid } from '../db.js';
import { missionLabel } from '../rules.js';
import {
  drawStage, stageCanvas, itemThumb, sourceOf, LOOK_VERSION, SLOTS, SLOT_LABEL, BG_LABEL, SKINS, HAIRS_BY_SEX, HAIR_COLORS, DEFAULT_LOOK, STAGE_W, STAGE_H,
} from '../pixel.js';
import { pageHead, backLink, loginSheet } from './common.js';

const MAX_DECO = 8;
const ballText = (n) => `🎾 ${n}`;

// 편집 중인 모습 (화면이 다시 그려져도 유지, 저장 전까지 서버에 안 씀)
const ed = { id: null, look: null, dirty: false, tab: 'closet', filter: 'all', sel: null };
const sameLook = (a, b) => JSON.stringify(pick(a)) === JSON.stringify(pick(b));
const pick = (l) => ({ skin: l.skin, hair: l.hair, hairColor: l.hairColor, wear: l.wear || {}, base: l.base || null, deco: l.deco || [], sex: l.sex, v: LOOK_VERSION });

export const shopItems = () => [...itemsMap().values()].filter((it) => it.active !== false);

// ── 꾸미기 화면 ───────────────────────────────────────
export function avatarView(tab) {
  const u = me();
  if (!u)
    return h('div', { class: 'page' }, pageHead('아바타', 'Avatar'), empty('로그인하면 아바타를 꾸밀 수 있어요', h('button', { class: 'btn primary', onclick: () => loginSheet() }, '로그인')));
  if (ed.id !== u.id) Object.assign(ed, { id: u.id, look: structuredClone(pick(lookOf(u.id))), dirty: false, sel: null });
  // 다른 기기에서 저장된 게 있고 편집 중이 아니면 최신으로
  if (!ed.dirty) ed.look = structuredClone(pick(lookOf(u.id)));
  if (tab) ed.tab = tab;
  const items = itemsMap();
  const owned = ownedSet(u.id);
  const bal = derived().balls.bal.get(u.id) ?? 0;
  const rerender = () => window.dispatchEvent(new Event('rerender'));
  const change = (fn) => {
    fn(ed.look);
    ed.dirty = !sameLook(ed.look, lookOf(u.id));
    rerender();
  };

  // 무대 (소품은 끌어서 옮기기)
  const cv = document.createElement('canvas');
  cv.width = STAGE_W;
  cv.height = STAGE_H;
  cv.className = 'pixel stage big';
  const redraw = () => drawStage(cv.getContext('2d'), ed.look, items, { selected: ed.sel });
  redraw();
  stageDrag(cv, items, redraw, () => {
    ed.dirty = !sameLook(ed.look, lookOf(u.id));
    rerender();
  });

  const save = async () => {
    await put('avatars', { id: u.id, ...pick(ed.look), updatedAt: Date.now() });
    ed.dirty = false;
    ed.sel = null;
    toast('저장했어요');
    rerender();
  };
  const selDeco = ed.sel != null && ed.look.deco[ed.sel];

  const tabs = h(
    'div',
    { class: 'seg small' },
    [['closet', '옷장'], ['shop', '상점'], ['missions', '미션']].map(([k, l]) => h('a', { class: ed.tab === k ? 'on' : '', href: `#/avatar/${k}` }, l))
  );
  const body = ed.tab === 'shop' ? shopTab(u, items, owned, bal, change) : ed.tab === 'missions' ? missionsTab(u) : closetTab(items, owned, change);

  return h(
    'div',
    { class: 'page' },
    backLink('#/me', '내 정보'),
    pageHead('아바타', 'Avatar', h('a', { class: 'ball-chip', href: '#/avatar/missions' }, ballText(bal))),
    h('div', { class: 'stage-wrap' }, cv),
    selDeco
      ? h(
          'div',
          { class: 'row gap' },
          h('span', { class: 'muted small grow' }, `${items.get(selDeco.id)?.name || '소품'} · 끌어서 옮기기`),
          h('button', { class: 'btn small ghost', onclick: () => change((l) => { l.deco.push(l.deco.splice(ed.sel, 1)[0]); ed.sel = l.deco.length - 1; }) }, '맨 앞으로'),
          h('button', { class: 'btn small ghost', onclick: () => change((l) => { l.deco.splice(ed.sel, 1); ed.sel = null; }) }, '빼기')
        )
      : h('p', { class: 'muted small center' }, ed.look.deco.length ? '소품을 눌러 선택하고 끌어서 옮길 수 있어요' : '상점에서 산 아이템으로 꾸며 보세요'),
    ed.dirty &&
      h(
        'div',
        { class: 'save-bar' },
        h('button', { class: 'btn ghost', onclick: () => { ed.look = structuredClone(pick(lookOf(u.id))); ed.dirty = false; ed.sel = null; rerender(); } }, '되돌리기'),
        h('button', { class: 'btn primary grow', onclick: save }, '저장하기')
      ),
    h('div', { class: 'sticky-bar' }, tabs),
    body
  );
}

// 평소엔 무대 위에서도 화면 스크롤 가능. 소품을 선택한 동안만 끌기 모드(스크롤 잠금)
function stageDrag(cv, items, redraw, done) {
  let drag = null;
  const grab = () => cv.classList.toggle('grab', ed.sel != null);
  grab();
  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * STAGE_W, ((e.clientY - r.top) / r.height) * STAGE_H];
  };
  cv.addEventListener('pointerdown', (e) => {
    const [x, y] = pos(e);
    const deco = ed.look.deco;
    for (let i = deco.length - 1; i >= 0; i--) {
      const src = sourceOf(items.get(deco[i].id));
      if (src && x >= deco[i].x && y >= deco[i].y && x < deco[i].x + src.width && y < deco[i].y + src.height) {
        ed.sel = i;
        grab();
        drag = { i, dx: x - deco[i].x, dy: y - deco[i].y, w: src.width, h: src.height, moved: false };
        try { cv.setPointerCapture(e.pointerId); } catch {}
        redraw();
        return;
      }
    }
    if (ed.sel != null) {
      ed.sel = null;
      grab();
      done();
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    e.preventDefault();
    const [x, y] = pos(e);
    const d = ed.look.deco[drag.i];
    d.x = Math.max(-drag.w + 4, Math.min(STAGE_W - 4, Math.round(x - drag.dx)));
    d.y = Math.max(-drag.h + 4, Math.min(STAGE_H - 4, Math.round(y - drag.dy)));
    drag.moved = true;
    redraw();
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    done();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
}

// ── 옷장: 기본 모습 + 가진 아이템 ───────────────────────
function closetTab(items, owned, change) {
  const L = ed.look;
  const mine = [...owned].map((id) => items.get(id)).filter(Boolean);
  const swatch = (color, on, onclick) => h('button', { class: 'swatch' + (on ? ' on' : ''), style: { background: color }, onclick, 'aria-label': '색' });

  const wearRows = SLOTS.map(([slot, label]) => {
    const list = mine.filter((it) => it.cat === 'wear' && it.slot === slot);
    if (!list.length) return null;
    return h(
      'div',
      { class: 'closet-row' },
      h('p', { class: 'eyebrow' }, label),
      h(
        'div',
        { class: 'item-grid' },
        h('button', { class: 'item-tile none' + (!L.wear[slot] ? ' on' : ''), onclick: () => change((l) => delete l.wear[slot]) }, h('span', { class: 'none-x' }, '없음')),
        list.map((it) => h('button', { class: 'item-tile' + (L.wear[slot] === it.id ? ' on' : ''), onclick: () => change((l) => (l.wear[slot] === it.id ? delete l.wear[slot] : (l.wear[slot] = it.id))) }, itemThumb(it), h('span', {}, it.name)))
      )
    );
  });
  const bases = mine.filter((it) => it.cat === 'bg' && it.slot === 'base');
  const decos = mine.filter((it) => it.cat === 'bg' && it.slot === 'deco');

  return h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'block' },
      h('h2', {}, '기본 모습'),
      h('p', { class: 'eyebrow' }, '피부색'),
      h('div', { class: 'row gap wrap' }, SKINS.map((c, i) => swatch(c, L.skin === i, () => change((l) => (l.skin = i))))),
      h('p', { class: 'eyebrow' }, '헤어'),
      h('div', { class: 'chips-wrap' }, (HAIRS_BY_SEX[L.sex] || HAIRS_BY_SEX.M).map(([k, label]) => h('button', { class: 'chip' + (L.hair === k ? ' on' : ''), onclick: () => change((l) => (l.hair = k)) }, label))),
      h('p', { class: 'eyebrow' }, '머리색'),
      h('div', { class: 'row gap wrap' }, HAIR_COLORS.map((c, i) => swatch(c, L.hairColor === i, () => change((l) => (l.hairColor = i)))))
    ),
    h(
      'section',
      { class: 'block' },
      h('h2', {}, '착용 아이템'),
      wearRows.some(Boolean) ? wearRows : h('p', { class: 'muted' }, '아직 가진 아이템이 없어요. 상점에서 골라 보세요.'),
    ),
    h(
      'section',
      { class: 'block' },
      h('h2', {}, '배경'),
      h(
        'div',
        { class: 'item-grid' },
        h('button', { class: 'item-tile none' + (!L.base ? ' on' : ''), onclick: () => change((l) => (l.base = null)) }, h('span', { class: 'none-x' }, '기본'), h('span', {}, '빈 배경')),
        bases.map((it) => h('button', { class: 'item-tile' + (L.base === it.id ? ' on' : ''), onclick: () => change((l) => (l.base = it.id)) }, itemThumb(it), h('span', {}, it.name)))
      ),
      decos.length > 0 && h('p', { class: 'eyebrow' }, `소품 (최대 ${MAX_DECO}개 · 누르면 놓기/빼기)`),
      decos.length > 0 &&
        h(
          'div',
          { class: 'item-grid' },
          decos.map((it) => {
            const placed = L.deco.findIndex((d) => d.id === it.id);
            return h(
              'button',
              {
                class: 'item-tile' + (placed >= 0 ? ' on' : ''),
                onclick: () =>
                  change((l) => {
                    if (placed >= 0) {
                      l.deco.splice(placed, 1);
                      ed.sel = null;
                    } else if (l.deco.length >= MAX_DECO) toast(`소품은 ${MAX_DECO}개까지 놓을 수 있어요`);
                    else {
                      l.deco.push({ id: it.id, x: it.x ?? 30, y: it.y ?? 30 });
                      ed.sel = l.deco.length - 1;
                    }
                  }),
              },
              itemThumb(it),
              h('span', {}, it.name)
            );
          })
        )
    )
  );
}

// ── 상점 ───────────────────────────────────────────────
const FILTERS = [['all', '전체'], ...SLOTS, ['base', '배경'], ['deco', '소품']];

function shopTab(u, items, owned, bal, change) {
  const list = shopItems()
    .filter((it) => ed.filter === 'all' || it.slot === ed.filter)
    .sort((a, b) => (owned.has(a.id) - owned.has(b.id)) || (b.builtin ? 0 : 1) - (a.builtin ? 0 : 1) || a.price - b.price);
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'chips-scroll' }, FILTERS.map(([k, l]) => h('button', { class: 'chip' + (ed.filter === k ? ' on' : ''), onclick: () => { ed.filter = k; window.dispatchEvent(new Event('rerender')); } }, l))),
    list.length
      ? h(
          'div',
          { class: 'item-grid shop' },
          list.map((it) =>
            h(
              'button',
              { class: 'item-tile' + (owned.has(it.id) ? ' owned' : ''), onclick: () => buySheet(u, it, owned, bal, change) },
              itemThumb(it),
              h('span', {}, it.name),
              h('small', { class: owned.has(it.id) ? 'muted' : bal >= it.price ? '' : 'down' }, owned.has(it.id) ? '보유' : ballText(it.price))
            )
          )
        )
      : empty('이 종류의 아이템이 아직 없어요')
  );
}

function buySheet(u, it, owned, bal, change) {
  const items = itemsMap();
  // 미리보기: 지금 모습에 이 아이템을 입혀 봄
  const look = structuredClone(ed.look);
  if (it.cat === 'wear') look.wear[it.slot] = it.id;
  else if (it.slot === 'base') look.base = it.id;
  else if (!look.deco.some((d) => d.id === it.id)) look.deco.push({ id: it.id, x: it.x ?? 30, y: it.y ?? 30 });
  const has = owned.has(it.id);
  const apply = () =>
    change((l) => {
      if (it.cat === 'wear') l.wear[it.slot] = it.id;
      else if (it.slot === 'base') l.base = it.id;
      else if (!l.deco.some((d) => d.id === it.id) && l.deco.length < MAX_DECO) l.deco.push({ id: it.id, x: it.x ?? 30, y: it.y ?? 30 });
    });
  sheet(it.name, (close) =>
    h(
      'div',
      { class: 'stack' },
      h('div', { class: 'stage-wrap small' }, stageCanvas(look, items)),
      h('p', { class: 'muted center' }, `${it.cat === 'wear' ? SLOT_LABEL[it.slot] : BG_LABEL[it.slot]} · ${ballText(it.price)}`),
      has
        ? h('button', { class: 'btn primary block', onclick: () => { apply(); close(); toast('적용했어요 · 저장을 눌러 주세요'); } }, '착용하기')
        : h(
            'button',
            {
              class: 'btn primary block',
              disabled: bal < it.price,
              onclick: async () => {
                if (!(await confirmSheet('구매', `${it.name}을(를) ${it.price}볼에 살까요?\n남는 볼: ${bal - it.price}`, '구매'))) return;
                await put('purchases', { id: `${u.id}_${it.id}`, playerId: u.id, itemId: it.id, itemName: it.name, price: it.price, date: today(), at: Date.now() });
                apply();
                close();
                toast('구매했어요 · 저장을 누르면 반영돼요');
              },
            },
            bal < it.price ? `볼이 ${it.price - bal}개 부족해요` : `${ballText(it.price)} 구매`
          )
    )
  );
}

// ── 미션 · 볼 내역 ──────────────────────────────────────
function missionsTab(u) {
  const B = ballRulesAt(today());
  const W = weekRules(weekStart(today()));
  const { balls } = derived();
  const wk = balls.weeks.get(u.id)?.get(weekStart(today())) || { attend: 0, play: 0, win: 0 };
  const ledger = balls.ledger.get(u.id) || [];
  return h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'block' },
      h('h2', {}, '이번 주 미션'),
      W.weekly.length ? W.weekly.map((m) => {
        const n = Math.min(wk[m.kind], m.goal);
        return h(
          'div',
          { class: 'mission' + (n >= m.goal ? ' done' : '') },
          h('div', { class: 'row between' }, h('strong', {}, missionLabel(m)), h('span', { class: 'small' }, n >= m.goal ? `완료 +${m.reward}` : `${n} / ${m.goal} · +${m.reward}`)),
          h('div', { class: 'bar' }, h('span', { style: { width: `${(n / m.goal) * 100}%` } }))
        );
      }) : h('p', { class: 'muted small' }, '이번 주 미션이 없어요.'),
      h('p', { class: 'muted small' }, '월요일에 새로 시작해요. 목표를 채우면 볼이 자동으로 들어와요.')
    ),
    h(
      'section',
      { class: 'block' },
      h('h2', {}, '볼 모으는 법'),
      h('ul', { class: 'plain' }, h('li', {}, `도착 체크 +${B.attend}`), h('li', {}, `경기 1번 +${B.play} (친선전 포함)`), h('li', {}, `승리 +${B.win} 추가`), h('li', {}, '주간 미션 보너스')),
      h('p', { class: 'muted small' }, '볼은 아바타 꾸미기에만 쓰여요. 코인전 코인과는 따로예요.')
    ),
    h(
      'details',
      { class: 'block' },
      h('summary', {}, h('h2', { class: 'inline' }, `볼 내역 · ${derived().balls.bal.get(u.id) ?? 0}`)),
      h('ul', { class: 'ledger' }, ledger.slice(0, 80).map((l) => h('li', {}, h('span', { class: 'muted small' }, l.date ? fmtShort(l.date) : ''), h('span', { class: 'grow' }, l.reason), h('strong', { class: l.amount > 0 ? 'up' : 'down' }, fmtNum(l.amount)))))
    )
  );
}

// ── 구경하기 ───────────────────────────────────────────
export function galleryView() {
  const items = itemsMap();
  const u = me();
  const updated = new Map(state.avatars.map((a) => [a.id, a.updatedAt || 0]));
  const list = activePlayers().sort((a, b) => (updated.get(b.id) || 0) - (updated.get(a.id) || 0));
  return h(
    'div',
    { class: 'page' },
    backLink('#/rank', '순위'),
    pageHead('아바타 구경', 'Gallery', u && h('a', { class: 'btn small primary', href: '#/avatar' }, '내 아바타')),
    h(
      'div',
      { class: 'gallery' },
      list.map((p) => h('a', { class: 'gallery-card', href: `#/p/${p.id}` }, stageCanvas(lookOf(p.id), items), h('strong', {}, p.name)))
    )
  );
}

/** 프로필 화면용 아바타 카드 */
export function avatarBlock(playerId) {
  const u = me();
  const mine = u && u.id === playerId;
  return h(
    'section',
    { class: 'avatar-block' },
    h('div', { class: 'stage-wrap' }, stageCanvas(lookOf(playerId), itemsMap())),
    h('div', { class: 'row gap' }, mine && h('a', { class: 'btn small primary grow', href: '#/avatar' }, '꾸미기'), h('a', { class: 'btn small ghost grow', href: '#/avatars' }, '다른 회원 구경'))
  );
}
