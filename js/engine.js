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

    HEAVY_MASS: 2,                // lasteskuter er tunge og flytter seg mindre

    RAIN_EVERY: 2.5,              // regn: sekunder mellom dråpene
    RAIN_DELAY: 1,                // regn: første dråpe så lenge etter et trykk
    RAIN_POWER: 0.45,             // regn: dråpen er svakere enn et trykk…
    RAIN_RANGE: 120,              // …og rekker kortere

    WALL_R: 7,                    // molo og sluseport: halv tykkelse
    SWITCH_R: 13,                 // bryter: båten må over denne

    FROG_R: 9,
    FROG_JUMP: 0.5,               // sekunder i lufta
    FROG_POWER: 0.9,              // frosken lander og lager en krusning
    FROG_RANGE: 260,
    FROG_WAKE: 0.45,              // krusningen må være så sterk for å vekke frosken

    ICE_DRAG: 0.4,                // is: nesten ingen vannmotstand…
    ICE_FRICTION: 10,             // …og lite brems

    SETTLE_V: 3,
    MAX_RIPPLES: 16,
  };

  const DRAG_MUL_BOAT = Math.exp(-C.DRAG * C.DT);
  const DRAG_MUL_PAD = Math.exp(-C.PAD_DRAG * C.DT);
  const GRIP_MUL = Math.exp(-C.CURRENT_GRIP * C.DT);
  const ICE_MUL = Math.exp(-C.ICE_DRAG * C.DT);

  /* ---------- oppretting ---------- */

  function createWorld(level) {
    const w = {
      level,
      t: 0, steps: 0, taps: 0,
      bodies: [], boats: [], pads: [],
      docks: [], rocks: [], logs: [], whirls: [], currents: [], falls: [], cascades: [],
      rains: [], walls: [], gates: [], switches: [], frogs: [], ice: [], winds: [],
      ripples: [], events: [], rippleSeq: 0, tapStep: 0,
      dark: !!level.dark,
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
        r: C.BOAT_R, mass: b.heavy ? C.HEAVY_MASS : 1, drag: DRAG_MUL_BOAT, heavy: !!b.heavy,
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

    // Regn: en dråpe faller på samme sted i fast takt. Takten starter på nytt
    // ved hvert trykk, så resultatet blir det samme uansett når du trykker.
    (level.rain || []).forEach((d) => w.rains.push({
      x: d.x, y: d.y,
      p: d.power || C.RAIN_POWER, range: d.range || C.RAIN_RANGE,
      ds: Math.max(1, Math.round((d.delay != null ? d.delay : C.RAIN_DELAY) / C.DT)),
      es: Math.max(1, Math.round((d.every || C.RAIN_EVERY) / C.DT)),
    }));
    // Molo: en mur som stopper båter og krusninger (skygge bak).
    (level.walls || []).forEach((l) => w.walls.push({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, r: C.WALL_R }));
    // Sluseport: som en molo, men åpnes for godt når en båt treffer bryteren.
    (level.gates || []).forEach((g) => w.gates.push({ x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, r: C.WALL_R, open: false, openT: -1 }));
    (level.switches || []).forEach((s) => w.switches.push({ x: s.x, y: s.y, r: C.SWITCH_R, gate: s.gate || 0, on: false }));
    // Frosker: hopper til neste blad når en krusning treffer, og lager en ny der de lander.
    (level.frogs || []).forEach((f, i) => w.frogs.push({
      id: i, hops: f.hops, at: 0, x: f.hops[0][0], y: f.hops[0][1], jt: -1, chain: [],
    }));
    // Is: båtene glir nesten uten å stoppe.
    (level.ice || []).forEach((r) => w.ice.push({ x: r.x, y: r.y, w: r.w, h: r.h }));
    // Vind: blåser jevnt i et felt og tar tak i seilene (bare båter).
    (level.winds || []).forEach((r) => w.winds.push({ x: r.x, y: r.y, w: r.w, h: r.h, ax: r.ax || 0, ay: r.ay || 0 }));
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

  function falloff(d, range) {
    const R = range || C.RIPPLE_RANGE;
    if (d >= R) return 0;
    return Math.pow(1 - d / R, C.FALLOFF_POW);
  }

  // Krysser linja (ax,ay)–(bx,by) linja (cx,cy)–(dx,dy)?
  function cross(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }
  // Står en molo eller lukket sluseport i veien mellom to punkter?
  function blocked(w, x1, y1, x2, y2) {
    for (const s of w.walls) if (cross(x1, y1, x2, y2, s.x1, s.y1, s.x2, s.y2)) return true;
    for (const g of w.gates) if (!g.open && cross(x1, y1, x2, y2, g.x1, g.y1, g.x2, g.y2)) return true;
    return false;
  }
  function segDist(px, py, s) {
    const abx = s.x2 - s.x1, aby = s.y2 - s.y1;
    const len2 = abx * abx + aby * aby || 1;
    let t = ((px - s.x1) * abx + (py - s.y1) * aby) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (s.x1 + abx * t), py - (s.y1 + aby * t));
  }
  function onWall(w, x, y, m) {
    for (const s of w.walls) if (segDist(x, y, s) < s.r + m) return true;
    for (const g of w.gates) if (!g.open && segDist(x, y, g) < g.r + m) return true;
    return false;
  }

  function addRipple(w, x, y, p, range, amb, chain, kind) {
    if (w.ripples.length >= C.MAX_RIPPLES) w.ripples.shift();
    const rp = { id: ++w.rippleSeq, x, y, r: 0, hit: [], lv: levelAt(w, x, y), p, range, amb, chain, fhit: [], kind };
    w.ripples.push(rp);
    return rp;
  }

  function insidePond(x, y, margin) {
    const m = margin || 0, R = C.CORNER;
    if (x < m || y < m || x > C.W - m || y > C.H - m) return false;
    const cx = x < R ? R : x > C.W - R ? C.W - R : x;
    const cy = y < R ? R : y > C.H - R ? C.H - R : y;
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= (R - m) * (R - m);
  }

  // Kan man trykke her? (i dammen, og ikke oppå en molo eller lukket port)
  function canTap(w, x, y) { return insidePond(x, y, 2) && !onWall(w, x, y, 2); }

  function tap(w, x, y) {
    if (!canTap(w, x, y)) return false;
    addRipple(w, x, y, 1, C.RIPPLE_RANGE, false, [], 'tap');
    w.tapStep = w.steps;
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
      if (blocked(w, x, y, b.x, b.y)) continue; // molo i veien
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
  // Hvilke frosker vil hoppe av et trykk her (til siktehjelpen).
  function previewFrogs(w, x, y) {
    const lv = levelAt(w, x, y);
    return w.frogs.filter((f) => f.jt < 0 && levelAt(w, f.x, f.y) === lv && !blocked(w, x, y, f.x, f.y)
      && falloff(Math.hypot(f.x - x, f.y - y)) >= C.FROG_WAKE);
  }

  /* ---------- simulering ---------- */

  function step(w) {
    const dt = C.DT;
    w.t += dt; w.steps++;

    // 0) regndråper faller i fast takt etter siste trykk
    if (w.rains.length) {
      const rel = w.steps - w.tapStep;
      for (const d of w.rains) {
        if (rel < d.ds || (rel - d.ds) % d.es !== 0) continue;
        addRipple(w, d.x, d.y, d.p, d.range, true, [], 'rain');
        w.events.push({ type: 'drop', x: d.x, y: d.y });
      }
    }

    // frosker i lufta lander og lager en ny krusning
    for (const fr of w.frogs) {
      if (fr.jt < 0) continue;
      fr.jt += dt;
      if (fr.jt < C.FROG_JUMP) continue;
      fr.jt = -1;
      fr.at = (fr.at + 1) % fr.hops.length;
      fr.x = fr.hops[fr.at][0]; fr.y = fr.hops[fr.at][1];
      addRipple(w, fr.x, fr.y, C.FROG_POWER, C.FROG_RANGE, false, fr.chain.concat([fr.id]), 'frog');
      w.events.push({ type: 'land', id: fr.id, x: fr.x, y: fr.y });
    }

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
        if (w.walls.length + w.gates.length && blocked(w, rp.x, rp.y, b.x, b.y)) continue; // i skyggen av en molo
        const f = falloff(d, rp.range);
        if (f <= 0) continue;
        let nx = 0, ny = -1;
        if (d > 1e-6) { nx = dx / d; ny = dy / d; }
        const j = (C.PUSH * f * rp.p) / b.mass / C.PUSH_STEPS;
        b.pushes.push(nx * j, ny * j, C.PUSH_STEPS);
        w.events.push({ type: 'hit', id: b.id, f: f * rp.p, x: b.x, y: b.y });
      }
      for (const fr of w.frogs) {
        if (fr.jt >= 0 || rp.fhit.indexOf(fr.id) >= 0) continue;
        const d = Math.hypot(fr.x - rp.x, fr.y - rp.y);
        if (rp.r < d - C.FROG_R) continue;
        rp.fhit.push(fr.id);
        if (rp.chain.indexOf(fr.id) >= 0) continue; // frosken vekkes ikke av sin egen kjede
        if (levelAt(w, fr.x, fr.y) !== rp.lv || blocked(w, rp.x, rp.y, fr.x, fr.y)) continue;
        if (falloff(d, rp.range) * rp.p < C.FROG_WAKE) continue;
        fr.jt = 0; fr.chain = rp.chain;
        const to = fr.hops[(fr.at + 1) % fr.hops.length];
        w.events.push({ type: 'frog', id: fr.id, x: fr.x, y: fr.y, tx: to[0], ty: to[1] });
      }
      if (rp.r > rp.range + 24) w.ripples.splice(i, 1);
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

      // vind tar tak i seilet (tunge båter merker den mindre)
      if (b.kind === 'boat') {
        for (const v of w.winds) {
          if (b.x >= v.x && b.x <= v.x + v.w && b.y >= v.y && b.y <= v.y + v.h) { b.vx += v.ax * dt / b.mass; b.vy += v.ay * dt / b.mass; }
        }
      }
      let onIce = false;
      for (const r of w.ice) if (b.x >= r.x && b.x <= r.x + r.w && b.y >= r.y && b.y <= r.y + r.h) { onIce = true; break; }

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
      const dm = onIce ? ICE_MUL : inCurrent ? b.drag * GRIP_MUL : b.drag;
      let rvx = (b.vx - fx) * dm, rvy = (b.vy - fy) * dm;
      const sp = Math.sqrt(rvx * rvx + rvy * rvy);
      if (sp > 0) {
        const ns = sp - (onIce ? C.ICE_FRICTION : C.FRICTION) * dt;
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
        for (const s of w.walls) collideSeg(w, b, s, report, 'rock');
        for (const g of w.gates) if (!g.open) collideSeg(w, b, g, report, 'log');
        collideBounds(w, b, report);
        collideFalls(w, b, report);
      }
    }

    // brytere: en båt (eller vannlilje) over bryteren åpner sluseporten
    for (const s of w.switches) {
      if (s.on) continue;
      for (const b of w.bodies) {
        if (b.dock >= 0 || b.sink > 0) continue;
        const dx = b.x - s.x, dy = b.y - s.y, rr = s.r + b.r * 0.5;
        if (dx * dx + dy * dy > rr * rr) continue;
        s.on = true;
        const g = w.gates[s.gate];
        const was = g && g.open;
        if (g) { g.open = true; if (g.openT < 0) g.openT = w.t; }
        w.events.push({ type: 'switch', x: s.x, y: s.y, gate: s.gate, opened: g && !was });
        break;
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

  function collideSeg(w, b, s, report, what) {
    const abx = s.x2 - s.x1, aby = s.y2 - s.y1;
    const len2 = abx * abx + aby * aby || 1;
    let t = ((b.x - s.x1) * abx + (b.y - s.y1) * aby) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    collideStatic(w, b, s.x1 + abx * t, s.y1 + aby * t, s.r, C.REST_STATIC, report, what);
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

  // Alt i ro? Regndråper teller ikke (de faller hele tiden).
  function isSettled(w) {
    for (const rp of w.ripples) if (!rp.amb) return false;
    for (const fr of w.frogs) if (fr.jt >= 0) return false;
    for (const b of w.bodies) {
      if (b.sink > 0) return false;
      if (b.dock >= 0) continue;
      if (b.pushes.length) return false;
      if (b.vx * b.vx + b.vy * b.vy > C.SETTLE_V * C.SETTLE_V) return false;
    }
    return true;
  }

  // Som isSettled, men godtar krusninger som allerede har passert alt
  // (brukes av hint-knappen for å stoppe tidlig).
  function isCalm(w) {
    for (const fr of w.frogs) if (fr.jt >= 0) return false;
    for (const rp of w.ripples) {
      if (rp.amb || rp.r >= rp.range) continue;
      for (const fr of w.frogs) if (rp.fhit.indexOf(fr.id) < 0) return false;
    }
    for (const b of w.bodies) {
      if (b.dock >= 0) continue;
      if (b.sink > 0 || b.pushes.length) return false;
      if (b.vx * b.vx + b.vy * b.vy > C.SETTLE_V * C.SETTLE_V) return false;
      for (const rp of w.ripples) if (rp.r < rp.range && rp.hit.indexOf(b.id) < 0) return false;
    }
    return true;
  }

  // Omtrentlig veilengde mellom to punkter når moloer og lukkede porter står
  // i veien: går rundt endene av muren (brukes av løseren og hint-knappen).
  function pathDist(w, x1, y1, x2, y2) {
    const direct = Math.hypot(x2 - x1, y2 - y1);
    if (!w.walls.length && !w.gates.length) return direct;
    if (!blocked(w, x1, y1, x2, y2)) return direct;
    const pts = [];
    for (const s of w.walls.concat(w.gates.filter((g) => !g.open))) {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L = Math.hypot(dx, dy) || 1, m = s.r + 16;
      pts.push([s.x1 - (dx / L) * m, s.y1 - (dy / L) * m], [s.x2 + (dx / L) * m, s.y2 + (dy / L) * m]);
    }
    let best = direct + 400;
    for (const a of pts) {
      if (blocked(w, x1, y1, a[0], a[1])) continue;
      const da = Math.hypot(a[0] - x1, a[1] - y1);
      if (!blocked(w, a[0], a[1], x2, y2)) { best = Math.min(best, da + Math.hypot(x2 - a[0], y2 - a[1])); continue; }
      for (const b of pts) {
        if (b === a || blocked(w, a[0], a[1], b[0], b[1]) || blocked(w, b[0], b[1], x2, y2)) continue;
        best = Math.min(best, da + Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(x2 - b[0], y2 - b[1]));
      }
    }
    return best;
  }

  // Når faller neste dråpe? (antall steg, til tegningen)
  function nextDrop(w, d) {
    const rel = w.steps - w.tapStep;
    if (rel < d.ds) return d.ds - rel;
    return d.es - ((rel - d.ds) % d.es);
  }

  // Lett kopi av en verden i ro (brukes av løseren).
  function clone(w) {
    const c = Object.assign({}, w);
    c.bodies = w.bodies.map((b) => Object.assign({}, b, { pushes: b.pushes.slice(), down: b.down.slice() }));
    c.boats = c.bodies.filter((b) => b.kind === 'boat');
    c.pads = c.bodies.filter((b) => b.kind === 'pad');
    c.docks = w.docks.map((d) => Object.assign({}, d));
    c.ripples = w.ripples.map((r) => Object.assign({}, r, { hit: r.hit.slice(), fhit: r.fhit.slice() }));
    c.gates = w.gates.map((g) => Object.assign({}, g));
    c.switches = w.switches.map((s) => Object.assign({}, s));
    c.frogs = w.frogs.map((f) => Object.assign({}, f));
    c.events = [];
    return c;
  }

  const Engine = {
    C, createWorld, step, tap, canTap, preview, previewFrogs, falloff, insidePond, isSettled, isCalm, clone,
    levelAt, fallSide, blocked, nextDrop, pathDist,
  };
  root.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
