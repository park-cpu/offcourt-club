import { h, sheet, toast, confirmSheet, ntrpText } from '../ui.js';
import { me, isAdmin, session, derived, careerText } from '../store.js';
import { db } from '../db.js';
import { pageHead, loginSheet, linkRow, playerForm } from './common.js';
import { APP_VERSION } from '../version.js';
import { installRow } from '../install.js';

export function meView() {
  const u = me();
  const foot = h(
    'p',
    { class: 'muted small center' },
    `Offcourt Club ${APP_VERSION}`,
    db.mode === 'local' && h('span', { class: 'warn-inline' }, ' · 체험 모드 (이 기기에만 저장)')
  );
  if (!u)
    return h(
      'div',
      { class: 'page' },
      pageHead('내 정보', 'Member'),
      h(
        'section',
        { class: 'block center' },
        h('img', { src: 'assets/badge.png', alt: '', class: 'badge-img' }),
        h('p', {}, '로그인하면 참가 신청, 출석, 점수 기록을 할 수 있어요.'),
        h('button', { class: 'btn primary block', onclick: () => loginSheet() }, '로그인'),
        h('p', { class: 'muted small' }, '회원 등록은 관리자가 해요. PIN을 모르면 관리자에게 물어보세요.')
      ),
      linkRow('점수 · 코인 규칙', '#/rules'),
      h('nav', { class: 'menu' }, installRow()),
      foot
    );

  const { coins } = derived();
  return h(
    'div',
    { class: 'page' },
    pageHead(u.name, isAdmin() ? 'Admin · Member' : 'Member'),
    h(
      'section',
      { class: 'block' },
      h('dl', { class: 'kv' }, h('dt', {}, 'NTRP'), h('dd', {}, ntrpText(u.ntrp)), h('dt', {}, '구력'), h('dd', {}, careerText(u.since)), h('dt', {}, '코인'), h('dd', {}, coins.bal.get(u.id) ?? 0))
    ),
    h(
      'nav',
      { class: 'menu' },
      linkRow('내 아바타 꾸미기', '#/avatar', `🎾 ${derived().balls.bal.get(u.id) ?? 0} ›`),
      linkRow('회원 아바타 구경', '#/avatars'),
      linkRow('내 전적 · 코인 내역', `#/p/${u.id}`),
      h('button', { class: 'link-row', onclick: () => editMe(u) }, h('span', {}, '내 정보 · PIN 변경'), h('span', { class: 'muted' }, '›')),
      linkRow('점수 · 코인 규칙', '#/rules'),
      installRow(),
      isAdmin() && linkRow('관리자 메뉴', '#/admin'),
      h(
        'button',
        {
          class: 'link-row',
          onclick: async () => {
            if (await confirmSheet('로그아웃', '이 기기에서 로그아웃할까요?', '로그아웃')) {
              session.clear();
              window.dispatchEvent(new Event('rerender'));
            }
          },
        },
        h('span', {}, '로그아웃'),
        h('span', { class: 'muted' }, '›')
      )
    ),
    foot
  );
}

function editMe(u) {
  sheet('내 정보 수정', (close) =>
    playerForm(u, {
      onSaved: () => {
        close();
        toast('저장했어요');
      },
    }).node
  );
}
