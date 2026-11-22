import { h, empty, pct, fmtNum, ntrpText, toast, confirmSheet } from '../ui.js';
import { state, settings, currentSeason, seasonStats, derived, activePlayers, careerText, me, isAdmin, fmtShort, today } from '../store.js';
import { put, uid } from '../db.js';
import { ratingToNtrp, RULES, matchOrder, canBorrow, computeRelations } from '../rules.js';
import { pageHead, backLink, matchCard, nameTag } from './common.js';
import { scoreSheet } from './play.js';

// type: 'official'(공식전 시즌 순위) | 'coin'(코인전 랭킹)
export function rankList(season, type = 'official') {
  const st = seasonStats(season, type);
  const min = settings().minGames;
  const rows = activePlayers().map((p) => ({ ...p, ...st.get(p.id) }));
  const sort = (a, b) => b.sp - a.sp || b.winRate - a.winRate || b.games - a.games;
  return {
    ranked: rows.filter((r) => r.games >= min).sort(sort),
    pending: rows.filter((r) => r.games > 0 && r.games < min).sort(sort),
    min,
  };
}

const RANK_TABS = [
  ['official', '공식전'],
  ['coin', '코인전'],
  ['rating', '레이팅'],
];

// #/rank → 공식전(현재 시즌) · #/rank/coin[/시즌] · #/rank/official/시즌 · #/rank/rating
export function rankView(a, b) {
  const seasons = [...settings().seasons].sort((x, y) => y.start.localeCompare(x.start));
  const mode = a === 'rating' || a === 'coin' || a === 'official' ? a : 'official';
  const sid = a === 'coin' || a === 'official' ? b : a;
  const season = mode !== 'rating' ? seasons.find((s) => s.id === sid) || currentSeason() : null;

  const tabs = h(
    'nav',
    { class: 'seg' },
    RANK_TABS.map(([k, label]) => h('a', { class: mode === k ? 'on' : '', href: k === 'rating' ? '#/rank/rating' : `#/rank/${k}${season ? '/' + season.id : ''}` }, label))
  );

  if (mode === 'rating') return h('div', { class: 'page' }, pageHead('순위', 'Ranking'), tabs, ratingTable());

  if (!season)
    return h('div', { class: 'page' }, pageHead('순위', 'Ranking'), tabs, empty('등록된 시즌이 없어요. 관리자 메뉴에서 시즌을 만들어 주세요.'));

  const isCoin = mode === 'coin';
  const { ranked, pending, min } = rankList(season, mode);
  const myId = me()?.id;
  const coinText = (n) => `코인 ${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
  const row = (r, i) =>
    h(
      'a',
      { class: 'rank-row' + (r.id === myId ? ' me' : '') + (i != null && i < 3 ? ' top' : ''), href: `#/p/${r.id}` },
      h('span', { class: 'rank-num' }, i == null ? '–' : i + 1),
      h(
        'span',
        { class: 'rank-main' },
        h('strong', {}, r.name),
        h('small', {}, isCoin ? `${r.wins}승 ${r.losses}패 · ${pct(r.winRate)} · ${coinText(r.coins)}` : `${r.wins}승 ${r.losses}패 · ${pct(r.winRate)} · NTRP ${ntrpText(r.ntrp)}`)
      ),
      h('span', { class: 'sp' }, Math.round(r.sp), h('small', {}, 'pt'))
    );

  return h(
    'div',
    { class: 'page' },
    pageHead('순위', 'Ranking'),
    tabs,
    seasons.length > 1 &&
      h('div', { class: 'chips-scroll' }, seasons.map((s) => h('a', { class: 'chip' + (s.id === season.id ? ' on' : ''), href: `#/rank/${mode}/${s.id}` }, s.name))),
    h('section', { class: 'season-band' }, h('strong', {}, `${season.name} · ${isCoin ? '코인전' : '공식전'}`), h('span', {}, `${fmtShort(season.start)} – ${fmtShort(season.end)}`)),
    h(
      'p',
      { class: 'muted small' },
      isCoin
        ? `코인전 경기만 반영 · 포인트 = 레이팅 변동 + 경기당 ${RULES.participationBonus}점 + 코인 순수익 × ${RULES.coinPoint}점`
        : `공식전 경기만 반영 · 포인트 = 레이팅 변동 + 경기당 ${RULES.participationBonus}점`
    ),
    ranked.length ? h('div', { class: 'rank-list' }, ranked.map((r, i) => row(r, i))) : empty(`아직 ${isCoin ? '코인전' : '공식전'} ${min}경기 이상 치른 사람이 없어요`),
    pending.length > 0 &&
      h('section', { class: 'block' }, h('h2', {}, `순위 산정 대기 (${min}경기 미만)`), h('div', { class: 'rank-list dim' }, pending.map((r) => row(r, null)))),
    h('a', { class: 'link-row', href: '#/rules' }, h('span', {}, '점수는 어떻게 계산되나요?'), h('span', { class: 'muted' }, '›'))
  );
}

function ratingTable() {
  const { ratings, allStats } = derived();
  const rows = activePlayers()
    .map((p) => ({ ...p, r: ratings.get(p.id), s: allStats.get(p.id) }))
    .sort((a, b) => b.r - a.r);
  return h(
    'div',
    { class: 'stack' },
    h('p', { class: 'muted small' }, '레이팅은 시즌과 관계없이 누적되는 실력 지표예요. 대진 밸런스에 사용됩니다.'),
    h(
      'div',
      { class: 'rank-list' },
      rows.map((r, i) =>
        h(
          'a',
          { class: 'rank-row', href: `#/p/${r.id}` },
          h('span', { class: 'rank-num' }, i + 1),
          h('span', { class: 'rank-main' }, h('strong', {}, r.name), h('small', {}, `NTRP ${ntrpText(r.ntrp)} → 추정 ${ratingToNtrp(r.r).toFixed(1)} · ${r.s.games}경기`)),
          h('span', { class: 'sp' }, Math.round(r.r))
        )
      )
    )
  );
}

// ── 개인 프로필 ───────────────────────────────────────
export function profileView(id) {
  const p = state.players.find((x) => x.id === id);
  if (!p) return h('div', { class: 'page' }, backLink('#/rank'), empty('없는 회원이에요'));
  const { ratings, allStats, coins } = derived();
  const season = currentSeason();
  const ss = season ? seasonStats(season, 'official').get(id) : null;
  const cs = season ? seasonStats(season, 'coin').get(id) : null;
  const rankOf = (type) => {
    if (!season) return '';
    const i = rankList(season, type).ranked.findIndex((r) => r.id === id);
    return i >= 0 ? ` · ${i + 1}위` : '';
  };
  const s = allStats.get(id);
  const r = ratings.get(id);
  const bal = coins.bal.get(id) ?? 0;
  const myMatches = state.matches
    .filter((m) => m.status === 'done' && m.type !== 'friendly' && [...m.teamA, ...m.teamB].includes(id))
    .sort(matchOrder)
    .reverse();
  const ledger = coins.ledger.get(id) || [];

  return h(
    'div',
    { class: 'page' },
    backLink('#/rank', '순위'),
    h(
      'section',
      { class: 'hero hero-p' },
      h('div', { class: 'hero-top' }, h('span', {}, `NTRP ${ntrpText(p.ntrp)}`), h('span', {}, `구력 ${careerText(p.since)}`)),
      h('div', { class: 'pname-big' }, p.name),
      h('div', { class: 'hero-bottom' }, h('span', {}, s.form.length ? s.form.join(' ') : '경기 기록 없음'), h('span', {}, `최고 ${s.best}연승`))
    ),
    h(
      'div',
      { class: 'stat-grid' },
      big('코인', bal, bal <= 0 ? 'warn' : '', (coins.debt.get(id) ?? 0) > 0 ? `남은 대출 ${coins.debt.get(id)}` : ''),
      big('레이팅', Math.round(r), '', `추정 NTRP ${ratingToNtrp(r).toFixed(1)}`),
      big('통산', `${s.wins}-${s.losses}`, '', `승률 ${pct(s.winRate)}`),
      big('공식전 포인트', ss && ss.games ? Math.round(ss.sp) : '-', '', ss && ss.games ? `${ss.wins}승 ${ss.losses}패${rankOf('official')}` : '이번 시즌 기록 없음'),
      big('코인전 포인트', cs && cs.games ? Math.round(cs.sp) : '-', '', cs && cs.games ? `${cs.wins}승 ${cs.losses}패 · 코인 ${fmtNum(cs.coins)}${rankOf('coin')}` : '이번 시즌 기록 없음')
    ),
    loanBlock(p, coins),
    relationBlocks(id),
    h(
      'section',
      { class: 'block' },
      h('h2', {}, '최근 경기'),
      myMatches.length ? myMatches.slice(0, 8).map((m) => matchCard(m, { showDate: true, onEdit: scoreSheet })) : h('p', { class: 'muted' }, '기록된 경기가 없어요')
    ),
    h(
      'details',
      { class: 'block' },
      h('summary', {}, h('h2', { class: 'inline' }, `코인 내역 · 잔액 ${bal}`)),
      h('ul', { class: 'ledger' }, ledger.map((l) => h('li', {}, h('span', { class: 'muted small' }, l.date ? fmtShort(l.date) : ''), h('span', { class: 'grow' }, l.reason), h('strong', { class: l.amount > 0 ? 'up' : 'down' }, fmtNum(l.amount)))))
    )
  );
}

// ── 파트너 궁합 · 상대 전적 ─────────────────────────────
function relationBlocks(id) {
  const players = new Set(state.players.map((x) => x.id));
  const { partners, opponents } = computeRelations(id, state.matches, players);
  if (!partners.length && !opponents.length) return null;
  const row = (x, kind) =>
    h(
      'li',
      { class: 'rel-row' },
      h('a', { class: 'rel-name', href: `#/p/${x.id}` }, nameTag(x.id)),
      h('span', { class: 'rel-bar' }, h('i', { style: `width:${Math.round((x.wins / x.games) * 100)}%` })),
      h('span', { class: 'rel-num' }, kind === 'p' ? `${pct(x.wins / x.games)}` : `${x.wins}승 ${x.losses}패`, h('small', {}, ` · ${x.games}경기`))
    );
  const list = (title, hint, arr, kind) => {
    if (!arr.length) return null;
    const head = arr.slice(0, 5);
    const rest = arr.slice(5);
    return h(
      'section',
      { class: 'block' },
      h('div', { class: 'row between' }, h('h2', {}, title), h('span', { class: 'muted small' }, hint)),
      h('ul', { class: 'rel' }, head.map((x) => row(x, kind))),
      rest.length > 0 && h('details', {}, h('summary', { class: 'link small' }, `${rest.length}명 더 보기`), h('ul', { class: 'rel' }, rest.map((x) => row(x, kind))))
    );
  };
  // 궁합 요약: 2경기 이상 같이 뛴 파트너 중 승률 최고
  const best = partners.filter((x) => x.games >= 2).sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)[0];
  const nemesis = opponents.filter((x) => x.games >= 2 && x.losses > x.wins).sort((a, b) => b.losses - b.wins - (a.losses - a.wins))[0];
  return [
    (best || nemesis) &&
      h(
        'div',
        { class: 'stat-grid two' },
        best && big('찰떡 파트너', state.players.find((x) => x.id === best.id)?.name || '-', 'name', `함께 ${best.wins}승 ${best.losses}패`),
        nemesis && big('천적', state.players.find((x) => x.id === nemesis.id)?.name || '-', 'name', `상대 ${nemesis.wins}승 ${nemesis.losses}패`)
      ),
    list('파트너 궁합', '함께 뛴 승률', partners, 'p'),
    list('상대 전적', '내 기준 승패', opponents, 'o'),
  ];
}

// ── 대출 ──────────────────────────────────────────────
function loanBlock(p, coins) {
  const u = me();
  if (!u || (u.id !== p.id && !isAdmin())) return null;
  const bal = coins.bal.get(p.id) ?? 0;
  const debt = coins.debt.get(p.id) ?? 0;
  const amt = settings().loanAmount;
  if (!canBorrow(coins, p.id) && debt === 0) return null;
  const log = (kind, amount) => put('coinLogs', { id: uid('c_'), playerId: p.id, kind, amount, date: today(), by: u.id, at: Date.now() });
  const borrow = async () => {
    if (!(await confirmSheet('코인 대출', `${amt}개를 대출할까요?\n상환 전까지 출석 코인은 대출 상환에 쓰여요.`, '대출 받기'))) return;
    await log('loan', amt);
    toast(`${amt}코인 대출 완료`);
  };
  const repay = async () => {
    const n = Math.min(bal, debt);
    if (!(await confirmSheet('대출 상환', `보유 코인 ${n}개로 대출을 갚을까요?`, '상환'))) return;
    await log('repay', n);
    toast('상환했어요');
  };
  const forgive = async () => {
    if (!(await confirmSheet('대출 탕감', `${p.name}님의 남은 대출 ${debt}개를 탕감할까요?`, '탕감', true))) return;
    await log('forgive', 0);
  };
  return h(
    'section',
    { class: 'block loan' },
    h('div', { class: 'row between' }, h('h2', {}, '코인 대출'), debt > 0 && h('span', { class: 'type type-coin' }, `상환 남음 ${debt}`)),
    debt === 0
      ? [
          h('p', { class: 'muted small' }, `코인이 0개 이하일 때 ${amt}개를 빌릴 수 있어요. 상환 전까지 출석 코인이 자동으로 상환에 쓰이고, 대출은 한 번에 하나만 가능해요.`),
          h('button', { class: 'btn primary block', onclick: borrow }, `${amt}코인 대출 받기`),
        ]
      : [
          h('p', { class: 'muted small' }, '출석할 때마다 1개씩 자동 상환돼요. 코인이 있으면 지금 바로 갚을 수도 있어요.'),
          h('div', { class: 'row gap' },
            h('button', { class: 'btn ghost grow', disabled: bal <= 0, onclick: repay }, bal > 0 ? `보유 코인으로 ${Math.min(bal, debt)}개 상환` : '상환할 코인 없음'),
            isAdmin() && h('button', { class: 'btn ghost danger', onclick: forgive }, '탕감')
          ),
        ]
  );
}

const big = (label, value, cls = '', sub = '') => h('div', { class: 'big-stat ' + cls }, h('span', { class: 'l' }, label), h('span', { class: 'v' }, value), sub && h('span', { class: 's' }, sub));

// ── 점수 규칙 안내 ────────────────────────────────────
export function rulesView() {
  const sec = (title, ...body) => h('section', { class: 'block prose' }, h('h2', {}, title), ...body);
  return h(
    'div',
    { class: 'page' },
    backLink('#/rank', '순위'),
    pageHead('점수 규칙', 'How it works'),
    sec(
      '1. 레이팅 (실력 지표)',
      h('p', {}, h('strong', {}, 'NTRP는 출발선, 레이팅은 그 뒤 실제 경기로 쌓이는 실력 점수예요.')),
      h('p', {}, `모든 회원은 NTRP로 시작 레이팅을 받아요. NTRP 3.0 = ${RULES.ratingBase}점, 0.5 차이마다 ${RULES.ratingPerNtrp / 2}점.`),
      h('table', { class: 'rule-table' },
        h('tr', {}, h('th', {}, 'NTRP'), ...[2.5, 3.0, 3.5, 4.0].map((n) => h('td', {}, n.toFixed(1)))),
        h('tr', {}, h('th', {}, '시작 레이팅'), ...[2.5, 3.0, 3.5, 4.0].map((n) => h('td', {}, Math.round(RULES.ratingBase + (n - 3) * RULES.ratingPerNtrp))))
      ),
      h('h3', {}, '왜 NTRP로 시작하나요?'),
      h('ul', {},
        h('li', {}, '모두 같은 점수로 시작하면 잘 치는 사람과 입문자가 한동안 똑같이 취급돼요. 출발선을 실력에 맞게 나눠 둬요.'),
        h('li', {}, '자동 대진은 양 팀 레이팅 평균이 비슷하게 짜요. 첫날부터 균형 잡힌 대진이 나오려면 시작 점수가 필요해요. 게스트도 입력한 NTRP로 계산해요.')
      ),
      h('h3', {}, '점수는 어떻게 움직이나요?'),
      h('p', {}, '경기 전 두 팀의 평균 레이팅으로 "이길 확률"을 계산하고, 결과가 예상과 얼마나 다른지에 따라 오르내려요 (Elo 방식).'),
      h('p', { class: 'muted' }, '예) 1000점 팀 vs 1200점 팀 → 1000점 팀이 이길 확률 약 24%. 1000점 팀이 이기면 약 +24점, 1200점 팀이 이기면 약 +8점 (처음 10경기, 점수차 ×1.0 기준).'),
      h('ul', {}, h('li', {}, '강한 상대를 이기면 → 크게 상승'), h('li', {}, '이길 만한 상대를 이기면 → 조금 상승'), h('li', {}, '약한 상대에게 지면 → 크게 하락')),
      h('h3', {}, '추정 NTRP'),
      h('p', {}, '프로필의 "추정 NTRP"는 지금 레이팅을 NTRP로 바꿔 보여준 값이에요. "처음엔 3.0이었는데 지금 경기력은 3.5 수준"처럼 볼 수 있어요.'),
      h('h3', {}, 'NTRP를 잘못 적었다면?'),
      h('p', {}, '경기를 하면 레이팅이 실제 실력 쪽으로 조금씩 움직이지만, 복식은 팀 평균으로 계산돼서 꽤 오래 걸려요 (0.5 차이를 반 정도 메우는 데 30경기 이상). 그래서 시작 NTRP가 확실히 틀렸다면 관리자에게 수정을 요청해 주세요. NTRP를 고치면 지난 경기까지 처음부터 다시 계산돼 바로 반영돼요.')
    ),
    sec(
      '2. 점수차 반영',
      h('p', {}, '7:6, 7:5, 6:5 = ×1.0 / 6:4 = ×1.1 / 6:3 = ×1.2 / 6:2 = ×1.3 / 6:1 = ×1.4 / 6:0 = ×1.5'),
      h('p', {}, `처음 ${RULES.provisionalGames}경기는 실력이 빨리 자리 잡도록 변동폭이 커요 (K=${RULES.kProvisional} → 이후 ${RULES.kNormal}).`)
    ),
    sec(
      '3. 시즌 순위 (공식전 · 코인전 따로)',
      h('p', {}, '순위는 공식전과 코인전을 따로 운영해요. 각 순위에는 그 유형의 경기만 반영돼요. 레이팅은 두 유형 모두에서 함께 쌓여요.'),
      h('ul', {},
        h('li', {}, h('strong', {}, '공식전 포인트'), ` = 공식전 레이팅 변동 합계 + 경기당 ${RULES.participationBonus}점`),
        h('li', {}, h('strong', {}, '코인전 포인트'), ` = 코인전 레이팅 변동 합계 + 경기당 ${RULES.participationBonus}점 + 코인 순수익 × ${RULES.coinPoint}점`)
      ),
      h('p', { class: 'muted' }, `코인 순수익 = 코인전에서 딴 코인 − 잃은 코인 (베이글 ±2 포함). 출석·관리자 지급·대출 코인은 포함하지 않아요. 예) 코인전 5승 3패, 베이글 승 1번 → 순수익 +3 → +${3 * RULES.coinPoint}점`),
      h('p', { class: 'muted' }, `레이팅은 처음 ${RULES.provisionalGames}경기 동안 크게 움직이지만, 시즌 포인트는 모두 같은 기준(K=${RULES.kSeason})으로 계산해요. 그래서 신입 회원이라고 포인트가 더 크게 오르내리지 않아요.`),
      h('p', {}, '원래 잘 치는 사람이 항상 1등이 되지 않도록, "자기 수준 대비 얼마나 잘했는지"로 순위를 매겨요. 입문자도 기대 이상으로 이기면 1등이 될 수 있어요.'),
      h('p', {}, `각 순위마다 그 유형으로 최소 ${settings().minGames}경기를 치러야 순위에 올라요 (몇 판만 이기고 멈추는 것 방지). 동점이면 승률 → 경기 수 순.`)
    ),
    sec(
      '4. 경기 유형',
      h('ul', {}, h('li', {}, '코인전: 승패 · 레이팅 · 코인 모두 반영'), h('li', {}, '공식전: 승패 · 레이팅 반영, 코인 없음'), h('li', {}, '친선전: 출석만, 승패 기록 없음'), h('li', {}, '게스트가 낀 경기: 점수는 남지만 승패·레이팅·순위에서 제외'))
    ),
    sec(
      '5. 코인',
      h('ul', {},
        h('li', {}, `가입 시 ${settings().initialCoins}개, 출석(도착 체크)마다 +${settings().attendCoin}개`),
        h('li', {}, '코인전: 모두 1개씩 걸고 승리팀이 가져감 → 승리 각 +1, 패배 각 −1'),
        h('li', {}, '베이글(6:0, 7:0 등 상대 0게임) → 각 2개'),
        h('li', {}, '코인전에서 지면 잔액이 마이너스가 될 수 있어요. 코인이 1개 미만이면 코인전 대신 공식전으로 자동 전환'),
        h('li', {}, `대출: 잔액 0 이하 + 남은 대출 없음 → ${settings().loanAmount}개 대출. 상환 전까지 출석 코인이 상환에 쓰이고, 보유 코인으로 바로 갚을 수도 있어요`),
        h('li', {}, '점수를 수정·취소하면 코인과 레이팅이 자동으로 다시 계산돼요')
      )
    )
  );
}
