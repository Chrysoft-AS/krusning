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
      best = Math.min(best, Engine.pathDist(w, b.x, b.y, d.x, d.y));
    }
    s -= best;
    for (const v of w.whirls) if (Math.hypot(v.x - b.x, v.y - b.y) < v.r) s -= 150;
  }
  for (const sw of w.switches) if (sw.on) s += 250; // åpnet sluse er et steg nærmere
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
    const level = job.level || findLevel(job.levelId);
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
// Løseren kan også brukes fra andre verktøy (f.eks. tools/gen.js):
//   const { makeSolver } = require('./solve.js');
//   const s = makeSolver(); const r = await s.analyze(bane); s.close();
function makeSolver(threads) {
  const n = Math.max(1, Math.min(threads || os.cpus().length, 8));
  const workers = Array.from({ length: n }, () => new Worker(__filename));
  let jobSeq = 0;
  function runJob(worker, job) {
    return new Promise((resolve) => {
      const id = ++jobSeq;
      const onMsg = (m) => { if (m.id === id) { worker.off('message', onMsg); resolve(m.results); } };
      worker.on('message', onMsg);
      worker.postMessage(Object.assign({ id }, job));
    });
  }
  async function evaluate(level, prefix, points) {
    const chunk = Math.ceil(points.length / n);
    const parts = await Promise.all(workers.map((wk, i) =>
      runJob(wk, { level, prefix, points: points.slice(i * chunk, (i + 1) * chunk) })));
    return parts.flat();
  }

  // Finner minste antall trykk. Søker helt ned til maxDepth hvis ingen
  // løsning er funnet, og stopper ved stopDepth når en løsning finnes.
  async function analyze(level, o) {
    o = Object.assign({ grid: 9, beam: 24, maxDepth: 4, stopDepth: 1 }, o || {});
    // Tømmer i elva: søket regner uten stokkene (som om du alltid treffer et
    // godt øyeblikk). timingCheck() sjekker etterpå at øyeblikkene finnes.
    if (level.timber) level = Object.assign({}, level, { timber: undefined });
    const fine = gridPoints(Math.max(3, o.grid / 2));
    const r1 = await evaluate(level, [], fine);
    const wins1 = r1.filter((r) => r.done);
    const found = { 1: wins1.length };
    let min = wins1.length ? 1 : 0;
    let example = wins1.length ? [centerOf(wins1.map((r) => r.tap))] : null;
    let beam = dedupe(r1.filter((r) => !r.done)).slice(0, o.beam).map((r) => ({ taps: [r.tap] }));
    const coarse = gridPoints(o.grid);
    for (let depth = 2; depth <= o.maxDepth; depth++) {
      if (min && depth > o.stopDepth) break;
      const next = [];
      let wins = 0, firstWin = null;
      for (const s of beam) {
        const res = await evaluate(level, s.taps, coarse);
        for (const r of res) {
          if (r.done) { wins++; if (!firstWin) firstWin = s.taps.concat([r.tap]); }
          else next.push({ taps: s.taps.concat([r.tap]), score: r.score, key: r.key });
        }
      }
      found[depth] = wins;
      if (wins && !min) { min = depth; example = firstWin; }
      beam = dedupe(next).slice(0, o.beam);
    }
    return { min, found, total1: fine.length, wins1: wins1.map((r) => r.tap), example };
  }

  return { evaluate, analyze, close: () => Promise.all(workers.map((w) => w.terminate())) };
}

let solver = null;
const opt = { grid: 9, beam: 24, only: null, map: false };

async function solveLevel(level) {
  const t0 = Date.now();
  const name = (level.name && (level.name.no || level.name)) || '';
  const lines = [];
  const warn = [];
  lines.push(`\n■ ${level.id}  «${name}»   par ${level.par}  perle ${level.pearl}`);

  // ett trykk på fint rutenett, og så strålesøk med flere trykk. Vi leter
  // alltid helt ned til perle-nivået for å se om perla er mulig uten flaks.
  const res = await solver.analyze(level, { grid: opt.grid, beam: opt.beam, maxDepth: level.par + 1, stopDepth: level.pearl });
  const { found, min, example } = res;
  const pct = (100 * found[1] / res.total1).toFixed(1);
  lines.push(`  1 krusning: ${found[1]} av ${res.total1} trykkpunkter løser banen (${pct} %)`);
  if (opt.map) lines.push(asciiMap(level, res.wins1));
  for (let d = 2; found[d] != null; d++) lines.push(`  ${d} krusninger: ${found[d] ? found[d] + ' løsninger funnet' : 'ingen løsning'}`);
  const maxDepth = level.par + 1;
  if (example) lines.push(`  eksempel: ${fmt(example)}`);

  if (!min) warn.push(`fant ingen løsning på ${maxDepth} krusninger – sjekk banen`);
  else {
    if (min > level.par) warn.push(`beste løsning funnet er ${min}, men par er ${level.par}`);
    if (min > level.pearl) warn.push(`beste løsning funnet er ${min}, men perle er ${level.pearl}`);
    if (min < level.pearl && found[min] >= 12) warn.push(`kan løses på ${min} (${found[min]} måter) – vurder perle ${min}`);
    if (level.pearl === 1 && found[1] > 0 && found[1] < 6) warn.push('perla krever nesten umulig presisjon (under 6 trykkpunkter)');
    if (level.pearl >= 2 && !found[level.pearl] && min < level.pearl) lines.push('  (perla nås bare med det svært smale ettrykksvinduet)');
  }

  if (level.timber && example) {
    const tc = timingCheck(level, example);
    tc.forEach((r, i) => lines.push(`  tømmer, trykk ${i + 1}: ` + (r.best ? `${r.count} gode øyeblikk de neste 10 s, lengste ${r.best.toFixed(2)} s, første etter ${r.first.toFixed(2)} s` : 'ingen gode øyeblikk')));
    if (tc.some((r) => !r.best)) warn.push('båten kommer ikke forbi stokkene i eksempelløsningen');
    else if (tc.some((r) => r.best < 0.2)) warn.push('vinduene mellom stokkene er svært korte (under 0,2 s)');
  }

  for (const w of warn) lines.push(`  ⚠ ${w}`);
  lines.push(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log(lines.join('\n'));
  return { id: level.id, min, warn };
}

// Tømmer: finnes det, for hvert trykk i løsningen, øyeblikk der båten slipper
// forbi stokkene? Vi venter 0–10 s (hvert 0,05 s) før trykket og ser etter
// knusing. Neste trykk tar utgangspunkt i det første gode øyeblikket.
function timingCheck(level, taps) {
  const out = [];
  let w = Engine.createWorld(level);
  for (const [x, y] of taps) {
    const wait = Engine.clone(w);
    const ok = [];
    let next = null;
    for (let k = 0; k <= 200; k++) {
      const t = Engine.clone(wait);
      Engine.tap(t, x, y);
      let bad = false;
      for (let i = 0; i < 12 / C.DT; i++) {
        Engine.step(t);
        if (t.events.some((e) => e.type === 'crash')) { bad = true; break; }
        t.events.length = 0;
        if (t.done || Engine.isSettled(t)) break;
      }
      ok.push(!bad);
      if (!bad && !next) next = t;
      for (let i = 0; i < 6; i++) { Engine.step(wait); wait.events.length = 0; }
    }
    let best = 0, run = 0, count = 0;
    ok.forEach((g, i) => { run = g ? run + 1 : 0; if (g && (i === 0 || !ok[i - 1])) count++; best = Math.max(best, run); });
    out.push({ best: best ? best * 0.05 : 0, count, first: ok.indexOf(true) * 0.05 });
    if (!next) break;
    w = next;
  }
  return out;
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

// Banen som tekst: B båt, H havn (tall = farget havn), O stein, # stokk, L vannlilje, @ virvel,
// = foss nedover, V foss ovenfra, r regndråpe, M molo, G sluseport, S bryter, f frosk (blad),
// - is, > vind, * vinnende trykk
function asciiMap(level, wins) {
  const cw = 9, ch = 15, cols = Math.ceil(C.W / cw), rows = Math.ceil(C.H / ch);
  const g = Array.from({ length: rows }, () => Array(cols).fill(' '));
  const put = (x, y, c) => { const cx = Math.floor(x / cw), cy = Math.floor(y / ch); if (g[cy] && cx >= 0 && cx < cols) g[cy][cx] = c; };
  const disc = (x, y, r, c) => { for (let yy = y - r; yy <= y + r; yy += 3) for (let xx = x - r; xx <= x + r; xx += 3) if (Math.hypot(xx - x, yy - y) <= r) put(xx, yy, c); };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (Engine.insidePond(x * cw + cw / 2, y * ch + ch / 2, 0)) g[y][x] = '·';
  for (const r of level.ice || []) for (let y = r.y + 4; y < r.y + r.h; y += 15) for (let x = r.x + 4; x < r.x + r.w; x += 9) if (g[Math.floor(y / ch)] && g[Math.floor(y / ch)][Math.floor(x / cw)] === '·') put(x, y, '-');
  for (const r of level.winds || []) for (let y = r.y + 4; y < r.y + r.h; y += 15) for (let x = r.x + 4; x < r.x + r.w; x += 9) if (g[Math.floor(y / ch)] && g[Math.floor(y / ch)][Math.floor(x / cw)] === '·') put(x, y, Math.abs(r.ax || 0) >= Math.abs(r.ay || 0) ? (r.ax > 0 ? '>' : '<') : (r.ay > 0 ? 'v' : '^'));
  for (const [x, y] of wins) put(x, y, '*');
  for (const v of level.whirls || []) disc(v.x, v.y, v.r * 0.35, '@');
  for (const r of level.rocks || []) disc(r.x, r.y, r.r, 'O');
  for (const p of level.pads || []) disc(p.x, p.y, p.r, 'L');
  for (const l of level.logs || []) { for (let t = 0; t <= 1; t += 0.02) put(l.x1 + (l.x2 - l.x1) * t, l.y1 + (l.y2 - l.y1) * t, '#'); }
  for (const f of level.falls || []) { for (let t = -0.2; t <= 1.2; t += 0.01) put(f.x1 + (f.x2 - f.x1) * t, f.y1 + (f.y2 - f.y1) * t, '='); }
  for (const c of level.cascades || []) disc(c.x, c.y, 12, 'V');
  for (const l of level.walls || []) { for (let t = 0; t <= 1; t += 0.01) put(l.x1 + (l.x2 - l.x1) * t, l.y1 + (l.y2 - l.y1) * t, 'M'); }
  for (const l of level.gates || []) { for (let t = 0; t <= 1; t += 0.01) put(l.x1 + (l.x2 - l.x1) * t, l.y1 + (l.y2 - l.y1) * t, 'G'); }
  for (const s of level.switches || []) disc(s.x, s.y, 6, 'S');
  for (const d of level.rain || []) disc(d.x, d.y, 5, 'r');
  for (const f of level.frogs || []) for (const [x, y] of f.hops) disc(x, y, 5, 'f');
  for (const d of level.docks || []) disc(d.x, d.y, 12, d.color != null ? String(d.color) : 'H');
  const colored = (level.docks || []).some((d) => d.color != null);
  (level.boats || []).forEach((b, i) => disc(b.x, b.y, 9, colored ? String.fromCharCode(97 + (b.color != null ? b.color : i)) : b.heavy ? 'T' : 'B'));
  return g.map((r) => '    |' + r.join('') + '|').join('\n');
}

function fmt(taps) { return taps.map(([x, y]) => `(${Math.round(x)}, ${Math.round(y)})`).join(' → '); }

module.exports = { makeSolver, asciiMap, timingCheck };

if (require.main === module) {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--grid') opt.grid = +args[++i];
    else if (args[i] === '--beam') opt.beam = +args[++i];
    else if (args[i] === '--map') opt.map = true;
    else opt.only = args[i];
  }
  solver = makeSolver();
  (async () => {
    const levels = opt.only ? allLevels().filter((l) => l.id === opt.only || l.id.startsWith(opt.only + '-')) : allLevels();
    if (!levels.length) { console.log('Fant ingen bane med id', opt.only); process.exit(1); }
    let problems = 0;
    for (const l of levels) problems += (await solveLevel(l)).warn.length;
    console.log(problems ? `\n${problems} merknad(er) å se på.` : '\nAlle baner ser bra ut ✔');
    await solver.close();
  })();
}
