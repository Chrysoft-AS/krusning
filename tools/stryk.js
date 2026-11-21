#!/usr/bin/env node
/* =====================================================================
 * Banetester for Stryket (elvestryk)
 * ---------------------------------------------------------------------
 *   node tools/stryk.js              tester alle stryk-baner (må gi ✔)
 *   node tools/stryk.js S-2          tester én bane
 *   node tools/stryk.js --fix        bytter ut biter roboten ikke klarer,
 *                                    og skriver `fix` inn i js/stryket.js
 *   node tools/stryk.js --pearls     roboten prøver også å fange perlene
 *   node tools/stryk.js --human      en «vanlig spiller»: tenker sjeldnere,
 *                                    ser kort og bommer litt med fingeren.
 *                                    Har tre liv, og viser hvor langt den
 *                                    kommer (de fleste skal ikke nå havna)
 *   node tools/stryk.js --slow --se=1.4   som --human, men uten bom
 *
 * En enkel robot spiller banen: hvert femte tidels sekund ser den litt
 * framover og velger et trykk (eller ingenting) som holder båten unna
 * hindringene. Klarer roboten hele banen uten krasj, går banen an å klare.
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
require('../js/stryket.js');
const S = globalThis.Stryket;
const K = S.K;

const args = process.argv.slice(2);
const human = args.includes('--human');
const slow = args.includes('--slow') || human;
const greedy = args.includes('--pearls');
const doFix = args.includes('--fix');
const ids = args.filter((a) => !a.startsWith('--'));
// --set='{"v":[140,300]}' prøver andre tall på banene (til justering, endrer ikke fila)
const setArg = args.find((a) => a.startsWith('--set='));
const setTo = setArg ? JSON.parse(setArg.slice(6)) : null;
const DECIDE = Math.round((human ? 0.4 : slow ? 0.35 : 0.2) / K.DT); // så ofte roboten kan trykke
// så langt fram den ser (--se=1.0 gir en robot som ser kortere, som en ny spiller)
const seeArg = args.find((a) => a.startsWith('--se='));
const HORIZON = Math.round((seeArg ? +seeArg.slice(5) : human ? 1.1 : 2.2) / K.DT);
const realLives = slow || !!seeArg;
// fingeren treffer ikke helt der den skal (fast rekke, så testen alltid gir samme svar)
let noise = 12345;
const miss = () => { noise = (noise * 1103515245 + 12345) & 0x7fffffff; return human ? (noise / 0x7fffffff - 0.5) * 30 : 0; }; // vanlig spiller: tre liv. Ellers: kjør hele banen.

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

function partAt(lv, d) {
  let p = lv.parts[0];
  for (const q of lv.parts) if (q.d0 <= d + 60) p = q;
  return p;
}

// Spiller én bane. stopFirst: stopp ved første krasj (brukes av --fix).
function play(lv, stopFirst) {
  const st = S.create(lv);
  if (!realLives) st.lives = 1e9;
  const crashes = [];
  while (!st.done && !st.over && st.t < 1500) {
    const o = greedy ? decidePearls(st) : decide(st);
    if (o) S.tap(st, st.x + o[0] + miss(), st.y + o[1] + miss());
    for (let i = 0; i < DECIDE && !st.done && !st.over; i++) {
      const c = st.crashes;
      S.step(st);
      if (st.crashes > c) {
        const d = S.boatD(st), p = partAt(lv, d);
        crashes.push({ why: st.why, d, part: p });
        if (stopFirst || crashes.length >= 25) return { st, crashes };
      }
    }
  }
  return { st, crashes };
}

function report(lv, r, secs) {
  const { st, crashes } = r;
  const ok = realLives ? true : st.done && crashes.length === 0;
  const m = S.meters(st.far), M = S.meters(lv.length);
  const pct = Math.round(st.far / lv.length * 100);
  const where = crashes.slice(0, 6).map((c) => `${c.why}@${S.meters(c.d)}m(${c.part && c.part.kind}#${c.part && c.part.i})`).join(', ');
  console.log(`${ok ? '✔' : '✘'} ${lv.id.padEnd(5)} ${lv.name.no.padEnd(18)} ${st.done ? 'i havn' : 'stoppet'} ${m}/${M} m (${pct} %), ` +
    `${st.t.toFixed(0)} s, ${(st.taps / st.t * 60).toFixed(0)} trykk/min, perler ${st.pearls}/${lv.pearls.length}, ` +
    `krasj ${crashes.length}${where ? ': ' + where : ''}  [${secs.toFixed(1)} s]`);
  return ok;
}

// Bytt ut biter roboten ikke klarer, til hele banen går.
function fixLevel(def) {
  const fix = Object.assign({}, def.fix || {});
  for (let it = 0; it < 400; it++) {
    const lv = S.build(Object.assign({}, def, { fix }));
    const { st, crashes } = play(lv, true);
    if (!crashes.length && st.done) { def.fix = fix; return { lv, it }; }
    const c = crashes[0];
    const i = c ? c.part.i : lv.parts.length - 1;
    fix[i] = (fix[i] || 0) + 1;
    // går det ikke etter mange forsøk, bytt også biten før
    if (fix[i] % 6 === 0 && i > 0) fix[i - 1] = (fix[i - 1] || 0) + 1;
    process.stdout.write(`  ${def.id}: bit ${i} (${c ? c.part.kind : '?'}) ved ${c ? S.meters(c.d) : '?'} m byttes (${fix[i]})\n`);
  }
  throw new Error('Fant ingen løsning for ' + def.id);
}

function writeFix(def) {
  const file = path.join(__dirname, '../js/stryket.js');
  const src = fs.readFileSync(file, 'utf8');
  const re = new RegExp(`fix: \\{[^}]*\\}, // ${def.id}\\n`);
  if (!re.test(src)) throw new Error('Fant ikke fix-linja for ' + def.id);
  const body = Object.keys(def.fix).sort((a, b) => a - b).map((k) => `${k}: ${def.fix[k]}`).join(', ');
  fs.writeFileSync(file, src.replace(re, `fix: { ${body} }, // ${def.id}\n`.replace('{  }', '{}')));
}

let allOk = true, sum = 0, cnt = 0;
for (const def of S.DEFS) {
  if (ids.length && !ids.includes(def.id)) continue;
  const t0 = Date.now();
  if (doFix) {
    const { it } = fixLevel(def);
    writeFix(def);
    console.log(`✔ ${def.id} klar etter ${it} bytte(r): fix ${JSON.stringify(def.fix)}  [${((Date.now() - t0) / 1000).toFixed(1)} s]`);
    continue;
  }
  if (setTo) Object.assign(def, setTo);
  const lv = setTo ? S.build(def) : S.LEVELS.find((l) => l.id === def.id);
  // vanlig spiller: sju forsøk med ulike bom, vis forsøket i midten
  const runs = [];
  for (let k = 0; k < (human ? 7 : 1); k++) { noise = 12345 + k * 777; runs.push(play(lv, false)); }
  runs.sort((a, b) => a.st.far - b.st.far);
  const r = runs[runs.length >> 1];
  sum += r.st.far / lv.length; cnt++;
  allOk = report(lv, r, (Date.now() - t0) / 1000) && allOk;
  if (human) console.log(`        sju forsøk: ${runs.map((q) => Math.round(q.st.far / lv.length * 100) + '%').join(' ')}`);
}
if (realLives && cnt > 1) console.log(`Snitt: ${Math.round(sum / cnt * 100)} % av stryket`);
process.exit(allOk ? 0 : 1);
