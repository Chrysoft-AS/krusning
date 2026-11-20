/* =====================================================================
 * Krusning – brettgenerator (Rask runde og Dagens dam)
 * ---------------------------------------------------------------------
 * Lager et brett fra et tall («frø»). Samme frø og samme nivå gir
 * ALLTID det samme brettet, på alle telefoner. Derfor kan vi teste
 * brettene på forhånd (tools/gen.js) og bare lagre frøene i js/pool.js.
 *
 * VIKTIG: endrer du noe her (eller i Engine.C), blir brettene andre.
 * Kjør da `node tools/gen.js` på nytt, så lista i pool.js stemmer.
 *
 * Nivåer:
 *   easy   – 1 båt, litt stein og stokk
 *   medium – 1–2 båter, også vannliljer og virvel
 *   hard   – 2–3 båter, også strøm (bare i Rask runde)
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // øk når brettene endres, og lag pool.js på nytt

  // Liten, rask tilfeldighetsgenerator som alltid gir samme rekke for samme frø.
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const TIERS = {
    easy:   { boats: [1, 1], rocks: [0, 1], logs: [0, 1], pads: [0, 0], whirl: 0,    current: 0,    gap: [120, 300] },
    medium: { boats: [1, 2], rocks: [0, 2], logs: [0, 1], pads: [0, 1], whirl: 0.35, current: 0,    gap: [140, 380] },
    hard:   { boats: [2, 3], rocks: [1, 2], logs: [0, 1], pads: [0, 2], whirl: 0.4,  current: 0.45, gap: [140, 420] },
  };

  // Navn som settes sammen: «Stille vik», «Quiet cove» osv.
  const ADJ = [
    ['Stille', 'Quiet'], ['Lune', 'Snug'], ['Blank', 'Glassy'], ['Grønn', 'Green'], ['Lys', 'Bright'],
    ['Dyp', 'Deep'], ['Liten', 'Little'], ['Kald', 'Cool'], ['Solrik', 'Sunny'], ['Skjult', 'Hidden'],
    ['Rolig', 'Calm'], ['Gammel', 'Old'], ['Ny', 'New'], ['Lang', 'Long'], ['Vind', 'Windy'], ['Sølv', 'Silver'],
  ];
  const NOUN = [
    ['vik', 'cove'], ['dam', 'pond'], ['pytt', 'puddle'], ['bukt', 'bay'], ['kulp', 'pool'], ['tjern', 'tarn'],
    ['os', 'inlet'], ['sund', 'sound'], ['våg', 'creek'], ['strand', 'shore'], ['brygge', 'pier'], ['havn', 'harbour'],
  ];

  function make(seed, tier, opts) {
    const cfg = TIERS[tier] || TIERS.easy;
    const o = opts || {};
    const r = rng(seed * 7919 + (tier === 'easy' ? 1 : tier === 'medium' ? 2 : 3));
    const between = (a, b) => a + r() * (b - a);
    const count = (mm) => mm[0] + Math.floor(r() * (mm[1] - mm[0] + 1));

    const W = 360, H = 600;
    const circles = [];          // alt rundt som er plassert: { x, y, r }
    const segs = [];             // stokker
    const lv = { boats: [], docks: [], rocks: [], logs: [], pads: [], whirls: [], currents: [] };

    function segDist(px, py, s) {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      const L = dx * dx + dy * dy || 1;
      let tt = ((px - s.x1) * dx + (py - s.y1) * dy) / L;
      tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      return Math.hypot(px - (s.x1 + dx * tt), py - (s.y1 + dy * tt));
    }
    function free(x, y, rad, pad) {
      if (x < rad + 28 || x > W - rad - 28 || y < rad + 28 || y > H - rad - 28) return false;
      for (const c of circles) if (Math.hypot(c.x - x, c.y - y) < c.r + rad + pad) return false;
      for (const s of segs) if (segDist(x, y, s) < s.r + rad + pad) return false;
      return true;
    }
    function inCurrent(x, y, m) {
      return lv.currents.some((c) => x > c.x - m && x < c.x + c.w + m && y > c.y - m && y < c.y + c.h + m);
    }
    function place(rad, pad, extra) {
      for (let k = 0; k < 60; k++) {
        const x = between(rad + 28, W - rad - 28), y = between(rad + 70, H - rad - 40);
        if (free(x, y, rad, pad) && (!extra || extra(x, y))) return { x: Math.round(x), y: Math.round(y) };
      }
      return null;
    }

    // strøm: et bredt bånd på tvers eller på langs
    if (!o.noCurrent && r() < cfg.current) {
      if (r() < 0.5) {
        const h = Math.round(between(70, 110)), y = Math.round(between(200, 380));
        lv.currents.push({ x: 0, y, w: W, h, vx: (r() < 0.5 ? -1 : 1) * Math.round(between(60, 95)), vy: 0 });
      } else {
        const w = Math.round(between(70, 100)), x = Math.round(between(110, 250 - w / 2));
        lv.currents.push({ x, y: 60, w, h: 480, vx: 0, vy: (r() < 0.5 ? -1 : 1) * Math.round(between(60, 95)) });
      }
    }
    // virvel
    if (r() < cfg.whirl) {
      const rad = Math.round(between(48, 62));
      const p = place(rad, 30, (x, y) => !inCurrent(x, y, rad));
      if (p) { lv.whirls.push({ x: p.x, y: p.y, r: rad, power: 1 }); circles.push({ x: p.x, y: p.y, r: rad }); }
    }
    // steiner
    for (let i = count(cfg.rocks); i > 0; i--) {
      const rad = Math.round(between(18, 32));
      const p = place(rad, 40, (x, y) => !inCurrent(x, y, rad));
      if (p) { lv.rocks.push({ x: p.x, y: p.y, r: rad }); circles.push({ x: p.x, y: p.y, r: rad }); }
    }
    // stokker
    for (let i = count(cfg.logs); i > 0; i--) {
      for (let k = 0; k < 40; k++) {
        const len = between(80, 150), a = r() * Math.PI;
        const cx = between(80, W - 80), cy = between(140, H - 110);
        const s = {
          x1: Math.round(cx - Math.cos(a) * len / 2), y1: Math.round(cy - Math.sin(a) * len / 2),
          x2: Math.round(cx + Math.cos(a) * len / 2), y2: Math.round(cy + Math.sin(a) * len / 2), r: 8,
        };
        if (!free(s.x1, s.y1, 8, 36) || !free(s.x2, s.y2, 8, 36) || !free(cx, cy, 8, 36)) continue;
        if (inCurrent(s.x1, s.y1, 10) || inCurrent(s.x2, s.y2, 10)) continue;
        lv.logs.push(s); segs.push(s); break;
      }
    }
    // vannliljer
    for (let i = count(cfg.pads); i > 0; i--) {
      const rad = Math.round(between(20, 26));
      const p = place(rad, 36, (x, y) => !inCurrent(x, y, rad));
      if (p) { lv.pads.push({ x: p.x, y: p.y, r: rad, flower: r() < 0.5 }); circles.push({ x: p.x, y: p.y, r: rad }); }
    }
    // havner og båter, i par, med god avstand mellom båt og havn
    const nBoats = count(cfg.boats);
    for (let i = 0; i < nBoats; i++) {
      const d = place(24, 26, (x, y) => !inCurrent(x, y, 26));
      if (!d) return null;
      circles.push({ x: d.x, y: d.y, r: 24 });
      const b = place(13, 22, (x, y) => {
        if (inCurrent(x, y, 14)) return false;
        const g = Math.hypot(x - d.x, y - d.y);
        if (g < cfg.gap[0] || g > cfg.gap[1]) return false;
        for (const dd of lv.docks) if (Math.hypot(x - dd.x, y - dd.y) < 90) return false;
        return true;
      });
      if (!b) return null;
      lv.docks.push(d);
      lv.boats.push({ x: b.x, y: b.y, angle: Math.round((r() * 2 - 1) * Math.PI * 100) / 100 });
      circles.push({ x: b.x, y: b.y, r: 13 });
    }
    // ingen båt for nær en havn den ikke skal til
    for (const b of lv.boats) for (const d of lv.docks) if (Math.hypot(b.x - d.x, b.y - d.y) < 70) return null;

    const ai = Math.floor(r() * ADJ.length), ni = Math.floor(r() * NOUN.length);
    lv.name = { no: ADJ[ai][0] + ' ' + NOUN[ni][0], en: ADJ[ai][1] + ' ' + NOUN[ni][1] };
    lv.id = tier[0].toUpperCase() + seed;
    lv.seed = seed; lv.tier = tier;
    for (const k of ['rocks', 'logs', 'pads', 'whirls', 'currents']) if (!lv[k].length) delete lv[k];
    return lv;
  }

  // Ferdig bane fra en rad i pool.js: [frø, par, perle]
  function fromPool(row, tier, opts) {
    const lv = make(row[0], tier, opts);
    if (!lv) return null;
    lv.par = row[1]; lv.pearl = row[2];
    return lv;
  }

  const api = { VERSION, TIERS, rng, make, fromPool };
  root.Gen = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
