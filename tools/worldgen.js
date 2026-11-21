#!/usr/bin/env node
/* =====================================================================
 * Krusning – lager forslag til nye baner på Stien
 * ---------------------------------------------------------------------
 * Setter sammen baner fra en «oppskrift» (hvilke mekanikker verdenen
 * bruker), og tester hver bane med løseren. Bare baner som
 *   • kan løses på 1–4 krusninger,
 *   • ikke kan løses ved et uhell,
 *   • har en rettferdig perle (ikke flaks),
 *   • og der løsningen faktisk BRUKER mekanikkene i oppskriften
 * blir tatt vare på. Forslagene lagres i tools/out/<oppskrift>.jsonl.
 *
 * Bruk:
 *   node tools/worldgen.js make 10 60      lag 60 gode forslag til verden 10
 *   node tools/worldgen.js pick 10         velg 15 baner, lett → vanskelig,
 *                                          og skriv dem ut som levels.js-tekst
 *   node tools/worldgen.js show 10 123     vis forslag nr. 123 som tekst
 *
 * Etterpå: lim inn banene i js/levels.js, gi dem navn, og kjør
 * `node tools/solve.js <verden>` og `node tools/playtest.js <bane-id>`.
 *
 * Nye verdener: legg til en oppskrift i RECIPES nedenfor. Gruppene er
 *   bekk  strøm               foss  fosser og foss ovenfra
 *   regn  regnskyer, lasteskuter   sluse molo, sluseport og bryter
 *   natt  frosker, mørke       is    is og vind
 *   elv   tømmer i elva        fjord tidevann, sandbanker og malstrøm
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const Engine = require('../js/engine.js');
const { rng } = require('../js/gen.js');
const { makeSolver, asciiMap, timingCheck } = require('./solve.js');

const C = Engine.C;
const OUT = path.join(__dirname, 'out');

// Oppskrifter. groups = mekanikkene som SKAL brukes i hver bane.
// early = grupper for de første banene (to av tre), så det nye kommer gradvis.
const RECIPES = {
  8:  { groups: ['elv'] },
  9:  { groups: ['fjord'] },
  10: { groups: ['bekk', 'foss'] },
  11: { groups: ['regn', 'sluse'] },
  12: { groups: ['natt', 'is'] },
  13: { groups: ['elv', 'fjord'] },
  14: { groups: ['bekk', 'is'] },
  15: { groups: ['bekk', 'sluse', 'natt'] },
  16: { groups: ['regn', 'is', 'foss'] },
  17: { groups: ['elv', 'foss', 'sluse'] },
  18: { groups: ['fjord', 'natt', 'regn'] },
  19: { groups: ['fjord', 'is', 'bekk'] },
};

/* ---------------- geometri ---------------- */
function segDist(px, py, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const L = dx * dx + dy * dy || 1;
  let t = ((px - s.x1) * dx + (py - s.y1) * dy) / L;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (s.x1 + dx * t), py - (s.y1 + dy * t));
}
const inRect = (x, y, q, m) => x > q.x - m && x < q.x + q.w + m && y > q.y - m && y < q.y + q.h + m;

/* ---------------- å sette sammen en bane ---------------- */
// Banen lages med båtene øverst og havnene nederst, og speiles til slutt
// tilfeldig (så båtene like gjerne starter nederst).
function build(groups, seed, tier) {
  const r = rng(seed * 7919 + 17);
  const R = (a, b) => a + r() * (b - a);
  const I = (a, b) => Math.floor(R(a, b + 1));
  const ri = (a, b) => Math.round(R(a, b));
  const chance = (p) => r() < p;
  const pickOne = (list) => list[Math.floor(r() * list.length)];

  const lv = {};
  const add = (k, v) => { (lv[k] = lv[k] || []).push(v); return v; };
  const solids = [];   // ting båter ikke kan stå på: { x, y, r } eller { x1, y1, x2, y2, r }
  const zones = [];    // felt der båter og havner ikke skal starte: { x, y, w, h, m } eller { x, y, r }
  const dist = (x, y, s) => (s.x1 != null ? segDist(x, y, s) : Math.hypot(x - s.x, y - s.y)) - s.r;
  const clear = (x, y, rad, pad) => {
    if (!Engine.insidePond(x, y, rad + 14)) return false;
    for (const s of solids) if (dist(x, y, s) < rad + pad) return false;
    return true;
  };
  const inZone = (x, y, m) => zones.some((z) => (z.w != null ? inRect(x, y, z, m + (z.m || 0)) : Math.hypot(x - z.x, y - z.y) < z.r + m));

  // 1) Hvilke deler hver gruppe bidrar med. «Bånd» går på tvers av dammen.
  const parts = [];
  for (const g of groups) {
    if (g === 'bekk') parts.push(chance(0.7) ? 'currentBand' : 'currentLane');
    if (g === 'foss') { const f = chance(0.7); if (f) parts.push('fall'); if (!f || chance(0.3)) parts.push('cascade'); }
    if (g === 'regn') parts.push('rain');
    if (g === 'sluse') { const a = chance(0.6); if (a) parts.push('gate'); if (!a || chance(0.35)) parts.push('wall'); }
    if (g === 'natt') parts.push('frog');
    if (g === 'is') { const a = chance(0.65); if (a) parts.push('ice'); if (!a || chance(0.45)) parts.push('wind'); }
    if (g === 'elv') { parts.push('timber'); if (groups.length === 1 && tier >= 2 && chance(0.4)) parts.push('timber'); }
    if (g === 'fjord') {
      const a = chance(0.7);
      if (a) parts.push(chance(0.65) ? 'bankBar' : 'islands');
      if (!a || chance(0.4)) parts.push('mael');
      if (groups.length === 1 && tier >= 2 && chance(0.35)) parts.push(a ? 'islands' : 'bankBar');
    }
  }
  const BAND = { currentBand: 1, fall: 1, gate: 1, wall: 1, wind: 1, timber: 1, bankBar: 1 };
  let bands = parts.filter((p) => BAND[p]);
  while (bands.length > 2) {
    // for mange bånd: gjør ett om til en variant som ikke går på tvers
    const p = bands.splice(Math.floor(r() * bands.length), 1)[0];
    const alt = { currentBand: 'currentLane', fall: 'cascade', wind: 'ice', bankBar: 'islands', gate: 'wall' }[p];
    parts[parts.indexOf(p)] = alt || p;
    if (BAND[alt]) bands.push(alt);
  }
  bands = parts.filter((p) => BAND[p]);
  // bånd som trenger mye plass legges hver for seg
  const half = { currentBand: 45, timber: 42, wind: 50, fall: 8, gate: 8, wall: 8, bankBar: 18 };
  const ys = bands.length === 1 ? [ri(250, 360)] : bands.length === 2 ? [ri(205, 255), ri(355, 405)] : [];
  if (bands.length === 2 && chance(0.5)) bands.reverse();
  const top = bands.length ? ys[0] - half[bands[0]] : 260;
  const bottom = bands.length ? ys[ys.length - 1] + half[bands[bands.length - 1]] : 340;

  // 2) Båndene
  bands.forEach((p, i) => {
    const y = ys[i];
    if (p === 'currentBand' || p === 'timber') {
      const h = p === 'timber' ? ri(70, 86) : ri(72, 96);
      const sp = p === 'timber' ? ri(40, 58) : ri(45, 85);
      const dir = chance(0.5) ? 1 : -1;
      const c = add('currents', { x: 0, y: Math.round(y - h / 2), w: 360, h, vx: dir * sp, vy: 0 });
      zones.push(Object.assign({ m: 16 }, c));
      if (p === 'timber') {
        const g0 = Math.round(R(0.6, 1.0) * 10) / 10, g1 = Math.round(R(1.7, 2.6) * 10) / 10;
        add('timber', { x1: dir > 0 ? -60 : 420, y1: y, x2: dir > 0 ? 420 : -60, y2: y, speed: sp, len: ri(50, 68), gap: [g0, g1], seed: I(1, 999) });
      }
    } else if (p === 'wind') {
      const h = ri(80, 110);
      const q = add('winds', { x: 0, y: Math.round(y - h / 2), w: 360, h, ax: (chance(0.5) ? 1 : -1) * ri(40, 75), ay: 0 });
      zones.push(Object.assign({ m: 16 }, q));
    } else if (p === 'fall') {
      const s = ri(-35, 35);
      // fra venstre mot høyre: siden nedenfor (større y) er lavere
      add('falls', { x1: 0, y1: y - s, x2: 360, y2: y + s });
      zones.push({ x: 0, y: y - 45, w: 360, h: 90, m: 0 });
    } else if (p === 'gate') {
      const g = add('gates', { x1: -10, y1: y, x2: 370, y2: y });
      solids.push({ x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, r: 7 });
      lv.needSwitch = y;
    } else if (p === 'wall') {
      const L = ri(170, 250), left = chance(0.5), s = ri(-30, 30);
      const wl = add('walls', left ? { x1: -10, y1: y - s, x2: L, y2: y + s } : { x1: 370, y1: y - s, x2: 360 - L, y2: y + s });
      solids.push({ x1: wl.x1, y1: wl.y1, x2: wl.x2, y2: wl.y2, r: 7 });
    } else if (p === 'bankBar') {
      const h = chance(0.5) ? 1 : 2, rr = ri(14, 20), s = ri(-25, 25);
      if (chance(0.55)) {
        // sandbanke tvers over med en åpning
        const gx = ri(80, 280), gw = ri(70, 100);
        add('banks', { x1: -10, y1: y - s, x2: gx - gw / 2, y2: y, r: rr, h });
        add('banks', { x1: gx + gw / 2, y1: y, x2: 370, y2: y + s, r: rr, h: chance(0.5) ? h : 3 - h });
      } else {
        const L = ri(200, 270), left = chance(0.5);
        add('banks', left ? { x1: -10, y1: y - s, x2: L, y2: y + s, r: rr, h } : { x1: 370, y1: y - s, x2: 360 - L, y2: y + s, r: rr, h });
      }
      for (const k of lv.banks) solids.push(Object.assign({}, k, { r: k.r + 4 }));
    }
  });

  // 3) Ting som tar plass i midten
  for (const p of parts) {
    if (p === 'currentLane') {
      const w = ri(70, 95), x = ri(70, 290 - w), y0 = ri(60, 200), y1 = ri(400, 540);
      const c = add('currents', { x, y: y0, w, h: y1 - y0, vx: 0, vy: (chance(0.5) ? 1 : -1) * ri(45, 75) });
      zones.push(Object.assign({ m: 16 }, c));
    } else if (p === 'cascade') {
      for (let k = 0; k < 40; k++) {
        const rad = ri(46, 58), x = ri(80, 280), y = ri(top - 10, bottom + 10);
        if (!clear(x, y, rad, 20)) continue;
        add('cascades', { x, y, r: rad }); zones.push({ x, y, r: rad + 18 }); solids.push({ x, y, r: 16 });
        break;
      }
    } else if (p === 'mael') {
      for (let k = 0; k < 40; k++) {
        const rad = ri(85, 110), x = ri(70, 290), y = ri(Math.max(200, top), Math.min(420, bottom + 30));
        if (!clear(x, y, 30, 10)) continue;
        add('maels', { x, y, r: rad }); zones.push({ x, y, r: rad + 16 });
        break;
      }
    } else if (p === 'ice') {
      const x = ri(10, 60), w = ri(240, 340 - x), y = ri(top - 40, bottom - 60), h = ri(130, 230);
      add('ice', { x, y, w, h: Math.min(h, 560 - y) });
    } else if (p === 'islands') {
      const n = I(1, 2);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 40; k++) {
          const rr = ri(22, 34), x = ri(60, 300), y = ri(top, bottom + 40);
          if (!clear(x, y, rr, 30)) continue;
          const kb = add('banks', { x1: x, y1: y, r: rr, h: chance(0.6) ? 1 : 2 });
          solids.push({ x, y, r: kb.r + 4 });
          break;
        }
      }
    }
  }
  if (lv.banks) lv.tide = pickOne([[2, 1, 0, 1], [2, 1, 0, 1], [2, 0], [1, 0], [2, 1, 0], [0, 1, 2, 1], [2, 2, 1, 0, 0, 1]]);

  // 4) Havner og båter. Båtene står øverst, havnene nederst (noen ganger
  //    står en havn eller båt mellom to bånd).
  const nb = tier === 0 ? 1 : tier === 1 ? I(1, 2) : tier === 2 ? I(1, 2) : I(2, 3);
  const colored = nb >= 2 && chance(0.35);
  const startMax = Math.max(95, top - 45), goalMin = Math.min(470, bottom + 50);
  const midOK = bands.length === 2 && ys[1] - ys[0] > 150;
  const boatSpots = [], dockSpots = [];
  const okBoat = (x, y) => clear(x, y, 13, 22) && !inZone(x, y, 16) && boatSpots.every((b) => Math.hypot(b.x - x, b.y - y) > 60);
  const okDock = (x, y) => clear(x, y, 24, 22) && !inZone(x, y, 12) && dockSpots.every((d) => Math.hypot(d.x - x, d.y - y) > 75);
  for (let i = 0; i < nb; i++) {
    let d = null, b = null;
    for (let k = 0; k < 60 && !d; k++) {
      const mid = midOK && chance(0.2);
      const x = ri(45, 315), y = mid ? Math.round((ys[0] + ys[1]) / 2 + R(-20, 20)) : ri(goalMin, 545);
      if (okDock(x, y)) d = { x, y };
    }
    if (!d) return null;
    dockSpots.push(d);
    for (let k = 0; k < 80 && !b; k++) {
      const mid = midOK && chance(0.15);
      const x = ri(40, 320), y = mid ? Math.round((ys[0] + ys[1]) / 2 + R(-20, 20)) : ri(62, startMax);
      if (Math.abs(y - d.y) < 150) continue;
      if (okBoat(x, y)) b = { x, y };
    }
    if (!b) return null;
    boatSpots.push(b);
  }
  boatSpots.forEach((b, i) => {
    const o = { x: b.x, y: b.y };
    if (colored) o.color = i;
    add('boats', o);
    solids.push({ x: b.x, y: b.y, r: 13 });
  });
  dockSpots.forEach((d, i) => {
    const o = { x: d.x, y: d.y };
    if (colored) o.color = i;
    add('docks', o);
    solids.push({ x: d.x, y: d.y, r: 24 });
  });
  for (const b of lv.boats) for (const d of lv.docks) if (Math.hypot(b.x - d.x, b.y - d.y) < 90) return null;
  if (groups.includes('regn') && chance(tier >= 2 ? 0.55 : 0.35)) lv.boats[Math.floor(r() * lv.boats.length)].heavy = true;

  // 5) Bryter til sluseporten: på samme side som båtene, et stykke unna
  if (lv.needSwitch != null) {
    let s = null;
    for (let k = 0; k < 60 && !s; k++) {
      const x = ri(40, 320), y = ri(70, lv.needSwitch - 40);
      if (clear(x, y, 13, 30) && !inZone(x, y, 10) && lv.boats.every((b) => Math.hypot(b.x - x, b.y - y) > 70)) s = { x, y, gate: 0 };
    }
    if (!s) return null;
    add('switches', s);
    delete lv.needSwitch;
  }

  // 6) Regnskyer, frosker og litt stein, stokk, vannlilje og virvel
  for (const p of parts) {
    if (p === 'rain') {
      const n = tier === 0 ? 1 : tier === 1 ? I(1, 2) : I(2, 3);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 50; k++) {
          const x = ri(40, 320), y = ri(150, 560);
          if (!Engine.insidePond(x, y, 20)) continue;
          if (lv.boats.some((b) => Math.hypot(b.x - x, b.y - y) < C.RAIN_RANGE + 20)) continue;
          if ((lv.rain || []).some((d) => Math.hypot(d.x - x, d.y - y) < 90)) continue;
          if (solids.some((s) => dist(x, y, s) < 8)) continue;
          const d = { x, y };
          if (tier >= 1 || chance(0.5)) d.every = Math.round(R(0.9, 1.3) * 10) / 10;
          if (chance(0.5)) d.delay = Math.round(R(0.3, 1.1) * 10) / 10;
          add('rain', d);
          break;
        }
      }
      if (!lv.rain) return null;
    } else if (p === 'frog') {
      const n = tier >= 2 && chance(0.4) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const hops = [];
        for (let k = 0; k < 120 && hops.length < (chance(0.3) ? 3 : 2); k++) {
          const x = ri(40, 320), y = ri(110, 540);
          if (!clear(x, y, 12, 14) || inZone(x, y, 0)) continue;
          if (lv.boats.some((b) => Math.hypot(b.x - x, b.y - y) < 45)) continue;
          const last = hops[hops.length - 1];
          if (last && (Math.hypot(last[0] - x, last[1] - y) < 70 || Math.hypot(last[0] - x, last[1] - y) > 170)) continue;
          hops.push([x, y]);
        }
        if (hops.length >= 2) { add('frogs', { hops }); for (const [x, y] of hops) solids.push({ x, y, r: 10 }); }
      }
      if (!lv.frogs) return null;
      if (chance(0.35)) {
        lv.dark = true;
        for (let i = I(0, 2); i > 0; i--) {
          const x = ri(40, 320), y = ri(120, 500);
          if (clear(x, y, 10, 10)) add('lamps', { x, y, r: 70 });
        }
      }
    }
  }
  const nRocks = I(0, tier >= 2 ? 2 : 1), nLogs = chance(0.3 + 0.1 * tier) ? 1 : 0;
  const path = (x, y) => lv.boats.some((b, i) => segDist(x, y, { x1: b.x, y1: b.y, x2: lv.docks[i].x, y2: lv.docks[i].y }) < 45);
  for (let i = 0; i < nRocks; i++) {
    for (let k = 0; k < 50; k++) {
      const rad = ri(18, 30), x = ri(40, 320), y = ri(90, 520);
      if (!clear(x, y, rad, 30) || inZone(x, y, rad - 10) || (k < 30 && !path(x, y))) continue;
      add('rocks', { x, y, r: rad }); solids.push({ x, y, r: rad });
      break;
    }
  }
  for (let i = 0; i < nLogs; i++) {
    for (let k = 0; k < 50; k++) {
      const len = R(80, 140), a = r() * Math.PI, cx = ri(70, 290), cy = ri(110, 500);
      const s = { x1: Math.round(cx - Math.cos(a) * len / 2), y1: Math.round(cy - Math.sin(a) * len / 2), x2: Math.round(cx + Math.cos(a) * len / 2), y2: Math.round(cy + Math.sin(a) * len / 2), r: 8 };
      if (![[s.x1, s.y1], [s.x2, s.y2], [cx, cy]].every(([x, y]) => clear(x, y, 8, 28) && !inZone(x, y, 0))) continue;
      add('logs', s); solids.push(s);
      break;
    }
  }
  if (chance(0.15 + 0.05 * tier)) {
    for (let k = 0; k < 40; k++) {
      const rad = ri(46, 58), x = ri(70, 290), y = ri(150, 470);
      if (!clear(x, y, rad, 16) || inZone(x, y, rad)) continue;
      add('whirls', { x, y, r: rad, power: 1 }); zones.push({ x, y, r: rad + 16 });
      break;
    }
  }
  if (chance(0.15)) {
    for (let k = 0; k < 40; k++) {
      const rad = ri(20, 24), x = ri(50, 310), y = ri(120, 500);
      if (!clear(x, y, rad, 26) || inZone(x, y, rad)) continue;
      add('pads', { x, y, r: rad }); solids.push({ x, y, r: rad });
      break;
    }
  }

  // 7) Ingen båt eller havn i et felt som flytter ting (virvel kom sist)
  for (const b of lv.boats) if (inZone(b.x, b.y, 14)) return null;
  for (const d of lv.docks) if (inZone(d.x, d.y, 4)) return null;

  // 8) Speil tilfeldig
  const fx = chance(0.5), fy = chance(0.6);
  return mirror(lv, fx, fy);
}

// Speiler hele banen. Fosser og sandbanker beholder riktig side.
function mirror(lv, fx, fy) {
  const X = (x) => (fx ? 360 - x : x), Y = (y) => (fy ? 600 - y : y);
  const pt = (o) => { if (o.x != null) o.x = X(o.x); if (o.y != null) o.y = Y(o.y); };
  const seg = (o) => { o.x1 = X(o.x1); o.x2 = X(o.x2); o.y1 = Y(o.y1); o.y2 = Y(o.y2); };
  const rect = (o) => { if (fx) o.x = 360 - o.x - o.w; if (fy) o.y = 600 - o.y - o.h; if (fx && o.vx) o.vx = -o.vx; if (fy && o.vy) o.vy = -o.vy; };
  for (const k of ['boats', 'docks', 'rocks', 'pads', 'whirls', 'cascades', 'maels', 'rain', 'switches', 'lamps']) (lv[k] || []).forEach(pt);
  for (const k of ['logs', 'walls', 'gates', 'timber']) (lv[k] || []).forEach(seg);
  for (const k of ['currents', 'ice']) (lv[k] || []).forEach(rect);
  for (const q of lv.winds || []) { if (fx) { q.x = 360 - q.x - q.w; q.ax = -q.ax; } if (fy) { q.y = 600 - q.y - q.h; q.ay = -q.ay; } }
  for (const k of lv.banks || []) { k.x1 = X(k.x1); k.y1 = Y(k.y1); if (k.x2 != null) { k.x2 = X(k.x2); k.y2 = Y(k.y2); } }
  for (const f of lv.frogs || []) f.hops = f.hops.map(([x, y]) => [X(x), Y(y)]);
  // en speiling snur hvilken side av fossen som er lavest: bytt endepunktene
  const swaps = (fx ? 1 : 0) + (fy ? 1 : 0);
  for (const f of lv.falls || []) {
    f.x1 = X(f.x1); f.y1 = Y(f.y1); f.x2 = X(f.x2); f.y2 = Y(f.y2);
    if (swaps % 2) { [f.x1, f.x2] = [f.x2, f.x1]; [f.y1, f.y2] = [f.y2, f.y1]; }
  }
  return lv;
}

/* ---------------- testing ---------------- */
// Ligger alt stille før første trykk?
function still(level) {
  const w = Engine.createWorld(level);
  for (let i = 0; i < 4 / C.DT; i++) { Engine.step(w); w.events.length = 0; }
  return w.bodies.every((b) => b.sink === 0 && Math.hypot(b.x - b.sx, b.y - b.sy) < 0.5)
    && w.pads.every((p) => p.sink === 0);
}

// Spiller løsningen og noterer hvilke mekanikker båtene faktisk møtte.
function touches(level, taps) {
  // tømmeret tas bort her, akkurat som i løseren (timingCheck sjekker det etterpå)
  const river = !!(level.timber && level.timber.length);
  const w = Engine.createWorld(level);
  w.noTimber = true;
  const got = new Set();
  const startLv = w.boats.map((b) => b.lv);
  const padStart = w.pads.map((p) => [p.x, p.y]);
  const look = () => {
    for (const b of w.boats) {
      if (b.dock >= 0) continue;
      if (w.currents.some((c) => inRect(b.x, b.y, c, 0))) got.add('bekk');
      if (w.cascades.some((c) => Math.hypot(b.x - c.x, b.y - c.y) < c.r + 6)) got.add('foss');
      if (w.ice.some((q) => inRect(b.x, b.y, q, 0)) || w.winds.some((q) => inRect(b.x, b.y, q, 0))) got.add('is');
      if (w.maels.some((m) => Math.hypot(b.x - m.x, b.y - m.y) < m.r)) got.add('fjord');
      if (river && w.currents.some((c) => inRect(b.x, b.y, c, 0))) got.add('elv');
      if (w.banks.some((k) => Engine.bankUp(w, k) && segDist(b.x, b.y, k) < k.r + 30)) got.add('fjord');
      if (w.walls.some((s) => segDist(b.x, b.y, s) < 40)) got.add('sluse');
    }
    w.boats.forEach((b, i) => { if (b.lv !== startLv[i]) got.add('foss'); });
    for (const rp of w.ripples) if (rp.kind === 'rain' && rp.hit.some((id) => w.bodies[id].kind === 'boat')) got.add('regn');
    if (w.gates.some((g) => g.open)) got.add('sluse');
    if (w.frogs.some((f) => f.jt >= 0)) got.add('natt');
    w.pads.forEach((p, i) => { if (Math.hypot(p.x - padStart[i][0], p.y - padStart[i][1]) > 10) got.add('pad'); });
  };
  for (const [x, y] of taps) {
    Engine.tap(w, x, y);
    for (let i = 0; i < 12 / C.DT; i++) {
      Engine.step(w); w.events.length = 0; look();
      if (w.done || Engine.isSettled(w)) break;
    }
    if (w.done) break;
  }
  if (w.boats.some((b) => b.heavy)) got.add('regn-tung');
  return { got, done: w.done };
}

async function judge(solver, level, groups) {
  if (!still(level)) return { why: 'beveger seg før første trykk' };
  const res = await solver.analyze(level, { grid: 12, beam: 8, maxDepth: 4, stopDepth: 1 });
  const m = res.min;
  if (!m) return { why: 'ingen løsning på 4' };
  const frac1 = res.found[1] / res.total1;
  if (frac1 > 0.03) return { why: 'for lett (' + (100 * frac1).toFixed(1) + ' %)' };
  if (m === 1 && res.found[1] < 15) return { why: 'perla krever flaks' };
  if (m >= 2 && res.found[m] < 6) return { why: 'perla krever flaks' };
  const t = touches(level, res.example);
  if (!t.done) return { why: 'eksempelet vinner ikke' };
  for (const g of groups) if (!t.got.has(g) && !(g === 'regn' && t.got.has('regn-tung'))) return { why: 'bruker ikke ' + g };
  let timing = null;
  if (level.timber) {
    timing = timingCheck(level, res.example);
    if (timing.length < res.example.length || timing.some((x) => x.best < 0.25)) return { why: 'tømmeret stenger' };
  }
  return { ok: true, min: m, found: res.found, total1: res.total1, frac1, example: res.example, timing, got: [...t.got] };
}

// Hvor vanskelig er banen? Flere trykk = vanskeligere. Med samme antall
// trykk er et smalt vindu (få gode trykkpunkter) vanskeligere.
function difficulty(c) {
  const n = c.found[c.min];
  const narrow = c.min === 1 ? 1 - Math.min(1, Math.log10(n / 15) / 1.6) : 1 - Math.min(1, Math.log10(n / 6) / 2.5);
  const L = c.level;
  const stuff = ['rocks', 'logs', 'pads', 'whirls', 'rain', 'frogs', 'banks', 'maels', 'cascades', 'walls'].reduce((s, k) => s + (L[k] ? L[k].length : 0), 0);
  return c.min + 0.8 * Math.max(0, narrow) + 0.25 * (L.boats.length - 1) + 0.03 * stuff;
}

/* ---------------- utskrift som levels.js ---------------- */
function fmtLevel(id, L, par, pearl) {
  const j = (v) => JSON.stringify(v).replace(/"(\w+)":/g, '$1: ').replace(/,(?=[-\da-z\[{])/g, ', ').replace(/\{/g, '{ ').replace(/\}/g, ' }');
  const lines = [`        {`, `          id: '${id}',`, `          name: { no: '', en: '' },`, `          par: ${par}, pearl: ${pearl},`];
  const order = ['dark', 'tide', 'boats', 'docks', 'rocks', 'logs', 'pads', 'whirls', 'currents', 'timber', 'falls', 'cascades', 'rain', 'walls', 'gates', 'switches', 'frogs', 'lamps', 'ice', 'winds', 'banks', 'maels'];
  for (const k of order) if (L[k] != null) lines.push(`          ${k}: ${j(L[k])},`);
  lines.push('        },');
  return lines.join('\n');
}

/* ---------------- kommandoer ---------------- */
function load(world) {
  const f = path.join(OUT, world + '.jsonl');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

async function make(world, want, tiers) {
  const rc = RECIPES[world];
  if (!rc) { console.log('Ingen oppskrift for verden', world); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, world + '.jsonl');
  const have = load(world);
  let seed = have.length ? Math.max(...have.map((c) => c.seed)) + 1 : world * 100000 + 1;
  const solver = makeSolver();
  const t0 = Date.now();
  let made = 0, tried = 0;
  const why = {};
  while (made < want) {
    const s = seed++;
    const tier = tiers ? tiers[s % tiers.length] : s % 4;
    // tre-gruppers verdener: noen baner bruker bare to av gruppene
    let groups = rc.groups;
    if (groups.length === 3 && s % 3 === 0) groups = groups.filter((g, i) => i !== (s >> 2) % 3);
    const lv = build(groups, s, tier);
    if (!lv) continue;
    tried++;
    const j = await judge(solver, lv, groups);
    if (!j.ok) {
      why[j.why] = (why[j.why] || 0) + 1;
      if (tried % 20 === 0) console.log(`  (${tried} prøvd, forkastet: ${JSON.stringify(why)})`);
      continue;
    }
    made++;
    const c = { seed: s, tier, groups, min: j.min, found: j.found, total1: j.total1, example: j.example, timing: j.timing, got: j.got, level: lv };
    c.diff = +difficulty(c).toFixed(2);
    fs.appendFileSync(file, JSON.stringify(c) + '\n');
    console.log(`  #${have.length + made} frø ${s} (${groups.join('+')}): ${j.min} trykk, ${j.found[j.min]} vinnere, vansk ${c.diff} – ${tried} prøvd, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  console.log('Forkastet:', JSON.stringify(why));
  await solver.close();
}

// Velger n baner med jevn stigning i vanskelighet. Nest siste bane er et
// pusterom, siste bane er finalen.
function pick(world, n, lo, hi) {
  const all = load(world).sort((a, b) => a.diff - b.diff);
  const pool = all.filter((c) => c.diff >= lo && c.diff <= hi);
  const out = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    let target = lo + (hi - lo) * (i / (n - 1));
    if (i === n - 2) target = lo + (hi - lo) * 0.35;
    let best = null;
    for (const c of pool) if (!used.has(c.seed) && (!best || Math.abs(c.diff - target) < Math.abs(best.diff - target))) best = c;
    if (!best) break;
    used.add(best.seed); out.push(best);
  }
  return out;
}

if (require.main === module) {
  const [cmd, w, a, b, c] = process.argv.slice(2);
  if (cmd === 'make') make(+w, +a || 20, b ? b.split(',').map(Number) : null);
  else if (cmd === 'pick') {
    const list = pick(+w, +a || 15, b != null ? +b : 1.5, c != null ? +c : 4.2);
    list.forEach((x, i) => {
      console.log(`// ${w}-${i + 1}: frø ${x.seed}, ${x.min} trykk, ${x.found[x.min]} vinnere, vansk ${x.diff}, ${x.groups.join('+')}`);
      console.log(fmtLevel(`${w}-${i + 1}`, x.level, x.min + 1, x.min));
    });
  } else if (cmd === 'show') {
    const x = load(+w).find((q) => q.seed === +a);
    console.log(JSON.stringify(x.level));
    console.log(asciiMap(x.level, []));
    console.log('løsning:', JSON.stringify(x.example), 'vansk', x.diff, 'traff:', x.got.join(', '));
  } else console.log('Bruk: node tools/worldgen.js make <verden> <antall> | pick <verden> [antall] | show <verden> <frø>');
}

module.exports = { RECIPES, build, judge, difficulty, fmtLevel };
