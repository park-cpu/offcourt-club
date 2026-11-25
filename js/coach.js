// ─────────────────────────────────────────────────────────────
// 영상 분석 → 글로 된 피드백 (v1.16.0~)
//   missCauses(s)        실수한 샷의 원인 후보 (타점 높이 · 이동 · 위치 · 나간 방향)
//   bounceSummary(shots) 바운드 지도 읽는 법 + 요약 문장
//   feedback(shots)      선수별 잘한 점 · 고칠 점 · 연습 팁
// 샷 필드는 analyzer/FORMAT.md (h · reach · run · fault 는 분석기 0.2~)
// ─────────────────────────────────────────────────────────────
import { COURT, SHOT_KINDS, dirOf, depthOf, fromNear } from './analysis.js';

const { halfW: HW, singlesW: SW, halfL: HL, service: SV } = COURT;
const isErr = (s) => s.res === 'out' || s.res === 'net';
const judged = (arr) => arr.filter((s) => s.res === 'in' || isErr(s));
const rate = (arr) => {
  const j = judged(arr);
  return j.length ? j.filter(isErr).length / j.length : null;
};
const P = (r) => `${Math.round(r * 100)}%`;

// 친 위치 구역 (친 사람 기준 거리 = |hy|)
export function zoneOf(s) {
  if (s.hy == null) return null;
  const d = Math.abs(s.hy);
  if (d < SV - 1.5) return 'net';
  if (d > HL + 0.8) return 'deep';
  if (d < HL - 1.5) return 'mid';
  return 'base';
}
export const ZONES = { net: '네트 앞', mid: '서비스라인~베이스라인 사이', base: '베이스라인', deep: '베이스라인 한참 뒤' };

// 아웃이면 어디로 나갔는지 (길게 / 옆으로)
export function outWay(s) {
  if (s.res !== 'out' || s.by == null) return null;
  const long = Math.abs(s.by) > (s.k === 'serve' ? SV : HL) + 0.1;
  const wide = Math.abs(s.bx ?? 0) > (s.k === 'serve' ? SW : HW) + 0.1;
  return long && !wide ? 'long' : wide && !long ? 'wide' : long ? 'long' : null;
}

/** 실수한 샷의 원인 후보 (보이는 데이터로 추정, 확정 아님) */
export function missCauses(s) {
  if (!isErr(s)) return [];
  const c = [];
  if (s.k === 'serve') c.push(s.fault ? '서브 폴트' : '서브 실수');
  if (s.res === 'net' && s.h === 'low') c.push('낮은 타점에서 들어 올리지 못함');
  else if (s.h === 'low') c.push('낮은 타점');
  if (s.h === 'high' && s.k !== 'serve' && s.k !== 'overhead') c.push('높은 공 처리');
  if (s.run != null && s.run >= 2.5) c.push('뛰면서 친 공');
  if (s.reach === 'far') c.push('몸에서 멀리 뻗어서 침');
  if (s.reach === 'close' && s.k !== 'serve' && s.k !== 'volley') c.push('몸에 붙어서(늦게) 침');
  const z = zoneOf(s);
  if (z === 'mid' && s.k !== 'volley') c.push('애매한 위치(노맨스랜드)에서 침');
  if (z === 'deep') c.push('베이스라인 한참 뒤에서 침');
  const w = outWay(s);
  if (w === 'long') c.push('길게 나감');
  if (w === 'wide') c.push('옆으로 나감');
  if (s.res === 'net' && !c.some((x) => x.startsWith('낮은'))) c.push('네트에 걸림');
  return c;
}

/** 바운드 지도 아래에 붙일 설명 문장 */
export function bounceSummary(shots) {
  const lines = [];
  const placed = shots.filter((s) => s.by != null && s.res === 'in' && s.k !== 'serve');
  const errs = shots.filter(isErr);
  if (!placed.length && !errs.length) return ['바운드 위치를 찾은 샷이 아직 없어요.'];
  if (placed.length) {
    const deep = placed.filter((s) => depthOf(s) === 'deep').length;
    const short = placed.filter((s) => depthOf(s) === 'short').length;
    const r = deep / placed.length;
    lines.push(
      r >= 0.4
        ? `들어간 공의 ${P(r)}가 베이스라인 가까이 깊게 떨어졌어요. 상대를 뒤로 묶어 두는 좋은 공이에요.`
        : short / placed.length >= 0.4
          ? `들어간 공의 ${P(short / placed.length)}가 서비스 라인 안쪽에 짧게 떨어졌어요. 짧은 공은 상대가 앞으로 나와 공격하기 쉬워요.`
          : `들어간 공의 깊이: 깊게 ${P(r)} · 중간 ${P(1 - r - short / placed.length)} · 짧게 ${P(short / placed.length)}. 깊게가 40%를 넘으면 상대가 공격하기 어려워요.`
    );
    // 좌우 (친 사람 기준으로 돌려서): 상대 코트를 세 칸으로
    const side = { l: 0, c: 0, r: 0 };
    placed.forEach((s) => {
      const x = fromNear(s) ? s.bx : -s.bx;
      side[x < -1.4 ? 'l' : x > 1.4 ? 'r' : 'c']++;
    });
    const top = Object.entries(side).sort((a, b) => b[1] - a[1])[0];
    const name = { l: '왼쪽', c: '가운데', r: '오른쪽' }[top[0]];
    if (top[1] / placed.length >= 0.5) lines.push(`공이 상대 코트 ${name}에 몰려 있어요 (${P(top[1] / placed.length)}). 상대가 예측하기 쉬우니 반대쪽도 섞어 보세요.`);
    else lines.push('좌우로 고르게 보내고 있어요.');
  }
  if (errs.length) {
    const net = errs.filter((s) => s.res === 'net').length;
    const long = errs.filter((s) => outWay(s) === 'long').length;
    const wide = errs.filter((s) => outWay(s) === 'wide').length;
    const most = [
      [net, `네트에 걸린 공이 ${net}개로 가장 많아요. 네트 위로 여유 있게(1m 정도) 넘기는 궤적이 필요해요.`],
      [long, `길게 나간 공이 ${long}개로 가장 많아요. 스윙을 위로 끝내 회전을 더 걸어 보세요.`],
      [wide, `옆으로 나간 공이 ${wide}개로 가장 많아요. 사이드 라인에서 1m 안쪽을 목표로 잡아 보세요.`],
    ].sort((a, b) => b[0] - a[0])[0];
    if (most[0] > 0) lines.push(most[1]);
  }
  return lines;
}

const TIPS = {
  '낮은 타점에서 들어 올리지 못함': '무릎을 더 굽혀 공 높이에 눈을 맞추고, 라켓을 공 아래에서 위로 올려 치는 연습 (낮은 공 피딩 20개)',
  '낮은 타점': '공이 떨어지길 기다리지 말고 한 발 앞으로 나와 허리 높이에서 치기',
  '뛰면서 친 공': '친 뒤 바로 가운데로 돌아오는 연습 — 다음 공까지 덜 뛰면 실수가 줄어요 (좌우 풋워크 드릴)',
  '몸에서 멀리 뻗어서 침': '스플릿 스텝 후 첫 발을 빨리 — 공과의 거리를 한 팔+라켓 길이로 맞추기',
  '몸에 붙어서(늦게) 침': '준비(테이크백)를 더 일찍 — 공이 네트를 넘을 때 이미 라켓이 뒤에 있게',
  '애매한 위치(노맨스랜드)에서 침': '서비스라인과 베이스라인 사이에 서 있지 말고, 치고 나서 베이스라인 뒤로 물러나거나 네트로 끝까지 붙기',
  '베이스라인 한참 뒤에서 침': '너무 뒤로 밀렸을 땐 높고 깊은 공(문볼)으로 시간을 벌기',
  '길게 나감': '스윙을 어깨 위로 끝내 탑스핀을 더하고, 베이스라인 1~2m 안쪽을 목표로',
  '옆으로 나감': '각도보다 깊이 — 위기 상황에선 가운데로 깊게',
  '네트에 걸림': '네트 위 1m 높이로 넘기는 궤적 연습 (네트 위 목표 줄 걸고 랠리)',
  '서브 폴트': '첫 서브 확률을 위해 속도를 조금 줄이고 토스를 일정하게 (토스만 10번 연습)',
  '높은 공 처리': '높은 공은 한 발 물러나 어깨 높이에서 치거나, 뜨기 전에 앞으로 나와 처리',
};

/** 선수 한 명의 피드백 (잘한 점 · 고칠 점 · 연습 팁). 데이터가 적으면 그 사실을 알림 */
export function feedback(shots) {
  const out = { summary: null, good: [], fix: [], tips: [], note: null };
  const j = judged(shots);
  if (shots.length < 6 || j.length < 4) {
    out.note = `잡힌 샷이 ${shots.length}개라 아직 판단하기 일러요.`;
    return out;
  }
  const errAll = rate(shots);
  out.summary = `샷 ${shots.length}개 · 성공률 ${P(1 - errAll)} · 실수 ${j.filter(isErr).length}개`;
  // 샷 종류별: 4개 이상인 것만 비교
  const kinds = Object.keys(SHOT_KINDS)
    .filter((k) => k !== 'serve') // 서브는 아래에서 따로
    .map((k) => ({ k, arr: shots.filter((s) => s.k === k) }))
    .filter((x) => judged(x.arr).length >= 4)
    .map((x) => ({ ...x, e: rate(x.arr) }));
  if (kinds.length >= 2) {
    kinds.sort((a, b) => a.e - b.e);
    const best = kinds[0];
    const worst = kinds[kinds.length - 1];
    if (best.e <= errAll) out.good.push(`${SHOT_KINDS[best.k]}가 가장 안정적이에요 (성공률 ${P(1 - best.e)}, ${best.arr.length}번).`);
    if (worst.e - errAll >= 0.1) out.fix.push(`${SHOT_KINDS[worst.k]} 실수가 많아요 (성공률 ${P(1 - worst.e)}, 평균 ${P(1 - errAll)}).`);
  }
  // 서브
  const serves = shots.filter((s) => s.k === 'serve');
  const faults = serves.filter((s) => s.fault || isErr(s));
  if (serves.length >= 4) {
    const fr = faults.length / serves.length;
    if (fr >= 0.35) out.fix.push(`서브 ${serves.length}개 중 ${faults.length}개가 폴트예요 (${P(fr)}).`);
    else out.good.push(`서브가 안정적이에요 (폴트 ${faults.length}/${serves.length}).`);
  }
  // 실수 원인: 조건이 있을 때 vs 없을 때 실수율 비교
  const conds = [
    ['뛰면서 친 공', '뛰면서 쳤을 때', (s) => s.run != null && s.run >= 2.5, (s) => s.run != null && s.run < 2.5],
    ['낮은 타점', '타점이 낮을 때', (s) => s.h === 'low', (s) => s.h && s.h !== 'low'],
    ['몸에서 멀리 뻗어서 침', '몸에서 멀리 뻗어 쳤을 때', (s) => s.reach === 'far', (s) => s.reach && s.reach !== 'far'],
    ['몸에 붙어서(늦게) 침', '몸에 붙어(늦게) 쳤을 때', (s) => s.reach === 'close' && s.k !== 'volley' && s.k !== 'serve', (s) => s.reach === 'normal'],
    ['애매한 위치(노맨스랜드)에서 침', '노맨스랜드에서 쳤을 때', (s) => zoneOf(s) === 'mid' && s.k !== 'volley', (s) => zoneOf(s) === 'base'],
  ];
  const ground = shots.filter((s) => s.k !== 'serve');
  const found = [];
  for (const [name, when, yes, no] of conds) {
    const a = ground.filter(yes);
    const b = ground.filter(no);
    if (judged(a).length < 3 || judged(b).length < 3) continue;
    const ra = rate(a);
    const rb = rate(b);
    if (ra - rb >= 0.15 && judged(a).filter(isErr).length >= 2) found.push({ name, when, ra, rb, n: a.length });
  }
  found.sort((x, y) => y.ra - y.rb - (x.ra - x.rb));
  found.slice(0, 2).forEach((f) => {
    out.fix.push(
      f.rb < 0.05
        ? `${f.when} 실수율 ${P(f.ra)} — 그렇지 않을 땐 실수가 거의 없었어요.`
        : `${f.when} 실수율 ${P(f.ra)} — 그렇지 않을 때(${P(f.rb)})의 ${(f.ra / f.rb).toFixed(1)}배예요.`
    );
    if (TIPS[f.name]) out.tips.push(TIPS[f.name]);
  });
  // 실수 모양 (네트 · 길게 · 옆으로)
  const errs = shots.filter(isErr);
  if (errs.length >= 3) {
    const cnt = {};
    errs.flatMap(missCauses).forEach((c) => (cnt[c] = (cnt[c] || 0) + 1));
    const top = Object.entries(cnt).filter(([c]) => ['네트에 걸림', '길게 나감', '옆으로 나감', '낮은 타점에서 들어 올리지 못함'].includes(c)).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) {
      out.fix.push(`실수 ${errs.length}개 중 ${top[1]}개가 ${top[0] === '네트에 걸림' ? '네트에 걸렸어요' : top[0] === '길게 나감' ? '길게 나갔어요' : top[0] === '옆으로 나감' ? '옆으로 나갔어요' : '낮은 타점에서 네트에 걸렸어요'}.`);
      if (TIPS[top[0]] && !out.tips.includes(TIPS[top[0]])) out.tips.push(TIPS[top[0]]);
    }
  }
  // 깊이 · 방향
  const placed = shots.filter((s) => depthOf(s));
  if (placed.length >= 5) {
    const deep = placed.filter((s) => depthOf(s) === 'deep').length / placed.length;
    const short = placed.filter((s) => depthOf(s) === 'short').length / placed.length;
    if (deep >= 0.4) out.good.push(`깊은 공 비율 ${P(deep)} — 상대를 뒤로 잘 밀어내요.`);
    else if (short >= 0.4) {
      out.fix.push(`짧은 공 비율 ${P(short)} — 상대에게 공격 기회를 줘요.`);
      out.tips.push('베이스라인에서 1~2m 안쪽에 목표(콘)를 두고 깊이 보내는 랠리');
    }
  }
  const dirs = shots.map(dirOf).filter(Boolean);
  if (dirs.length >= 6) {
    const cross = dirs.filter((d) => d === 'cross').length / dirs.length;
    if (cross >= 0.75) out.fix.push(`스트로크의 ${P(cross)}가 크로스예요 — 가끔 스트레이트로 바꾸면 상대가 예측하기 어려워요.`);
  }
  // 위치
  // 위치 (복식은 네트 앞 플레이가 자연스러우니 스트로크만 노맨스랜드 판단)
  const zs = ground.filter((s) => s.k === 'fh' || s.k === 'bh').map(zoneOf).filter(Boolean);
  if (zs.length >= 6) {
    const mid = zs.filter((z) => z === 'mid').length / zs.length;
    if (mid >= 0.35) {
      out.fix.push(`스트로크의 ${P(mid)}를 서비스라인과 베이스라인 사이(노맨스랜드)에서 쳤어요.`);
      const t = TIPS['애매한 위치(노맨스랜드)에서 침'];
      if (!out.tips.includes(t)) out.tips.push(t);
    }
  }
  const vol = ground.filter((s) => s.k === 'volley' || s.k === 'overhead');
  if (ground.length >= 8 && vol.length / ground.length >= 0.5 && rate(vol) != null && rate(vol) <= 0.2) out.good.push(`네트에서 마무리를 잘해요 (발리 · 스매시 ${vol.length}개, 성공률 ${P(1 - rate(vol))}).`);
  if (!out.tips.length && out.fix.length === 0) out.tips.push('지금 패턴을 유지하면서 서브 · 리턴 깊이를 한 단계 더 올려 보세요.');
  return out;
}
