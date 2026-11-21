#!/usr/bin/env node
/* =====================================================================
 * Banetester for Stryket (elvestryk)
 * ---------------------------------------------------------------------
 *   node tools/stryk.js            tester alle stryk-baner
 *   node tools/stryk.js S-2        tester én bane
 *   node tools/stryk.js S-2 --slow tester med tregere "spiller" (vanskeligere)
 *   node tools/stryk.js --pearls   roboten prøver også å fange alle perlene
 *   node tools/stryk.js --se=1.0   roboten ser bare 1 sekund fram (som en ny spiller)
 *
 * En enkel robot spiller banen: hvert femte tidels sekund ser den litt
 * framover og velger et trykk (eller ingenting) som holder båten unna
 * hindringene. Klarer roboten banen uten krasj, går banen an å klare.
 * Den skriver også hvor mange trykk som trengs og hvor travelt det er.
 * ===================================================================== */
'use strict';
require('../js/stryket.js');
const S = globalThis.Stryket;
const K = S.K;

const args = process.argv.slice(2);
const slow = args.includes('--slow');
const greedy = args.includes('--pearls');
const ids = args.filter((a) => !a.startsWith('--'));
const DECIDE = Math.round((slow ? 0.35 : 0.2) / K.DT); // så ofte roboten kan trykke
// så langt fram den ser (--se=1.0 gir en robot som ser kortere, som en ny spiller)
const seeArg = args.find((a) => a.startsWith('--se='));
const HORIZON = Math.round((seeArg ? +seeArg.slice(5) : 2.2) / K.DT);

// Trykkene roboten kan velge mellom (i forhold til båten).
const OPTS = [];
for (const dx of [28, 50, 80, 120]) { OPTS.push([-dx, 0]); OPTS.push([dx, 0]); }
OPTS.push([-40, -40], [40, -40], [-40, 40], [40, 40]);

// Hvor lenge båten klarer seg uten krasj fra denne tilstanden.
let gained = 0; // perler fanget i siste prøve
function survive(st0, plan) {
  const st = S.clone(st0);
  const c0 = st.crashes, p0 = st.pearls;
  let t = 0;
  const end = (v) => { gained = st.pearls - p0; return v; };
  for (const p of plan) {
    if (p) S.tap(st, st.x + p[0], st.y + p[1]);
    for (let i = 0; i < DECIDE; i++) { S.step(st); t++; if (st.crashes > c0) return end(t); if (st.done) return end(1e9); }
  }
  for (; t < HORIZON; t++) { S.step(st); if (st.crashes > c0) return end(t); if (st.done) return end(1e9); }
  return end(1e9);
}

// Perlejakt: velg det trygge trykket som fanger flest perler snart.
function decidePearls(st) {
  let best, bestG = -1;
  for (const o of [null, ...OPTS]) {
    for (const o2 of [null, ...OPTS]) {
      if (survive(st, [o, o2]) < HORIZON) continue;
      if (gained > bestG) { bestG = gained; best = o; }
    }
  }
  return bestG >= 0 ? best : decide(st);
}

function decide(st) {
  if (survive(st, [null]) >= HORIZON) return null;
  let best = null, bestT = -1;
  for (const o of OPTS) {
    const t = survive(st, [o]);
    if (t >= HORIZON) return o;
    if (t > bestT) { bestT = t; best = o; }
  }
  for (const o of OPTS) for (const o2 of [null, ...OPTS]) {
    const t = survive(st, [o, o2]);
    if (t >= HORIZON) return o;
    if (t > bestT) { bestT = t; best = o; }
  }
  return best;
}

function test(lv) {
  const st = S.create(lv);
  let busy = 0, decisions = 0;
  const crashes = [];
  const t0 = Date.now();
  while (!st.done && st.t < 600) {
    const o = greedy ? decidePearls(st) : decide(st);
    decisions++;
    if (o) { S.tap(st, st.x + o[0], st.y + o[1]); busy++; }
    for (let i = 0; i < DECIDE && !st.done; i++) {
      const c = st.crashes;
      S.step(st);
      if (st.crashes > c) crashes.push(`${st.why} ved ${Math.round(S.boatD(st))}`);
    }
  }
  const secs = st.t;
  const ok = st.done && crashes.length === 0;
  console.log(`${ok ? '✔' : '✘'} ${lv.id} ${lv.name.no.padEnd(14)} ${secs.toFixed(0)} s, ${st.taps} trykk (${(st.taps / secs * 60).toFixed(0)}/min), ` +
    `perler ${st.pearls}/${lv.pearls.length}, krasj ${crashes.length}${crashes.length ? ': ' + crashes.join(', ') : ''}  [${((Date.now() - t0) / 1000).toFixed(1)} s]`);
  return ok;
}

let allOk = true;
for (const lv of S.LEVELS) if (!ids.length || ids.includes(lv.id)) allOk = test(lv) && allOk;
process.exit(allOk ? 0 : 1);
