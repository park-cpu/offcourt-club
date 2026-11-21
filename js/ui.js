// 작은 DOM 헬퍼 + 바텀시트 + 토스트
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && k !== 'form') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export const go = (hash) => {
  location.hash = hash;
};

export function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

/** 바텀시트. build(close) 는 내용 노드를 반환 */
export function sheet(title, build) {
  const root = document.getElementById('sheets');
  const close = () => {
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 250);
  };
  const body = h('div', { class: 'sheet-body' });
  const wrap = h(
    'div',
    { class: 'sheet-wrap', onclick: (e) => e.target === wrap && close() },
    h(
      'div',
      { class: 'sheet', role: 'dialog', 'aria-label': title },
      h('div', { class: 'sheet-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': '닫기' }, '✕')),
      body
    )
  );
  body.append(build(close));
  root.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  return close;
}

export function confirmSheet(title, message, okLabel = '확인', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const close = sheet(title, (close) =>
      h(
        'div',
        {},
        h('p', { class: 'muted pre' }, message),
        h(
          'div',
          { class: 'row gap' },
          h('button', { class: 'btn ghost grow', onclick: () => { done = true; close(); resolve(false); } }, '취소'),
          h('button', { class: `btn grow ${danger ? 'danger' : 'primary'}`, onclick: () => { done = true; close(); resolve(true); } }, okLabel)
        )
      )
    );
    void close;
  });
}

export const field = (label, input, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint && h('span', { class: 'field-hint' }, hint));

export const select = (props, options, value) =>
  h(
    'select',
    props,
    options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l))
  );

export const empty = (text, action) => h('div', { class: 'empty' }, h('p', {}, text), action);

export const fmtNum = (n, d = 0) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d);
export const pct = (x) => Math.round(x * 100) + '%';

export const NTRP_OPTIONS = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5].map((n) => [n, n.toFixed(1)]);
export const ntrpText = (n) => (Number(n) || 0).toFixed(1);
