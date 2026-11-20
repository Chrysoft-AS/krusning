/* =====================================================================
 * Krusning – fysikkmotor
 * ---------------------------------------------------------------------
 * Ren simulering: ingen tegning, ingen lyd, ingen tilfeldighet.
 * Samme trykk gir alltid samme resultat (deterministisk), slik at
 * spillet er rettferdig og at verktøyet tools/solve.js kan teste
 * og løse banene automatisk.
 *
 * Koordinater: dammen er alltid C.W × C.H enheter (360 × 600),
 * origo øverst til venstre. Skjermen skaleres for å passe.
 * ===================================================================== */
(function (root) {
  'use strict';

  // Alle "følelses-tall" samlet på ett sted. Endre forsiktig: banene
  // er testet med disse verdiene (kjør `node tools/solve.js` etterpå).
  const C = {
    W: 360, H: 600, CORNER: 34,   // dammens størrelse og hjørneradius
    DT: 1 / 120,                  // fast tidssteg (sekunder)

    RIPPLE_SPEED: 250,            // hvor fort krusningen sprer seg
    RIPPLE_RANGE: 300,            // hvor langt den rekker
    FALLOFF_POW: 1.25,            // hvor raskt kraften avtar med avstand
    PUSH: 580,                    // maks fartsøkning fra én krusning
    PUSH_STEPS: 8,                // dyttet fordeles over N steg (mykere)

    DRAG: 1.3,                    // vannmotstand (eksponentiell)
    FRICTION: 15,                 // ekstra brems så ting faktisk stopper

    BOAT_R: 13,
    DOCK_R: 24,                   // tegnet størrelse på havna
    CAPTURE_R: 19,                // båtens sentrum må innenfor dette
    ATTRACT_R: 44,                // havna "trekker" i båter innenfor dette
    ATTRACT: 700,

    REST_WALL: 0.55,              // sprett mot bredden
    REST_STATIC: 0.6,             // sprett mot stein og stokker
    REST_BODY: 0.85,              // sprett båt mot båt

    PAD_MASS: 3,                  // vannliljer er tunge…
    PAD_DRAG: 2.4,                // …og bremser fort

    CURRENT_GRIP: 1.6,            // hvor fort båter tar opp farten til strømmen

    WHIRL_PULL: 330,              // strømvirvel: sug inn mot midten
    WHIRL_SWIRL: 170,             // strømvirvel: sirkelbevegelse
    SINK_R: 9,
    SINK_TIME: 1.1,

    FALL_KICK: 70,                // fart nedover når en båt går utfor en foss
    FALL_LIP: 2,                  // båter under fossen kommer ikke opp igjen
    CASCADE_PUSH: 520,            // foss ovenfra: vannet dytter båter bort
    CASCADE_CORE: 15,             // treffer båten midten, krasjer den

    SETTLE_V: 3,
    MAX_RIPPLES: 16,
  };

  const DRAG_MUL_BOAT = Math.exp(-C.DRAG * C.DT);
  const DRAG_MUL_PAD = Math.exp(-C.PAD_DRAG * C.DT);
  const GRIP_MUL = Math.exp(-C.CURRENT_GRIP * C.DT);

  /* ---------- oppretting ---------- */

  function createWorld(level) {
    const w = {
      level,
      t: 0, steps: 0, taps: 0,
      bodies: [], boats: [], pads: [],
      docks: [], rocks: [], logs: [], whirls: [], currents: [], falls: [], cascades: [],
      ripples: [], events: [], rippleSeq: 0,
      done: false, doneAt: -1,
    };

    // Fosser nedover: en linje tvers over dammen. Siden til høyre når du går
    // fra (x1,y1) til (x2,y2) ligger lavere. Båter kan falle ned, men ikke opp.
    (level.falls || []).forEach((f) => {
      const dx = f.x2 - f.x1, dy = f.y2 - f.y1, L = Math.hypot(dx, dy) || 1;
      w.falls.push({ x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2, nx: -dy / L, ny: dx / L });
    });
    // Fosser ovenfra: vann som faller ned i dammen og dytter alt bort.
    (level.cascades || []).forEach((c) => w.cascades.push({ x: c.x, y: c.y, r: c.r || 48 }));

    (level.boats || []).forEach((b, i) => {
      const body = {
        kind: 'boat', id: w.bodies.length, idx: i,
        x: b.x, y: b.y, vx: 0, vy: 0,
        r: C.BOAT_R, mass: 1, drag: DRAG_MUL_BOAT,
        color: b.color != null ? b.color : i,
        angle: b.angle != null ? b.angle : -Math.PI / 2,
        dock: -1, dockT: 0, sink: 0, sinkX: 0, sinkY: 0,
        sx: b.x, sy: b.y, pushes: [],
      };
      setLevel(w, body);
      w.bodies.push(body); w.boats.push(body);
    });

    (level.pads || []).forEach((p) => {
      const r = p.r || 20;
      const body = {
        kind: 'pad', id: w.bodies.length,
        x: p.x, y: p.y, vx: 0, vy: 0,
        r, mass: C.PAD_MASS * (r / 20) * (r / 20), drag: DRAG_MUL_PAD,
        angle: p.angle || 0, flower: !!p.flower,
        dock: -1, sink: 0, pushes: [],
      };
      setLevel(w, body);
      w.bodies.push(body); w.pads.push(body);
    });

    (level.docks || []).forEach((d) => w.docks.push({
      x: d.x, y: d.y, r: C.DOCK_R,
      color: d.color != null ? d.color : -1,
      boat: -1, angle: d.angle != null ? d.angle : -Math.PI / 2,
    }));
    (level.rocks || []).forEach((r, i) => w.rocks.push({ x: r.x, y: r.y, r: r.r || 20, seed: i * 7 + 3 }));
    (level.logs || []).forEach((l) => w.logs.push({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, r: l.r || 8 }));
    (level.whirls || []).forEach((v) => w.whirls.push({ x: v.x, y: v.y, r: v.r || 60, power: v.power || 1, dir: v.dir || 1 }));
    (level.currents || []).forEach((c) => w.currents.push({ x: c.x, y: c.y, w: c.w, h: c.h, vx: c.vx || 0, vy: c.vy || 0 }));
    return w;
  }

  /* ---------- vannhøyder (fosser nedover) ---------- */

  // Hvor langt (med fortegn) et punkt er fra fosselinja. Positivt = nedenfor.
  function fallSide(f, x, y) { return (x - f.x1) * f.nx + (y - f.y1) * f.ny; }
  // Vannhøyde: hvor mange fosser punktet ligger nedenfor (0 = øverst).
  function levelAt(w, x, y) {
    let n = 0;
    for (const f of w.falls) if (fallSide(f, x, y) > 0) n++;
    return n;
  }
  function setLevel(w, b) {
    b.down = w.falls.map((f) => fallSide(f, b.x, b.y) > 0);
    b.lv = b.down.filter(Boolean).length;
    b.sdown = b.down.slice();
  }

  /* ---------- krusninger ---------- */

  function falloff(d) {
    if (d >= C.RIPPLE_RANGE) return 0;
    return Math.pow(1 - d / C.RIPPLE_RANGE, C.FALLOFF_POW);
  }

  function insidePond(x, y, margin) {
    const m = margin || 0, R = C.CORNER;
    if (x < m || y < m || x > C.W - m || y > C.H - m) return false;
    const cx = x < R ? R : x > C.W - R ? C.W - R : x;
    const cy = y < R ? R : y > C.H - R ? C.H - R : y;
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= (R - m) * (R - m);
  }

  function tap(w, x, y) {
    if (!insidePond(x, y, 2)) return false;
    if (w.ripples.length >= C.MAX_RIPPLES) w.ripples.shift();
    w.ripples.push({ id: ++w.rippleSeq, x, y, r: 0, hit: [], lv: levelAt(w, x, y) });
    w.taps++;
    w.events.push({ type: 'tap', x, y });
    return true;
  }

  // Brukes til siktehjelpen: hvilke ting vil bli dyttet, hvor og hvor mye.
  function preview(w, x, y) {
    const out = [];
    const lv = levelAt(w, x, y);
    for (const b of w.bodies) {
      if (b.dock >= 0 || b.sink > 0) continue;
      if (b.lv !== lv) continue; // krusningen når ikke over/under en foss
      const dx = b.x - x, dy = b.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const f = falloff(d);
      if (f <= 0.02) continue;
      out.push({
        body: b,
        nx: d > 1e-6 ? dx / d : 0,
        ny: d > 1e-6 ? dy / d : -1,
        f, v: (C.PUSH * f) / b.mass,
      });
    }
    return out;
  }

  /* ---------- simulering ---------- */

  function step(w) {
    const dt = C.DT;
    w.t += dt; w.steps++;

    // 1) krusningene vokser og treffer ting
    for (let i = w.ripples.length - 1; i >= 0; i--) {
      const rp = w.ripples[i];
      rp.r += C.RIPPLE_SPEED * dt;
      for (const b of w.bodies) {
        if (b.dock >= 0 || b.sink > 0) continue;
        if (rp.hit.indexOf(b.id) >= 0) continue;
        const dx = b.x - rp.x, dy = b.y - rp.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (rp.r < d - b.r) continue;
        rp.hit.push(b.id);
        if (b.lv !== rp.lv) continue; // annen vannhøyde: krusningen når ikke fram
        const f = falloff(d);
        if (f <= 0) continue;
        let nx = 0, ny = -1;
        if (d > 1e-6) { nx = dx / d; ny = dy / d; }
        const j = (C.PUSH * f) / b.mass / C.PUSH_STEPS;
        b.pushes.push(nx * j, ny * j, C.PUSH_STEPS);
        w.events.push({ type: 'hit', id: b.id, f, x: b.x, y: b.y });
      }
      if (rp.r > C.RIPPLE_RANGE + 24) w.ripples.splice(i, 1);
    }

    // 2) krefter og bevegelse
    for (const b of w.bodies) {
      if (b.dock >= 0) { dockedUpdate(w, b); continue; }
      if (b.sink > 0) { sinkUpdate(w, b, dt); continue; }

      if (b.pushes.length) {
        let out = 0;
        for (let k = 0; k < b.pushes.length; k += 3) {
          b.vx += b.pushes[k]; b.vy += b.pushes[k + 1];
          const left = b.pushes[k + 2] - 1;
          if (left > 0) {
            b.pushes[out] = b.pushes[k]; b.pushes[out + 1] = b.pushes[k + 1];
            b.pushes[out + 2] = left; out += 3;
          }
        }
        b.pushes.length = out;
      }

      // strøm i vannet (bekker)
      let fx = 0, fy = 0, inCurrent = false;
      for (const c of w.currents) {
        if (b.x >= c.x && b.x <= c.x + c.w && b.y >= c.y && b.y <= c.y + c.h) { fx += c.vx; fy += c.vy; inCurrent = true; }
      }

      // strømvirvler
      for (const v of w.whirls) {
        const dx = v.x - b.x, dy = v.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < v.r && d > 1e-6) {
          const s = 1 - d / v.r;
          const pull = C.WHIRL_PULL * v.power * s;
          const swirl = C.WHIRL_SWIRL * v.power * s * v.dir;
          const ux = dx / d, uy = dy / d;
          b.vx += (ux * pull - uy * swirl) * dt;
          b.vy += (uy * pull + ux * swirl) * dt;
          if (b.kind === 'boat' && d < C.SINK_R) { startSink(w, b, v); break; }
        }
      }
      if (b.sink > 0) continue;

      // fosser ovenfra: dytter bort, og midt i krasjer båten
      for (const c of w.cascades) {
        const dx = b.x - c.x, dy = b.y - c.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= c.r || d < 1e-6) continue;
        if (b.kind === 'boat' && d < C.CASCADE_CORE) { startSink(w, b, c, 'crash'); break; }
        const s = 1 - d / c.r;
        b.vx += (dx / d) * C.CASCADE_PUSH * s * dt / b.mass;
        b.vy += (dy / d) * C.CASCADE_PUSH * s * dt / b.mass;
      }
      if (b.sink > 0) continue;

      // havna trekker forsiktig i båter som kommer nær
      if (b.kind === 'boat') {
        for (const dk of w.docks) {
          if (dk.boat >= 0 || (dk.color >= 0 && dk.color !== b.color)) continue;
          const dx = dk.x - b.x, dy = dk.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < C.ATTRACT_R && d > 1e-6) {
            const s = 1 - d / C.ATTRACT_R;
            b.vx += (dx / d) * C.ATTRACT * s * dt;
            b.vy += (dy / d) * C.ATTRACT * s * dt;
            const damp = 1 - 3 * s * dt;
            b.vx *= damp; b.vy *= damp;
          }
        }
      }

      // vannmotstand (relativt til strømmen; i strøm griper vannet hardere)
      const dm = inCurrent ? b.drag * GRIP_MUL : b.drag;
      let rvx = (b.vx - fx) * dm, rvy = (b.vy - fy) * dm;
      const sp = Math.sqrt(rvx * rvx + rvy * rvy);
      if (sp > 0) {
        const ns = sp - C.FRICTION * dt;
        const k = ns > 0 ? ns / sp : 0;
        rvx *= k; rvy *= k;
      }
      b.vx = fx + rvx; b.vy = fy + rvy;
      b.x += b.vx * dt; b.y += b.vy * dt;
    }

    // 3) kollisjoner
    const n = w.bodies.length;
    for (let iter = 0; iter < 2; iter++) {
      const report = iter === 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) collideBodies(w, w.bodies[i], w.bodies[j], report);
      }
      for (const b of w.bodies) {
        if (b.sink > 0 || b.dock >= 0) continue;
        for (const r of w.rocks) collideStatic(w, b, r.x, r.y, r.r, C.REST_STATIC, report, 'rock');
        for (const l of w.logs) {
          const abx = l.x2 - l.x1, aby = l.y2 - l.y1;
          const len2 = abx * abx + aby * aby || 1;
          let t = ((b.x - l.x1) * abx + (b.y - l.y1) * aby) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          collideStatic(w, b, l.x1 + abx * t, l.y1 + aby * t, l.r, C.REST_STATIC, report, 'log');
        }
        collideBounds(w, b, report);
        collideFalls(w, b, report);
      }
    }

    // 4) inn i havn?
    for (const b of w.boats) {
      if (b.dock >= 0 || b.sink > 0) continue;
      for (let di = 0; di < w.docks.length; di++) {
        const dk = w.docks[di];
        if (dk.boat >= 0 || (dk.color >= 0 && dk.color !== b.color)) continue;
        const dx = dk.x - b.x, dy = dk.y - b.y;
        if (dx * dx + dy * dy < C.CAPTURE_R * C.CAPTURE_R) {
          b.dock = di; dk.boat = b.id;
          b.vx = 0; b.vy = 0; b.pushes.length = 0; b.dockT = 0;
          const count = w.boats.filter((o) => o.dock >= 0).length;
          w.events.push({ type: 'dock', id: b.id, dock: di, x: dk.x, y: dk.y, n: count, of: w.boats.length });
          break;
        }
      }
    }

    if (!w.done && w.boats.length && w.boats.every((b) => b.dock >= 0)) {
      w.done = true; w.doneAt = w.t;
      w.events.push({ type: 'complete', taps: w.taps });
    }
  }

  function dockedUpdate(w, b) {
    const dk = w.docks[b.dock];
    b.x += (dk.x - b.x) * 0.14;
    b.y += (dk.y - b.y) * 0.14;
    b.dockT += C.DT;
  }

  function startSink(w, b, v, type) {
    b.sink = 1e-6; b.sinkX = v.x; b.sinkY = v.y;
    b.vx = 0; b.vy = 0; b.pushes.length = 0;
    w.events.push({ type: type || 'sink', id: b.id, x: v.x, y: v.y });
  }

  // Fosser nedover: ovenfra går båten utfor (og får litt fart), nedenfra er
  // fossen en vegg.
  function collideFalls(w, b, report) {
    for (let i = 0; i < w.falls.length; i++) {
      const f = w.falls[i];
      const s = fallSide(f, b.x, b.y);
      if (!b.down[i]) {
        if (s > 0) {
          b.down[i] = true; b.lv++;
          b.vx += f.nx * C.FALL_KICK; b.vy += f.ny * C.FALL_KICK;
          w.events.push({ type: 'fall', id: b.id, kind: b.kind, x: b.x, y: b.y, nx: f.nx, ny: f.ny });
        }
        continue;
      }
      if (s < C.FALL_LIP) {
        b.x += f.nx * (C.FALL_LIP - s); b.y += f.ny * (C.FALL_LIP - s);
        const vn = b.vx * f.nx + b.vy * f.ny;
        if (vn < 0) {
          b.vx -= (1 + C.REST_STATIC) * vn * f.nx; b.vy -= (1 + C.REST_STATIC) * vn * f.ny;
          bump(w, report, b.x - f.nx * b.r, b.y - f.ny * b.r, -vn, 'rock');
        }
      }
    }
  }

  function sinkUpdate(w, b, dt) {
    b.sink += dt;
    b.x += (b.sinkX - b.x) * 0.12;
    b.y += (b.sinkY - b.y) * 0.12;
    if (b.sink >= C.SINK_TIME) {
      b.sink = 0; b.x = b.sx; b.y = b.sy; b.vx = 0; b.vy = 0;
      b.down = b.sdown.slice(); b.lv = b.down.filter(Boolean).length;
      w.events.push({ type: 'respawn', id: b.id, x: b.x, y: b.y });
    }
  }

  function bump(w, report, x, y, v, what) {
    if (report && v > 30) w.events.push({ type: 'bump', x, y, v, what });
  }

  function collideStatic(w, b, x, y, r, e, report, what) {
    const dx = b.x - x, dy = b.y - y;
    const rr = b.r + r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2) || 1e-6;
    const nx = dx / d, ny = dy / d;
    b.x = x + nx * rr; b.y = y + ny * rr;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
      bump(w, report, x + nx * r, y + ny * r, -vn, what);
    }
  }

  function collideBounds(w, b, report) {
    const r = b.r, R = C.CORNER, W = C.W, H = C.H, e = C.REST_WALL;
    let cx = -1, cy = -1;
    if (b.x < R) cx = R; else if (b.x > W - R) cx = W - R;
    if (b.y < R) cy = R; else if (b.y > H - R) cy = H - R;
    if (cx >= 0 && cy >= 0) {
      const dx = b.x - cx, dy = b.y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const lim = R - r;
      if (d > lim) {
        const nx = dx / d, ny = dy / d;
        b.x = cx + nx * lim; b.y = cy + ny * lim;
        const vo = b.vx * nx + b.vy * ny;
        if (vo > 0) {
          b.vx -= (1 + e) * vo * nx; b.vy -= (1 + e) * vo * ny;
          bump(w, report, cx + nx * R, cy + ny * R, vo, 'shore');
        }
      }
      return;
    }
    if (b.x < r) { b.x = r; if (b.vx < 0) { bump(w, report, 0, b.y, -b.vx, 'shore'); b.vx = -b.vx * e; } }
    else if (b.x > W - r) { b.x = W - r; if (b.vx > 0) { bump(w, report, W, b.y, b.vx, 'shore'); b.vx = -b.vx * e; } }
    if (b.y < r) { b.y = r; if (b.vy < 0) { bump(w, report, b.x, 0, -b.vy, 'shore'); b.vy = -b.vy * e; } }
    else if (b.y > H - r) { b.y = H - r; if (b.vy > 0) { bump(w, report, b.x, H, b.vy, 'shore'); b.vy = -b.vy * e; } }
  }

  function collideBodies(w, a, b, report) {
    if (a.sink > 0 || b.sink > 0) return;
    const aS = a.dock >= 0, bS = b.dock >= 0;
    if (aS && bS) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const rr = a.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2) || 1e-6;
    const nx = dx / d, ny = dy / d;
    const ia = aS ? 0 : 1 / a.mass, ib = bS ? 0 : 1 / b.mass, it = ia + ib;
    const pen = rr - d;
    a.x -= (nx * pen * ia) / it; a.y -= (ny * pen * ia) / it;
    b.x += (nx * pen * ib) / it; b.y += (ny * pen * ib) / it;
    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vn < 0) {
      const jj = (-(1 + C.REST_BODY) * vn) / it;
      a.vx -= jj * nx * ia; a.vy -= jj * ny * ia;
      b.vx += jj * nx * ib; b.vy += jj * ny * ib;
      bump(w, report, a.x + nx * a.r, a.y + ny * a.r, -vn, a.kind === 'pad' || b.kind === 'pad' ? 'pad' : 'boat');
    }
  }

  /* ---------- tilstand ---------- */

  function isSettled(w) {
    if (w.ripples.length) return false;
    for (const b of w.bodies) {
      if (b.sink > 0) return false;
      if (b.dock >= 0) continue;
      if (b.pushes.length) return false;
      if (b.vx * b.vx + b.vy * b.vy > C.SETTLE_V * C.SETTLE_V) return false;
    }
    return true;
  }

  // Lett kopi av en verden i ro (brukes av løseren).
  function clone(w) {
    const c = Object.assign({}, w);
    c.bodies = w.bodies.map((b) => Object.assign({}, b, { pushes: b.pushes.slice(), down: b.down.slice() }));
    c.boats = c.bodies.filter((b) => b.kind === 'boat');
    c.pads = c.bodies.filter((b) => b.kind === 'pad');
    c.docks = w.docks.map((d) => Object.assign({}, d));
    c.ripples = w.ripples.map((r) => Object.assign({}, r, { hit: r.hit.slice() }));
    c.events = [];
    return c;
  }

  const Engine = { C, createWorld, step, tap, preview, falloff, insidePond, isSettled, clone, levelAt, fallSide };
  root.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
