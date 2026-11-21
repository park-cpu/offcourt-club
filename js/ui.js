// 작은 DOM 헬퍼 + 바텀시트 + 토스트
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), guard(el, v));
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && k !== 'form') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
// 비동기 클릭 핸들러: 처리 중 버튼 잠금(두 번 눌림 방지) + 실패 시 안내
function guard(el, fn) {
  return (e) => {
    if (el.dataset.busy) return;
    let r;
    try {
      r = fn(e);
    } catch (err) {
      return reportError(err);
    }
    if (r && typeof r.then === 'function') {
      el.dataset.busy = '1';
      r.catch(reportError).finally(() => delete el.dataset.busy);
    }
  };
}
export function reportError(err) {
  console.error(err);
  const msg = String(err?.code || err?.message || err);
  toast(/permission|denied/i.test(msg) ? '저장 권한이 없어요 (서버 규칙 확인 필요)' : /offline|unavailable|network/i.test(msg) ? '인터넷 연결을 확인해 주세요' : '저장하지 못했어요. 다시 시도해 주세요');
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
export function sheet(title, build, onClose) {
  const root = document.getElementById('sheets');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    onClose?.();
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
    let answer = false;
    sheet(
      title,
      (close) =>
        h(
          'div',
          {},
          h('p', { class: 'muted pre' }, message),
          h(
            'div',
            { class: 'row gap' },
            h('button', { class: 'btn ghost grow', onclick: close }, '취소'),
            h('button', { class: `btn grow ${danger ? 'danger' : 'primary'}`, onclick: () => { answer = true; close(); } }, okLabel)
          )
        ),
      () => resolve(answer)
    );
  });
}

// 입력칸 + 라벨. 버튼 묶음(남/여 등)은 <label>로 감싸면 클릭이 첫 버튼으로 넘어가므로 <div> 사용
export const field = (label, input, hint) => {
  const isControl = input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement;
  return h(isControl ? 'label' : 'div', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint && h('span', { class: 'field-hint' }, hint));
};

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
export const fmtShortRange = (a, b) => {
  const [, am, ad] = a.split('-').map(Number);
  const [, bm, bd] = b.split('-').map(Number);
  return `${am}.${ad} – ${bm}.${bd}`;
};

// 화면이 DOM에 붙은 직후 실행할 작업 (스크롤 위치 등)
const mountQueue = [];
export const onMount = (fn) => mountQueue.push(fn);
export const flushMount = () => mountQueue.splice(0).forEach((fn) => fn());
