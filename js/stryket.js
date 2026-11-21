/* =====================================================================
 * Krusning – Stryket (elvestryk)
 * ---------------------------------------------------------------------
 * En egen spillmodus: elva renner av seg selv, og du styrer båten til
 * sidene med krusninger. Trykk til venstre for båten, så glir den mot
 * høyre. Unngå steiner, tømmerstokker og virvler, og kom deg til havna.
 *
 * Her ligger bare simuleringen og banene (ingen tegning, ingen DOM,
 * ingen tilfeldighet). Samme trykk til samme tid gir alltid samme løp,
 * slik at tools/stryk.js kan teste at banene går an å klare.
 *
 * Koordinater: skjermen er 360 × 600 som dammen. Båten ligger fast
 * rundt y = 450, og elva ruller forbi. Alt i elva har en avstand `d`
 * fra start (oppover), og en x fra venstre.
 * ===================================================================== */
(function (root) {
  'use strict';

  const K = {
    W: 360, H: 600, DT: 1 / 120,
    BOAT_Y: 450,                 // der båten ligger på skjermen
    BOAT_R: 11,                  // båtens størrelse når den krasjer (litt snill)
    RIPPLE_SPEED: 430,           // krusningen sprer seg fortere enn i dammen
    RIPPLE_RANGE: 190,           // og rekker kortere
    FALLOFF_POW: 1.15,
    PUSH: 300,                   // største fart sidelengs fra én krusning
    PUSH_STEPS: 6,
    SIDE_DRAG: 2.4,              // hvor fort båten stopper sidelengs
    Y_SPRING: 5, Y_DRAG: 4,      // båten glir tilbake til plassen sin
    Y_MIN: 340, Y_MAX: 540,
    REST_BANK: 0.45,             // sprett mot elvebredden
    LOG_R: 8,                    // tømmerstokkens tykkelse (radius)
    WHIRL_PULL: 240,             // virvel: sug inn mot midten…
    WHIRL_SWIRL: 120,            // …og rundt
    WHIRL_CORE: 13,              // midt i virvelen blir båten dratt ned
    PEARL_R: 20,                 // så nærme må båten for å ta perla
    TAP_GAP: 0.1,                // minste tid mellom to trykk
    MAX_RIPPLES: 6,
    SINK_TIME: 1.0,              // tid fra krasj til ny start
    LEAD: 170,                   // ny start så langt før siste bøye
    DOCK_IN: 90,                 // målet regnes som nådd så langt før brygga
  };

  const TAU = Math.PI * 2;
  const SIDE_MUL = Math.exp(-K.SIDE_DRAG * K.DT);
  const Y_MUL = Math.exp(-K.Y_DRAG * K.DT);

  function falloff(d) {
    if (d >= K.RIPPLE_RANGE) return 0;
    return Math.pow(1 - d / K.RIPPLE_RANGE, K.FALLOFF_POW);
  }

  // Verdi langs elva: lista er [[d, a, b, …], …] sortert på d.
  function along(list, d, col) {
    if (!list || !list.length) return null;
    if (d <= list[0][0]) return list[0][col];
    for (let i = 1; i < list.length; i++) {
      if (d <= list[i][0]) {
        const a = list[i - 1], b = list[i];
        const u = (d - a[0]) / (b[0] - a[0] || 1);
        return a[col] + (b[col] - a[col]) * u;
      }
    }
    return list[list.length - 1][col];
  }

  function speedAt(lv, d) { return along(lv.speed, d, 1) || 90; }
  function bankL(lv, d) { const v = along(lv.banks, d, 1); return v == null ? 26 : v; }
  function bankR(lv, d) { const v = along(lv.banks, d, 2); return v == null ? 334 : v; }

  /* ---------- oppretting ---------- */

  function create(lv) {
    const st = {
      lv, t: 0, steps: 0, dist: 0,
      x: lv.startX || 180, y: K.BOAT_Y, vx: 0, vy: 0,
      ripples: [], events: [], lastTap: -9,
      taps: 0, crashes: 0, cp: 0,
      got: (lv.pearls || []).map(() => false), pearls: 0,
      sink: 0, sinkX: 0, sinkY: 0, why: '',
      done: false, doneT: 0,
    };
    return st;
  }

  // Hvor en ting i elva (avstand d) ligger på skjermen nå.
  function sy(st, d) { return K.BOAT_Y - (d - st.dist); }
  // Båtens avstand langs elva.
  function boatD(st) { return st.dist + (K.BOAT_Y - st.y); }

  // Stokk: to ender, og eventuelt en bevegelse fram og tilbake.
  function logEnds(st, g) {
    let off = 0;
    if (g.swing) off = g.swing[0] * Math.sin(TAU * st.dist / g.swing[1] + (g.swing[2] || 0));
    return { x1: g.x1 + off, y1: sy(st, g.d1 != null ? g.d1 : g.d), x2: g.x2 + off, y2: sy(st, g.d2 != null ? g.d2 : g.d) };
  }
  function rockX(st, r) {
    return r.swing ? r.x + r.swing[0] * Math.sin(TAU * st.dist / r.swing[1] + (r.swing[2] || 0)) : r.x;
  }

  /* ---------- trykk ---------- */

  function tap(st, x, y) {
    if (st.done || st.sink > 0) return false;
    if (st.t - st.lastTap < K.TAP_GAP) return false;
    if (st.ripples.length >= K.MAX_RIPPLES) st.ripples.shift();
    st.lastTap = st.t;
    st.taps++;
    st.ripples.push({ x, y, r: 0, hit: false, push: null, n: 0 });
    st.events.push({ type: 'tap', x, y });
    return true;
  }

  /* ---------- ett tidssteg ---------- */

  function crash(st, why) {
    st.sink = K.SINK_TIME;
    st.sinkX = st.x; st.sinkY = st.y;
    st.crashes++;
    st.why = why;
    st.ripples.length = 0;
    st.events.push({ type: 'crash', x: st.x, y: st.y, why });
  }

  function respawn(st) {
    const lv = st.lv;
    const cps = lv.checkpoints || [];
    const cp = st.cp > 0 ? cps[st.cp - 1] : { d: 0, x: lv.startX || 180 };
    st.dist = Math.max(0, cp.d - K.LEAD);
    if (st.cp === 0) st.dist = 0;
    st.x = cp.x; st.y = K.BOAT_Y; st.vx = 0; st.vy = 0;
    st.ripples.length = 0;
    st.sink = 0;
    st.events.push({ type: 'respawn', x: st.x, y: st.y });
  }

  function step(st) {
    const lv = st.lv, DT = K.DT;
    st.steps++; st.t += DT;

    if (st.sink > 0) {
      st.sink -= DT;
      if (st.sink <= 0) respawn(st);
      return;
    }
    if (st.done) {
      // inne i havna: elva roer seg og båten glir inn
      st.doneT += DT;
      const v = speedAt(lv, st.dist) * Math.max(0, 1 - st.doneT / 1.2);
      st.dist += v * DT;
      st.x += (lv.dockX - st.x) * Math.min(1, DT * 3);
      st.y += (K.BOAT_Y - 40 - st.y) * Math.min(1, DT * 2);
      for (const rp of st.ripples) rp.r += K.RIPPLE_SPEED * DT;
      st.ripples = st.ripples.filter((rp) => rp.r < K.RIPPLE_RANGE + 30);
      return;
    }

    const v = speedAt(lv, st.dist);
    st.dist += v * DT;

    // krusninger: når ringen når båten, får den et dytt bort fra trykket
    for (const rp of st.ripples) {
      const prev = rp.r;
      rp.r += K.RIPPLE_SPEED * DT;
      if (!rp.hit) {
        const dx = st.x - rp.x, dy = st.y - rp.y, d = Math.hypot(dx, dy);
        if (d <= rp.r && d >= prev - 1) {
          rp.hit = true;
          const f = falloff(d);
          if (f > 0) {
            let nx, ny;
            if (d > 4) { nx = dx / d; ny = dy / d; } else { nx = dx >= 0 ? 1 : -1; ny = 0; }
            rp.push = { x: nx * K.PUSH * f / K.PUSH_STEPS, y: ny * K.PUSH * f / K.PUSH_STEPS };
            st.events.push({ type: 'hit', f });
          }
        } else if (d < prev - 1) rp.hit = true; // båten var allerede innenfor
      }
      if (rp.push && rp.n < K.PUSH_STEPS) { st.vx += rp.push.x; st.vy += rp.push.y; rp.n++; }
    }
    st.ripples = st.ripples.filter((rp) => rp.r < K.RIPPLE_RANGE + 30);

    const bd = boatD(st);

    // sidestrøm: drar båten mot en fart sidelengs
    for (const c of (lv.drifts || [])) {
      if (bd < c.d || bd > c.d + c.len || st.x < c.x1 || st.x > c.x2) continue;
      st.vx += (c.vx - st.vx) * Math.min(1, 2.2 * DT);
    }
    // virvler
    for (const wv of (lv.whirls || [])) {
      const cx = wv.x, cy = sy(st, wv.d);
      const dx = cx - st.x, dy = cy - st.y, d = Math.hypot(dx, dy);
      if (d > wv.r) continue;
      if (d < K.WHIRL_CORE) { crash(st, 'whirl'); return; }
      const k = 1 - d / wv.r;
      const nx = dx / d, ny = dy / d, dir = wv.dir || 1;
      st.vx += (nx * K.WHIRL_PULL * k + -ny * dir * K.WHIRL_SWIRL * k) * DT;
      st.vy += (ny * K.WHIRL_PULL * k + nx * dir * K.WHIRL_SWIRL * k) * DT;
    }

    // båten glir tilbake til plassen sin (opp/ned) og bremser sidelengs
    st.vy += (K.BOAT_Y - st.y) * K.Y_SPRING * DT;
    st.vx *= SIDE_MUL; st.vy *= Y_MUL;
    st.x += st.vx * DT; st.y += st.vy * DT;
    if (st.y < K.Y_MIN) { st.y = K.Y_MIN; st.vy = Math.max(0, st.vy); }
    if (st.y > K.Y_MAX) { st.y = K.Y_MAX; st.vy = Math.min(0, st.vy); }

    // elvebredden: båten spretter tilbake (ingen krasj)
    const R = K.BOAT_R, bd2 = boatD(st);
    const L = bankL(lv, bd2), Rt = bankR(lv, bd2);
    if (st.x - R < L) { st.x = L + R; if (st.vx < 0) { if (st.vx < -40) st.events.push({ type: 'bump', x: st.x - R, y: st.y, v: -st.vx }); st.vx = -st.vx * K.REST_BANK; } }
    if (st.x + R > Rt) { st.x = Rt - R; if (st.vx > 0) { if (st.vx > 40) st.events.push({ type: 'bump', x: st.x + R, y: st.y, v: st.vx }); st.vx = -st.vx * K.REST_BANK; } }

    // steiner og stokker: krasj
    for (const r of (lv.rocks || [])) {
      const ry = sy(st, r.d);
      if (ry < -60 || ry > K.H + 60) continue;
      if (Math.hypot(st.x - rockX(st, r), st.y - ry) < r.r + R) { crash(st, 'rock'); return; }
    }
    for (const g of (lv.logs || [])) {
      const e = logEnds(st, g);
      if (Math.max(e.y1, e.y2) < -60 || Math.min(e.y1, e.y2) > K.H + 60) continue;
      if (segDist(st.x, st.y, e.x1, e.y1, e.x2, e.y2) < K.LOG_R + R) { crash(st, 'log'); return; }
    }

    // perler
    (lv.pearls || []).forEach((p, i) => {
      if (st.got[i]) return;
      if (Math.hypot(st.x - p.x, st.y - sy(st, p.d)) < K.PEARL_R) {
        st.got[i] = true; st.pearls++;
        st.events.push({ type: 'pearl', x: p.x, y: sy(st, p.d), i });
      }
    });

    // bøyer (ny start herfra hvis du krasjer)
    const cps = lv.checkpoints || [];
    while (st.cp < cps.length && bd2 >= cps[st.cp].d) {
      st.cp++;
      st.events.push({ type: 'checkpoint', n: st.cp });
    }

    // havna (rett før brygga, så båten kan gli inn i åpningen)
    if (bd2 >= lv.length - K.DOCK_IN) {
      st.done = true; st.doneT = 0;
      st.events.push({ type: 'complete' });
    }
  }

  function segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L2));
    return Math.hypot(px - x1 - dx * u, py - y1 - dy * u);
  }

  function progress(st) { return Math.max(0, Math.min(1, boatD(st) / st.lv.length)); }
  function starsFor(crashes) { return crashes === 0 ? 3 : crashes <= 2 ? 2 : 1; }

  // Kopi av tilstanden (til testverktøyet, som prøver mange trykk).
  function clone(st) {
    const c = Object.assign({}, st);
    c.ripples = st.ripples.map((r) => Object.assign({}, r, { push: r.push && Object.assign({}, r.push) }));
    c.events = [];
    c.got = st.got.slice();
    return c;
  }

  /* ---------- banene ---------- */
  // rocks:  { d, x, r, swing:[utslag, bølgelengde, fase] }
  // logs:   { d, x1, x2 } (eller d1/d2 for skrå stokk), swing som over
  // whirls: { d, x, r, dir }
  // drifts: { d, len, x1, x2, vx }  sidestrøm
  // banks:  [[d, venstre, høyre], …]  elvebredden
  // speed:  [[d, fart], …]
  // checkpoints: [{ d, x }]  ny start her etter krasj
  const LEVELS = [
    {
      id: 'S-1', name: { no: 'Første stryk', en: 'First rapids' },
      tip: { no: 'Trykk ved siden av båten for å styre. Trykk til venstre, så glir den mot høyre.', en: 'Tap beside the boat to steer. Tap on its left and it glides right.' },
      startX: 180, dockX: 180, length: 6200,
      speed: [[0, 70], [2400, 85], [4400, 100], [6200, 108]],
      banks: [[0, 26, 334], [1300, 26, 334], [1500, 80, 280], [1800, 80, 280], [2000, 26, 334],
        [4600, 26, 334], [4800, 60, 300], [5600, 60, 300], [5800, 26, 334]],
      rocks: [
        { d: 600, x: 180, r: 24 },
        { d: 950, x: 95, r: 22 }, { d: 950, x: 300, r: 16 },
        { d: 1250, x: 250, r: 26 },
        { d: 1700, x: 135, r: 20 },
        { d: 2950, x: 70, r: 24 }, { d: 2950, x: 290, r: 24 },
        { d: 3900, x: 240, r: 22 },
        { d: 4700, x: 120, r: 22 }, { d: 4960, x: 230, r: 22 }, { d: 5220, x: 125, r: 22 },
        { d: 5480, x: 225, r: 22 },
      ],
      logs: [
        { d: 2350, x1: 20, x2: 175 },
        { d: 2700, x1: 190, x2: 340 },
        { d: 4250, x1: 20, x2: 150 }, { d: 4250, x1: 250, x2: 340 },
      ],
      whirls: [{ d: 3500, x: 130, r: 70, dir: 1 }],
      pearls: [
        { d: 600, x: 95 }, { d: 1250, x: 140 }, { d: 2350, x: 290 }, { d: 2950, x: 180 },
        { d: 3500, x: 290 }, { d: 4250, x: 200 }, { d: 5220, x: 240 },
      ],
      checkpoints: [{ d: 2100, x: 180 }, { d: 4000, x: 180 }],
    },
    {
      id: 'S-2', name: { no: 'Villstryket', en: 'Wild rapids' },
      tip: { no: 'Sidestrømmer drar båten med seg, og noen stokker flytter på seg.', en: 'Side currents pull the boat along, and some logs move.' },
      startX: 180, dockX: 180, length: 8000,
      speed: [[0, 95], [2000, 105], [4100, 118], [6100, 130], [8000, 140]],
      banks: [[0, 26, 334], [1100, 26, 334], [1250, 70, 290], [1750, 70, 290], [1900, 26, 334],
        [4300, 26, 334], [4450, 95, 265], [5000, 95, 265], [5150, 26, 334],
        [6900, 26, 334], [7050, 75, 285], [7650, 75, 285], [7800, 26, 334]],
      rocks: [
        // oppvarming: steiner tettere enn i første stryk
        { d: 500, x: 110, r: 22 }, { d: 650, x: 260, r: 22 }, { d: 800, x: 150, r: 20 },
        { d: 1000, x: 250, r: 24 }, { d: 1000, x: 70, r: 18 },
        { d: 1400, x: 180, r: 24 },
        { d: 1650, x: 115, r: 18 }, { d: 1650, x: 245, r: 18 },
        // sidestrøm mot høyre med steiner
        { d: 3000, x: 230, r: 22 }, { d: 3200, x: 300, r: 20 },
        { d: 3750, x: 75, r: 22 }, { d: 3750, x: 285, r: 22 },
        // smal renne med stein som flytter seg
        { d: 4700, x: 180, r: 18, swing: [55, 520] },
        { d: 4950, x: 180, r: 16, swing: [55, 520, Math.PI] },
        // sidestrøm mot venstre
        { d: 5450, x: 120, r: 22 }, { d: 5650, x: 250, r: 22 }, { d: 5850, x: 90, r: 20 },
        // finalen: smal slalåm
        { d: 7150, x: 135, r: 20 }, { d: 7330, x: 225, r: 20 }, { d: 7510, x: 135, r: 20 },
      ],
      logs: [
        { d: 2250, x1: 20, x2: 170, swing: [60, 600] },
        { d: 2550, x1: 190, x2: 340, swing: [60, 600, Math.PI] },
        { d: 3500, x1: 120, x2: 240, swing: [90, 700] },
        { d1: 6450, x1: 20, d2: 6350, x2: 170 },
        { d1: 6720, x1: 340, d2: 6640, x2: 225 },
        { d: 6900, x1: 120, x2: 240, swing: [70, 560] },
      ],
      whirls: [{ d: 3350, x: 110, r: 60, dir: 1 }, { d: 5250, x: 250, r: 62, dir: -1 }],
      drifts: [
        { d: 2850, len: 450, x1: 0, x2: 360, vx: 70 },
        { d: 5400, len: 550, x1: 0, x2: 360, vx: -75 },
      ],
      pearls: [
        { d: 650, x: 185 }, { d: 1650, x: 180 }, { d: 2400, x: 180 }, { d: 3350, x: 230 },
        { d: 4820, x: 180 }, { d: 5650, x: 150 }, { d: 6550, x: 200 }, { d: 7420, x: 180 },
      ],
      checkpoints: [{ d: 2000, x: 180 }, { d: 4100, x: 180 }, { d: 6150, x: 180 }],
    },
  ];

  root.Stryket = {
    K, LEVELS, create, step, tap, clone, sy, boatD, logEnds, rockX, progress, starsFor,
    speedAt, bankL, bankR, falloff,
  };
})(typeof window !== 'undefined' ? window : globalThis);
