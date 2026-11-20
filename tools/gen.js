#!/usr/bin/env node
/* =====================================================================
 * Krusning – lager og tester brett til Rask runde og Dagens dam
 * ---------------------------------------------------------------------
 * Prøver frø etter frø med brettgeneratoren (js/gen.js), kjører løseren
 * på hvert brett og tar bare vare på de gode. Resultatet skrives til
 * js/pool.js som en liten liste: [frø, par, perle].
 *
 * Et brett er godt når:
 *   • løseren finner en løsning innenfor nivåets grense
 *   • det ikke kan løses «ved et uhell» (for mange trykk som vinner)
 *   • perla har et rettferdig vindu (ikke flaks)
 *
 * Bruk:
 *   node tools/gen.js                 fyll opp alle lister (fortsetter der den slapp)
 *   node tools/gen.js quick easy 40   legg til 40 brett i Rask runde, Lett
 *   node tools/gen.js daily 60        legg til 60 dager i Dagens dam
 *   node tools/gen.js show E123       vis et brett som tekst
 *   node tools/gen.js --fresh         start helt på nytt (etter endringer i fysikk/generator)
 *
 * Dagens dam: mandag–tirsdag lett, onsdag–fredag middels, lørdag–søndag
 * vrien (uten strøm, så nye spillere kan være med).
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const Gen = require('../js/gen.js');
const { makeSolver, asciiMap } = require('./solve.js');

const POOL_FILE = path.join(__dirname, '..', 'js', 'pool.js');
const DAILY_START = '2026-11-20'; // Dagens dam #1

// Krav per nivå: hvor mange trykk beste løsning skal kreve, og hvor stor
// andel av ett-trykkspunktene som høyst får vinne.
const RULES = {
  easy:   { min: [1, 2], maxFrac1: 0.25, depth: 2 },
  medium: { min: [1, 3], maxFrac1: 0.015, depth: 3 },
  hard:   { min: [2, 4], maxFrac1: 0,    depth: 4 },
};
const TARGET = { quick: { easy: 60, medium: 60, hard: 60 }, daily: 90 };

function loadPool() {
  if (!fs.existsSync(POOL_FILE)) return null;
  const txt = fs.readFileSync(POOL_FILE, 'utf8');
  const m = txt.match(/const POOL = (\{[\s\S]*?\});\n/);
  return m ? JSON.parse(m[1]) : null;
}
function emptyPool() {
  return { v: Gen.VERSION, quick: { easy: [], medium: [], hard: [] }, nextSeed: { easy: 1, medium: 1, hard: 1 }, daily: { start: DAILY_START, days: [] } };
}
function writePool(p) {
  const rows = (a) => '[\n' + a.map((r) => '      ' + JSON.stringify(r)).join(',\n') + '\n    ]';
  const json = '{\n'
    + `  "v": ${p.v},\n`
    + `  "nextSeed": ${JSON.stringify(p.nextSeed)},\n`
    + '  "quick": {\n'
    + ['easy', 'medium', 'hard'].map((t) => `    "${t}": ${rows(p.quick[t])}`).join(',\n') + '\n  },\n'
    + `  "daily": {\n    "start": "${p.daily.start}",\n    "days": ${rows(p.daily.days)}\n  }\n}`;
  const out = `/* =====================================================================
 * Krusning – ferdig testede brett (LAGES AV tools/gen.js – IKKE REDIGER)
 * ---------------------------------------------------------------------
 * quick.<nivå>: [frø, par, perle]
 * daily.days:   [frø, nivå, par, perle] – én rad per dag fra daily.start
 * Brettet lages fra frøet av js/gen.js. Versjon ${p.v} av generatoren.
 * ===================================================================== */
(function (root) {
  'use strict';
  const POOL = ${json};
  root.Pool = POOL;
  if (typeof module !== 'undefined' && module.exports) module.exports = POOL;
})(typeof window !== 'undefined' ? window : globalThis);
`;
  fs.writeFileSync(POOL_FILE, out);
}

// Tester ett brett. Gir { par, pearl } eller null hvis brettet ikke er godt.
async function judge(solver, lv, tier) {
  const rule = RULES[tier];
  const res = await solver.analyze(lv, { grid: 9, beam: 12, maxDepth: rule.depth, stopDepth: 1 });
  const m = res.min;
  if (!m || m < rule.min[0] || m > rule.min[1]) return null;
  const frac1 = res.found[1] / res.total1;
  if (frac1 > rule.maxFrac1) return null;                 // for lett å treffe
  if (m === 1 && res.found[1] < 15) return null;          // perla krever flaks
  if (m >= 2 && res.found[m] < 6) return null;            // perla krever flaks
  return { par: m + 1, pearl: m, frac1, found: res.found[m] };
}

function dayTier(i) {
  const d = new Date(DAILY_START + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + i);
  const wd = d.getUTCDay(); // 0 = søndag
  return wd === 1 || wd === 2 ? 'easy' : wd === 0 || wd === 6 ? 'hard' : 'medium';
}

async function fillQuick(solver, pool, tier, n) {
  const list = pool.quick[tier];
  const goal = list.length + n;
  let tried = 0;
  const t0 = Date.now();
  while (list.length < goal) {
    const seed = pool.nextSeed[tier]++;
    const lv = Gen.make(seed, tier);
    if (!lv) continue;
    tried++;
    const j = await judge(solver, lv, tier);
    if (!j) continue;
    list.push([seed, j.par, j.pearl]);
    console.log(`  ${tier} #${list.length}: frø ${seed}, par ${j.par}, perle ${j.pearl} (${j.found} vinnertrykk) – ${tried} prøvd, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    writePool(pool);
  }
}

async function fillDaily(solver, pool, n) {
  const days = pool.daily.days;
  const goal = days.length + n;
  const used = new Set(days.map((d) => d[1] + d[0]));
  while (days.length < goal) {
    const i = days.length;
    const tier = dayTier(i);
    // egne frø for dagens dam (fra 100 000), så de ikke er like Rask runde
    for (let k = 0; ; k++) {
      const seed = 100000 + i * 97 + k;
      if (used.has(tier + seed)) continue;
      const lv = Gen.make(seed, tier, { noCurrent: true });
      if (!lv) continue;
      const j = await judge(solver, lv, tier);
      if (!j) continue;
      days.push([seed, tier, j.par, j.pearl]);
      console.log(`  dag #${i + 1} (${tier}): frø ${seed}, par ${j.par}, perle ${j.pearl}`);
      writePool(pool);
      break;
    }
  }
}

(async () => {
  const args = process.argv.slice(2);
  const fresh = args.includes('--fresh');
  const rest = args.filter((a) => a !== '--fresh');

  if (rest[0] === 'show') {
    const id = rest[1] || 'E1';
    const tier = { E: 'easy', M: 'medium', H: 'hard' }[id[0].toUpperCase()];
    const lv = Gen.make(+id.slice(1), tier, { noCurrent: +id.slice(1) >= 100000 });
    if (!lv) { console.log('Frøet gir ikke noe brett.'); return; }
    const solver = makeSolver();
    const res = await solver.analyze(lv, { grid: 9, beam: 12, maxDepth: RULES[tier].depth, stopDepth: RULES[tier].depth });
    console.log(`${id} «${lv.name.no}»  beste: ${res.min || 'ingen'}  funnet: ${JSON.stringify(res.found)}`);
    console.log(asciiMap(lv, res.wins1));
    await solver.close();
    return;
  }

  let pool = fresh ? null : loadPool();
  if (pool && pool.v !== Gen.VERSION) {
    console.log(`pool.js er laget med generator v${pool.v}, men gen.js er v${Gen.VERSION}. Kjør med --fresh.`);
    process.exit(1);
  }
  pool = pool || emptyPool();
  const solver = makeSolver();
  if (rest[0] === 'quick') await fillQuick(solver, pool, rest[1], +rest[2] || 10);
  else if (rest[0] === 'daily') await fillDaily(solver, pool, +rest[1] || 7);
  else {
    for (const t of ['easy', 'medium', 'hard']) {
      const need = TARGET.quick[t] - pool.quick[t].length;
      if (need > 0) await fillQuick(solver, pool, t, need);
    }
    const need = TARGET.daily - pool.daily.days.length;
    if (need > 0) await fillDaily(solver, pool, need);
  }
  writePool(pool);
  console.log(`\nFerdig: Lett ${pool.quick.easy.length}, Middels ${pool.quick.medium.length}, Vrien ${pool.quick.hard.length}, Dagens dam ${pool.daily.days.length} dager.`);
  await solver.close();
})();
