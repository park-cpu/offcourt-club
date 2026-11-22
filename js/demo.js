// 체험 모드용 가상 데이터 (실존 인물 아님)
import { db, uid } from './db.js';
import { hashPin, today, addDays, weekStart, session, DEFAULT_SETTINGS } from './store.js';
import { generate } from './matchmaker.js';
import { ntrpToRating, expected } from './rules.js';
import { BUILTIN_ITEMS } from './avatar-items.js';

const NAMES = [
  ['한도윤', 4.0, '2016-04', 'M'], ['서지후', 3.5, '2019-09', 'M'], ['문하린', 3.0, '2021-03', 'F'], ['배시우', 3.5, '2018-06', 'M'],
  ['오유나', 2.5, '2023-05', 'F'], ['장태오', 3.0, '2020-11', 'M'], ['신아윤', 2.5, '2024-02', 'F'], ['권도현', 4.0, '2015-07', 'M'],
  ['황서진', 3.0, '2022-01', 'F'], ['송이안', 2.0, '2025-03', 'F'], ['류채원', 3.5, '2019-04', 'F'], ['임준서', 2.5, '2023-09', 'M'],
  ['전하은', 3.0, '2021-08', 'F'], ['노지안', 2.0, '2025-06', 'M'],
];

export async function seedDemo() {
  const now = Date.now();
  const players = [];
  for (const [i, [name, ntrp, since, gender]] of NAMES.entries()) {
    const id = 'p_demo' + i;
    players.push({ id, name, ntrp, since, gender, active: true, createdAt: now - 90 * 864e5, pinHash: await hashPin('0000', id) });
  }
  const y = new Date().getFullYear();
  const settings = {
    ...DEFAULT_SETTINGS,
    adminId: players[0].id,
    seasons: [
      { id: 'season_s1', name: `${y} S1`, start: `${y}-01-01`, end: `${y}-06-30` },
      { id: 'season_s2', name: `${y} S2`, start: `${y}-07-01`, end: `${y}-12-31` },
    ],
  };
  const t = today();
  const ws = weekStart(t);
  const schedules = [];
  const attendance = [];
  const matches = [];
  const ratings = new Map(players.map((p) => [p.id, ntrpToRating(p.ntrp)]));

  const mkSchedule = (date, start, end, courts) => {
    const s = { id: uid('s_'), date, start, end, venue: '파주 법원읍 테니스장', courts, booker: players[(schedules.length * 3) % players.length].name, note: '', createdBy: players[0].id, createdAt: now - 1e6 + schedules.length };
    schedules.push(s);
    return s;
  };

  // 지난 4주: 수/토 일정 + 경기
  for (let w = 4; w >= 1; w--) {
    for (const [off, st, en] of [[2, '19:00', '21:00'], [5, '07:00', '10:00']]) {
      const date = addDays(ws, off - w * 7);
      const s = mkSchedule(date, st, en, off === 5 ? '3, 4' : '3');
      const goers = players.filter(() => Math.random() < 0.65);
      goers.forEach((p, i) => attendance.push({ id: `${s.id}_${p.id}`, scheduleId: s.id, date, playerId: p.id, isGuest: false, arrived: true, createdAt: now + i }));
      playRounds(s, goers.map((p) => p.id), off === 5 ? 4 : 3);
    }
  }
  // 이번 주: 수(지남), 오늘, 내일
  const wed = mkSchedule(addDays(ws, 2), '19:00', '21:00', '3');
  if (wed.date < t) {
    const goers = players.slice(2, 10);
    goers.forEach((p, i) => attendance.push({ id: `${wed.id}_${p.id}`, scheduleId: wed.id, date: wed.date, playerId: p.id, isGuest: false, arrived: true, createdAt: now + i }));
    playRounds(wed, goers.map((p) => p.id), 3);
  }
  const tod = mkSchedule(t, '07:00', '10:00', '3, 4');
  players.slice(0, 11).forEach((p, i) => attendance.push({ id: `${tod.id}_${p.id}`, scheduleId: tod.id, date: t, playerId: p.id, isGuest: false, arrived: i < 9, createdAt: now + i }));
  const nxt = mkSchedule(addDays(t, 1), '08:00', '10:00', '5');
  players.slice(4, 8).forEach((p, i) => attendance.push({ id: `${nxt.id}_${p.id}`, scheduleId: nxt.id, date: nxt.date, playerId: p.id, isGuest: false, arrived: false, createdAt: now + i }));

  function playRounds(s, ids, rounds) {
    const courts = s.courts.split(',').map((x) => x.trim());
    const today = [];
    for (let r = 0; r < rounds; r++) {
      const plan = generate({ pool: ids, courts, format: 'doubles', ratings, todayMatches: today });
      for (const x of plan) {
        const ea = expected(avg(x.teamA), avg(x.teamB));
        const aWins = Math.random() < ea;
        const lose = [0, 1, 2, 3, 4, 4, 5][Math.floor(Math.random() * 7)];
        const m = {
          id: uid('m_'), scheduleId: s.id, date: s.date, court: x.court, format: 'doubles',
          type: Math.random() < 0.7 ? 'coin' : Math.random() < 0.8 ? 'official' : 'friendly',
          teamA: x.teamA, teamB: x.teamB, status: 'done', createdAt: now - 5e5 + matches.length * 10,
          recordedBy: x.teamA[0], recordedAt: now, history: [],
        };
        if (m.type === 'friendly') Object.assign(m, { scoreA: null, scoreB: null });
        else Object.assign(m, aWins ? { scoreA: lose === 5 ? 7 : 6, scoreB: lose } : { scoreA: lose, scoreB: lose === 5 ? 7 : 6 });
        matches.push(m);
        today.push(m);
      }
    }
  }
  function avg(t) {
    return t.reduce((a, id) => a + ratings.get(id), 0) / t.length;
  }

  // 몇 명은 아바타를 꾸며 둔 상태로
  const purchases = [];
  const avatars = [];
  const pickOne = (slot) => BUILTIN_ITEMS.filter((it) => it.slot === slot)[Math.floor(Math.random() * BUILTIN_ITEMS.filter((it) => it.slot === slot).length)];
  players.slice(1, 9).forEach((p, i) => {
    const wear = {};
    for (const slot of ['hat', 'top', 'bottom', 'shoes', 'hand']) if (Math.random() < 0.7) wear[slot] = pickOne(slot).id;
    const base = Math.random() < 0.6 ? pickOne('base').id : null;
    const deco = Math.random() < 0.6 ? [{ id: 'b_deco_trophy', x: 60, y: 46 }] : [];
    [...Object.values(wear), base, ...deco.map((d) => d.id)].filter(Boolean).forEach((itemId) => {
      const it = BUILTIN_ITEMS.find((x) => x.id === itemId);
      purchases.push({ id: `${p.id}_${itemId}`, playerId: p.id, itemId, itemName: it.name, price: 0, date: t, at: now });
    });
    avatars.push({ id: p.id, skin: i % 4, hair: i % 2 ? 'long' : 'f', v: 3, hairColor: i % 5, wear, base, deco, updatedAt: now - i });
  });

  await db.replaceAll({ players, guests: [], schedules, attendance, matches, coinLogs: [], settings: [settings], items: [], purchases, avatars });
  session.set(players[0].id);
}
