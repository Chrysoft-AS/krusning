#!/usr/bin/env node
/* =====================================================================
 * Krusning – banetester
 * ---------------------------------------------------------------------
 * Kjører den ekte fysikkmotoren uten grafikk og prøver tusenvis av
 * trykk for å finne ut om hver bane kan løses, og med hvor få
 * krusninger. Slik vet vi at "par" og "perle" er rettferdige.
 *
 * Bruk:
 *   node tools/solve.js            alle baner
 *   node tools/solve.js 1-4        én bane
 *   node tools/solve.js 1          alle baner i verden 1
 *   node tools/solve.js 1-4 --map  tegn banen som tekst, * = trykk som
 *                                  løser banen med én krusning
 *   Valg: --grid 9 (avstand mellom prøvetrykk), --beam 24 (bredde i søket)
 *
 * Forenkling: testeren trykker bare når alt ligger i ro. En spiller kan
 * også trykke mens ting beveger seg, så ekte rekorder kan bli enda bedre.
 * ===================================================================== */
'use strict';
const { Worker, isMainThread, parentPort } = require('worker_threads');
const os = require('os');
const Engine = require('../js/engine.js');
const { WORLDS } = require('../js/levels.js');

const C = Engine.C;

function allLevels() {
  const out = [];
  for (const w of WORLDS) for (const l of w.levels || []) out.push(l);
  return out;
}
function findLevel(id) { return allLevels().find((l) => l.id === id); }

function settle(w, maxT) {
  const max = Math.round((maxT || 12) / C.DT);
  for (let i = 0; i < max; i++) {
    Engine.step(w); w.events.length = 0;
    if (w.done) return true;
    if (Engine.isSettled(w)) return false;
  }
  return w.done;
}

function play(level, taps) {
  const w = Engine.createWorld(level);
  for (const [x, y] of taps) {
    Engine.tap(w, x, y);
    if (settle(w)) return { w, done: true };
  }
  return { w, done: w.done };
}

// Hvor nær målet er vi? (brukes for å velge lovende veier i søket)
function score(w) {
  let s = 0;
  for (const b of w.boats) {
    if (b.dock >= 0) { s += 1000; continue; }
    let best = 1e9;
    for (const d of w.docks) {
      if (d.boat >= 0 || (d.color >= 0 && d.color !== b.color)) continue;
      best = Math.min(best, Math.hypot(d.x - b.x, d.y - b.y));
    }
    s -= best;
    for (const v of w.whirls) if (Math.hypot(v.x - b.x, v.y - b.y) < v.r) s -= 150;
  }
  return s;
}

function stateKey(w) {
  return w.bodies.map((b) => (b.dock >= 0 ? 'D' + b.dock : Math.round(b.x / 9) + ',' + Math.round(b.y / 9))).join('|');
}

function gridPoints(step) {
  const pts = [];
  for (let y = step / 2; y < C.H; y += step) {
    for (let x = step / 2; x < C.W; x += step) {
      if (Engine.insidePond(x, y, 4)) pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    }
  }
  return pts;
}

/* ---------------- arbeidstråd ---------------- */
if (!isMainThread) {
  parentPort.on('message', (job) => {
    const level = findLevel(job.levelId);
    const base = play(level, job.prefix).w;
    const results = [];
    for (const [x, y] of job.points) {
      const w = Engine.clone(base);
      if (!Engine.tap(w, x, y)) continue;
      const done = settle(w);
      results.push({ tap: [x, y], done, score: done ? 1e9 : score(w), key: done ? 'DONE' : stateKey(w) });
    }
    parentPort.postMessage({ id: job.id, results });
  });
  return;
}

/* ---------------- hovedtråd ---------------- */
const args = process.argv.slice(2);
const opt = { grid: 9, beam: 24, only: null, map: false };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--grid') opt.grid = +args[++i];
  else if (args[i] === '--beam') opt.beam = +args[++i];
  else if (args[i] === '--map') opt.map = true;
  else opt.only = args[i];
}

const N = Math.max(1, Math.min(os.cpus().length, 8));
const workers = Array.from({ length: N }, () => new Worker(__filename));
let jobSeq = 0;
function runJob(worker, job) {
  return new Promise((resolve) => {
    const id = ++jobSeq;
    const onMsg = (m) => { if (m.id === id) { worker.off('message', onMsg); resolve(m.results); } };
    worker.on('message', onMsg);
    worker.postMessage(Object.assign({ id }, job));
  });
}
async function evaluate(levelId, prefix, points) {
  const chunk = Math.ceil(points.length / N);
  const parts = await Promise.all(workers.map((wk, i) =>
    runJob(wk, { levelId, prefix, points: points.slice(i * chunk, (i + 1) * chunk) })));
  return parts.flat();
}

async function solveLevel(level) {
  const t0 = Date.now();
  const name = (level.name && (level.name.no || level.name)) || '';
  const lines = [];
  const warn = [];
  lines.push(`\n■ ${level.id}  «${name}»   par ${level.par}  perle ${level.pearl}`);

  // 1) ett trykk, fint rutenett
  const fine = gridPoints(Math.max(3, opt.grid / 2));
  const r1 = await evaluate(level.id, [], fine);
  const wins1 = r1.filter((r) => r.done);
  const pct = (100 * wins1.length / fine.length).toFixed(1);
  lines.push(`  1 krusning: ${wins1.length} av ${fine.length} trykkpunkter løser banen (${pct} %)`);
  if (opt.map) lines.push(asciiMap(level, wins1.map((r) => r.tap)));

  // 2) flere trykk (strålesøk). Vi leter alltid helt ned til perle-nivået
  //    for å se om perla er mulig uten flaks.
  const found = { 1: wins1.length };
  let min = wins1.length ? 1 : 0;
  let example = wins1.length ? [centerOf(wins1.map((r) => r.tap))] : null;
  const maxDepth = Math.max(level.pearl, min ? 1 : level.par + 1);
  let beam = dedupe(r1.filter((r) => !r.done)).slice(0, opt.beam).map((r) => ({ taps: [r.tap] }));
  const coarse = gridPoints(opt.grid);
  for (let depth = 2; depth <= maxDepth; depth++) {
    const next = [];
    let wins = 0, firstWin = null;
    for (const s of beam) {
      const res = await evaluate(level.id, s.taps, coarse);
      for (const r of res) {
        if (r.done) { wins++; if (!firstWin) firstWin = s.taps.concat([r.tap]); }
        else next.push({ taps: s.taps.concat([r.tap]), score: r.score, key: r.key });
      }
    }
    found[depth] = wins;
    lines.push(`  ${depth} krusninger: ${wins ? wins + ' løsninger funnet' : 'ingen løsning'}`);
    if (wins && !min) { min = depth; example = firstWin; }
    if (min && depth >= level.pearl) break;
    beam = dedupe(next).slice(0, opt.beam);
  }
  if (example) lines.push(`  eksempel: ${fmt(example)}`);

  if (!min) warn.push(`fant ingen løsning på ${maxDepth} krusninger – sjekk banen`);
  else {
    if (min > level.par) warn.push(`beste løsning funnet er ${min}, men par er ${level.par}`);
    if (min > level.pearl) warn.push(`beste løsning funnet er ${min}, men perle er ${level.pearl}`);
    if (min < level.pearl && found[min] >= 12) warn.push(`kan løses på ${min} (${found[min]} måter) – vurder perle ${min}`);
    if (level.pearl === 1 && found[1] > 0 && found[1] < 6) warn.push('perla krever nesten umulig presisjon (under 6 trykkpunkter)');
    if (level.pearl >= 2 && !found[level.pearl] && min < level.pearl) lines.push('  (perla nås bare med det svært smale ettrykksvinduet)');
  }

  for (const w of warn) lines.push(`  ⚠ ${w}`);
  lines.push(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log(lines.join('\n'));
  return { id: level.id, min, warn };
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  list.sort((a, b) => b.score - a.score);
  for (const r of list) {
    if (seen.has(r.key)) continue;
    seen.add(r.key); out.push(r);
  }
  return out;
}

function centerOf(pts) {
  let best = pts[0], bestN = -1;
  for (const p of pts) {
    let n = 0;
    for (const q of pts) if (Math.abs(p[0] - q[0]) <= 9 && Math.abs(p[1] - q[1]) <= 9) n++;
    if (n > bestN) { bestN = n; best = p; }
  }
  return best;
}

// Banen som tekst: B båt, H havn, O stein, # stokk, L vannlilje, @ virvel, * vinnende trykk
function asciiMap(level, wins) {
  const cw = 9, ch = 15, cols = Math.ceil(C.W / cw), rows = Math.ceil(C.H / ch);
  const g = Array.from({ length: rows }, () => Array(cols).fill(' '));
  const put = (x, y, c) => { const cx = Math.floor(x / cw), cy = Math.floor(y / ch); if (g[cy] && cx >= 0 && cx < cols) g[cy][cx] = c; };
  const disc = (x, y, r, c) => { for (let yy = y - r; yy <= y + r; yy += 3) for (let xx = x - r; xx <= x + r; xx += 3) if (Math.hypot(xx - x, yy - y) <= r) put(xx, yy, c); };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (Engine.insidePond(x * cw + cw / 2, y * ch + ch / 2, 0)) g[y][x] = '·';
  for (const [x, y] of wins) put(x, y, '*');
  for (const v of level.whirls || []) disc(v.x, v.y, v.r * 0.35, '@');
  for (const r of level.rocks || []) disc(r.x, r.y, r.r, 'O');
  for (const p of level.pads || []) disc(p.x, p.y, p.r, 'L');
  for (const l of level.logs || []) { for (let t = 0; t <= 1; t += 0.02) put(l.x1 + (l.x2 - l.x1) * t, l.y1 + (l.y2 - l.y1) * t, '#'); }
  for (const d of level.docks || []) disc(d.x, d.y, 12, 'H');
  for (const b of level.boats || []) disc(b.x, b.y, 9, 'B');
  return g.map((r) => '    |' + r.join('') + '|').join('\n');
}

function fmt(taps) { return taps.map(([x, y]) => `(${Math.round(x)}, ${Math.round(y)})`).join(' → '); }

(async () => {
  const levels = opt.only ? allLevels().filter((l) => l.id === opt.only || l.id.startsWith(opt.only + '-')) : allLevels();
  if (!levels.length) { console.log('Fant ingen bane med id', opt.only); process.exit(1); }
  let problems = 0;
  for (const l of levels) problems += (await solveLevel(l)).warn.length;
  console.log(problems ? `\n${problems} merknad(er) å se på.` : '\nAlle baner ser bra ut ✔');
  await Promise.all(workers.map((w) => w.terminate()));
})();
