// ─────────────────────────────────────────────────────────────
// 홈 화면 앱 설치 + 서비스 워커 등록
// ─────────────────────────────────────────────────────────────
import { h, sheet, toast } from './ui.js';
import { APP_VERSION } from './version.js';

let deferred = null; // 안드로이드 크롬의 설치 프롬프트

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => !/android/i.test(navigator.userAgent) && /iphone|ipad|ipod/i.test(navigator.userAgent) || (!/android/i.test(navigator.userAgent) && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function setupApp() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    window.dispatchEvent(new Event('rerender'));
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    toast('홈 화면에 설치했어요');
  });
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register(`sw.js?v=${encodeURIComponent(APP_VERSION)}`)
    .then((reg) => {
      // 앱을 켜둔 채로 다시 열 때 새 버전 확인
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
    })
    .catch((e) => console.warn('service worker', e));
  // 새 서비스 워커가 적용됐을 때 (처음 설치 때는 제외) (v1.13.5~)
  // · 지금 화면이 이미 그 버전이면 아무것도 안 함 (당겨서 새로고침으로 새 버전을 받은 경우)
  // · 화면이 예전 버전이면 자동으로 새로고침. 단 입력 창이 열려 있거나 랠리 게임 중이면 버튼으로 안내
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || document.getElementById('update-bar')) return;
    const swVer = new URL(navigator.serviceWorker.controller?.scriptURL || location.href).searchParams.get('v');
    if (!swVer || swVer === APP_VERSION) return;
    const busy = document.querySelector('.sheet-wrap') || location.hash.startsWith('#/rally');
    if (!busy) return hardReload();
    document.body.append(
      h('button', { id: 'update-bar', class: 'update-bar', onclick: () => location.reload() }, '새 버전이 있어요 · 눌러서 새로고침')
    );
  });
}

/** 최신 파일로 다시 불러오기: 이 화면이 쓰는 js · css를 서버에서 새로 받은 뒤 새로고침 (v1.13.5~)
 *  새 버전 자동 적용에서 사용. app.js의 당겨서 새로고침에도 같은 코드가 있음
 *  (업데이트 직후 예전 파일이 섞여도 안 깨지게 일부러 export 하지 않음) */
async function hardReload() {
  const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  const urls = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((u) => u.startsWith(location.origin) && /\/(js|css)\//.test(u));
  urls.push(new URL('js/version.js', location.href).href);
  await Promise.race([
    Promise.all([...urls.map((u) => fetch(u, { cache: 'reload' }).catch(() => {})), reg?.update().catch(() => {})]),
    new Promise((r) => setTimeout(r, 4000)), // 느린 인터넷이면 4초 뒤 그냥 새로고침
  ]);
  location.reload();
}

/** 내 정보 화면의 "앱으로 설치" 메뉴 (이미 앱이면 숨김) */
export function installRow() {
  if (isStandalone()) return null;
  return h('button', { class: 'link-row', onclick: installNow }, h('span', {}, '📲 앱으로 설치 (홈 화면에 추가)'), h('span', { class: 'muted' }, '›'));
}

async function installNow() {
  if (deferred) {
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    return;
  }
  sheet('앱으로 설치', () =>
    h(
      'div',
      { class: 'install-box' },
      isIOS()
        ? [
            h('p', {}, '아이폰은 Safari에서 설치해요.'),
            h('ol', {}, h('li', {}, 'Safari로 이 주소를 열기'), h('li', {}, '아래쪽 공유 버튼(□↑) 누르기'), h('li', {}, '“홈 화면에 추가” 누르기'), h('li', {}, '오른쪽 위 “추가”')),
          ]
        : [
            h('p', {}, '안드로이드는 Chrome에서 설치해요.'),
            h('ol', {}, h('li', {}, 'Chrome으로 이 주소를 열기'), h('li', {}, '오른쪽 위 ⋮ 메뉴'), h('li', {}, '“앱 설치” 또는 “홈 화면에 추가”')),
          ],
      h('p', { class: 'muted small' }, '카카오톡 안에서 열린 화면에서는 설치가 안 돼요. 오른쪽 아래 ⋯ → “다른 브라우저로 열기”를 먼저 눌러 주세요.')
    )
  );
}
