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
  // 새 버전이 적용되면 안내 (처음 설치 때는 제외)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || document.getElementById('update-bar')) return;
    document.body.append(
      h('button', { id: 'update-bar', class: 'update-bar', onclick: () => location.reload() }, '새 버전이 있어요 · 눌러서 새로고침')
    );
  });
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
