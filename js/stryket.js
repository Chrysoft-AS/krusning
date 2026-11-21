/* =====================================================================
 * Krusning – Stryket (elvestryk)
 * ---------------------------------------------------------------------
 * En egen spillmodus: elva renner av seg selv, og du styrer båten til
 * sidene med krusninger. Trykk til venstre for båten, så glir den mot
 * høyre. Unngå steiner, tømmerstokker og virvler.
 *
 * Elva går fortere og fortere, og hvert stryk er langt. Båten tåler tre
 * krasj (tre liv). Etter et krasj starter du litt bak der det skjedde.
 * De fleste kommer ikke helt til havna: målet er å komme så langt som
 * mulig. En tredel gir én stjerne, to tredeler to, og havna tre.
 *
 * Banene lages av en banebygger (build) fra en kort oppskrift: frø,
 * lengde, fart og hvilke hindre som skal være med. Samme oppskrift gir
 * alltid samme elv. tools/stryk.js lar en robot spille hver bane og
 * bytter ut biter roboten ikke klarer (lagres i `fix`).
 *
 * Her ligger bare simuleringen og banene (ingen tegning, ingen DOM,
 * ingen Math.random). Samme trykk til samme tid gir alltid samme løp.
 *
 * Koordinater: skjermen er 360 × 600 som dammen. Båten ligger fast
 * rundt y = 450, og elva ruller forbi. Alt i elva har en avstand `d`
 * fra start (oppover), og en x fra venstre. 10 enheter = 1 meter.
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
    WHIRL_PULL: 520,             // virvel: sug inn mot midten…
    WHIRL_SWIRL: 200,            // …og rundt
    WHIRL_CORE: 0.3,             // innerste del av virvelen (andel av radius) drar båten ned
    PEARL_R: 20,                 // så nærme må båten for å ta perla
    TAP_GAP: 0.1,                // minste tid mellom to trykk
    MAX_RIPPLES: 6,
    SINK_TIME: 1.0,              // tid fra krasj til ny start
    LIVES: 3,                    // så mange krasj båten tåler
    GRACE: 1.4,                  // etter ny start: elva tar seg opp igjen så lenge
    DOCK_IN: 90,                 // målet regnes som nådd så langt før brygga
    PER_M: 10,                   // enheter per meter (til visning)
  };

  const TAU = Math.PI * 2;
  const SIDE_MUL = Math.exp(-K.SIDE_DRAG * K.DT);
  const Y_MUL = Math.exp(-K.Y_DRAG * K.DT);

  function falloff(d) {
    if (d >= K.RIPPLE_RANGE) return 0;
    return Math.pow(1 - d / K.RIPPLE_RANGE, K.FALLOFF_POW);
  }

  // Verdi langs elva: lista er [[d, a, b, …], …] sortert på d (binærsøk,
  // fordi lange elver har mange punkter).
  function along(list, d, col) {
    if (!list || !list.length) return null;
    if (d <= list[0][0]) return list[0][col];
    const n = list.length;
    if (d >= list[n - 1][0]) return list[n - 1][col];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (list[m][0] <= d) lo = m; else hi = m; }
    const a = list[lo], b = list[hi];
    const u = (d - a[0]) / (b[0] - a[0] || 1);
    return a[col] + (b[col] - a[col]) * u;
  }

  function speedAt(lv, d) { return along(lv.speed, d, 1) || 90; }
  function bankL(lv, d) { const v = along(lv.banks, d, 1); return v == null ? 26 : v; }
  function bankR(lv, d) { const v = along(lv.banks, d, 2); return v == null ? 334 : v; }

  // Første plass i en lista (sortert på d) med d >= verdien.
  function firstAt(list, d) {
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].d < d) lo = m + 1; else hi = m; }
    return lo;
  }

  /* ---------- oppretting ---------- */

  function create(lv) {
    return {
      lv, t: 0, steps: 0, dist: 0,
      x: lv.startX || 180, y: K.BOAT_Y, vx: 0, vy: 0,
      ripples: [], events: [], lastTap: -9,
      taps: 0, crashes: 0, lives: K.LIVES, mark: 0, far: 0,
      got: (lv.pearls || []).map(() => false), pearls: 0,
      sink: 0, sinkX: 0, sinkY: 0, why: '', grace: 0,
      done: false, doneT: 0, over: false,
    };
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
    if (st.done || st.over || st.sink > 0) return false;
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
    st.lives--;
    st.why = why;
    st.ripples.length = 0;
    st.events.push({ type: 'crash', x: st.x, y: st.y, why, lives: st.lives });
  }

  // Ny start på siste trygge sted bak krasjet (et rolig stykke mellom hindrene).
  function respawn(st) {
    const lv = st.lv, safe = lv.safe || [];
    const bd = boatD(st);
    let p = { d: 0, x: lv.startX || 180 };
    for (let i = firstAt(safe, bd) - 1; i >= 0; i--) { p = safe[i]; break; }
    st.dist = p.d;
    st.x = p.x; st.y = K.BOAT_Y; st.vx = 0; st.vy = 0;
    st.ripples.length = 0;
    st.sink = 0;
    st.grace = K.GRACE;
    st.events.push({ type: 'respawn', x: st.x, y: st.y });
  }

  function step(st) {
    const lv = st.lv, DT = K.DT;
    st.steps++; st.t += DT;
    if (st.over) return;

    if (st.sink > 0) {
      st.sink -= DT;
      if (st.sink <= 0) {
        if (st.lives <= 0) { st.over = true; st.sink = 0.001; st.events.push({ type: 'over' }); return; }
        respawn(st);
      }
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

    // etter ny start går elva sakte et lite øyeblikk
    let v = speedAt(lv, st.dist);
    if (st.grace > 0) { st.grace -= DT; v *= 1 - 0.75 * Math.max(0, st.grace) / K.GRACE; }
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
    // virvler (bare de som er i nærheten)
    const ws = lv.whirls || [];
    for (let i = firstAt(ws, bd - 120); i < ws.length && ws[i].d < bd + 120; i++) {
      const wv = ws[i];
      const cx = wv.x, cy = sy(st, wv.d);
      const dx = cx - st.x, dy = cy - st.y, d = Math.hypot(dx, dy);
      if (d > wv.r) continue;
      if (d < wv.r * K.WHIRL_CORE) { crash(st, 'whirl'); return; }
      const k = Math.pow(1 - d / wv.r, 0.6); // trekker godt også ytterst i virvelen
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

    // steiner og stokker: krasj (bare de som er i nærheten)
    const rs = lv.rocks || [];
    for (let i = firstAt(rs, bd2 - 60); i < rs.length && rs[i].d < bd2 + 60; i++) {
      const r = rs[i];
      if (Math.hypot(st.x - rockX(st, r), st.y - sy(st, r.d)) < r.r + R) { crash(st, 'rock'); return; }
    }
    const gs = lv.logs || [];
    for (let i = firstAt(gs, bd2 - 120); i < gs.length && gs[i].d < bd2 + 120; i++) {
      const e = logEnds(st, gs[i]);
      if (segDist(st.x, st.y, e.x1, e.y1, e.x2, e.y2) < K.LOG_R + R) { crash(st, 'log'); return; }
    }

    // perler
    const ps = lv.pearls || [];
    for (let i = firstAt(ps, bd2 - 40); i < ps.length && ps[i].d < bd2 + 40; i++) {
      if (st.got[i]) continue;
      const p = ps[i];
      if (Math.hypot(st.x - p.x, st.y - sy(st, p.d)) < K.PEARL_R) {
        st.got[i] = true; st.pearls++;
        st.events.push({ type: 'pearl', x: p.x, y: sy(st, p.d), i });
      }
    }

    // lengste strekning i dette løpet, og merkene for stjerner
    if (bd2 > st.far) st.far = Math.min(lv.length, bd2);
    const ms = lv.marks || [];
    while (st.mark < ms.length && bd2 >= ms[st.mark].d) {
      st.mark++;
      st.events.push({ type: 'mark', n: st.mark });
    }

    // havna (rett før brygga, så båten kan gli inn i åpningen)
    if (bd2 >= lv.length - K.DOCK_IN) {
      st.done = true; st.doneT = 0; st.far = lv.length;
      st.events.push({ type: 'complete' });
    }
  }

  function segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L2));
    return Math.hypot(px - x1 - dx * u, py - y1 - dy * u);
  }

  function progress(st) { return Math.max(0, Math.min(1, boatD(st) / st.lv.length)); }
  // Stjerner etter hvor langt du kom: en tredel, to tredeler, eller helt i havn.
  function starsFor(far, length) { return far >= length ? 3 : far >= length * 2 / 3 ? 2 : far >= length / 3 ? 1 : 0; }
  const meters = (d) => Math.round(d / K.PER_M);

  // Kopi av tilstanden (til testverktøyet, som prøver mange trykk).
  function clone(st) {
    const c = Object.assign({}, st);
    c.ripples = st.ripples.map((r) => Object.assign({}, r, { push: r.push && Object.assign({}, r.push) }));
    c.events = [];
    c.got = st.got.slice();
    return c;
  }

  /* =====================================================================
   * Banebyggeren: oppskrift → elv
   * ---------------------------------------------------------------------
   * Elva bygges bit for bit. Hver bit er ett hinder (en stein, en
   * steinvegg, en stokk-port, en virvel …). Mellom bitene er det et rolig
   * stykke der båten kan starte på nytt etter krasj. Etter hvert går elva
   * fortere, og bitene kommer tettere.
   * ===================================================================== */

  // Enkel tallgenerator med frø (samme frø gir alltid samme tall).
  function rng(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mix(a, b, c) {
    let h = 2166136261;
    for (const v of [a, b, c]) { h ^= v; h = Math.imul(h, 16777619); h ^= h >>> 13; }
    return h >>> 0;
  }
  const lerp = (a, b, u) => a + (b - a) * u;
  const smooth = (u) => u * u * (3 - 2 * u);

  function build(def) {
    const len = def.len;
    const r0 = rng(mix(def.seed, 7777, 0));
    const ph1 = r0() * TAU, ph2 = r0() * TAU;
    const bend = def.bend || [0, 2400];
    const P = (d) => Math.max(0, Math.min(1, d / len));
    const vAt = (d) => lerp(def.v[0], def.v[1], P(d));
    const narrows = [];
    const base = (d) => 180 + bend[0] * Math.min(1, d / 1800) *
      (0.7 * Math.sin(TAU * d / bend[1] + ph1) + 0.3 * Math.sin(TAU * d / (bend[1] * 0.43) + ph2));
    // hvor mye en trang renne gjelder akkurat her (0 = ikke, 1 = helt)
    const inNarrow = (n, d) => {
      if (d <= n.d0 - 160 || d >= n.d1 + 160) return 0;
      return 1 - smooth(d < n.d0 ? (n.d0 - d) / 160 : d > n.d1 ? (d - n.d1) / 160 : 0);
    };
    const center = (d) => { let c = base(d); for (const n of narrows) c += n.off * inNarrow(n, d); return c; };
    const width = (d) => {
      let w = lerp(def.w[0], def.w[1], P(d));
      for (const n of narrows) { const k = inNarrow(n, d); if (k > 0) w = Math.min(w, lerp(w, n.w, k)); }
      return w;
    };
    const bL = (d) => Math.max(14, center(d) - width(d) / 2);
    const bR = (d) => Math.min(346, center(d) + width(d) / 2);

    const lv = {
      id: def.id, name: def.name, tip: def.tip, startX: 180, dockX: 180, length: len,
      speed: [[0, def.v[0]], [len, def.v[1]]],
      rocks: [], logs: [], whirls: [], drifts: [], pearls: [], safe: [], parts: [], banks: [],
      marks: [{ d: len / 3 }, { d: len * 2 / 3 }],
    };
    let h = 0; // hvor vanskelig akkurat her (0 ved start, 1 ved havna)
    // Hvor forrige åpning var. Neste åpning legges et stykke unna, så
    // båten må flytte seg – mer og mer jo lenger ned i elva du kommer.
    let lane = 180;
    const pickLane = (R, lo, hi) => {
      const shift = lerp(0.12, 0.42, h) * (hi - lo + 60);
      const a = [lo, lane - shift], b = [lane + shift, hi];
      const okA = a[1] > a[0], okB = b[1] > b[0];
      let x;
      if (okA && okB) x = R() < 0.5 ? lerp(a[0], a[1], R()) : lerp(b[0], b[1], R());
      else if (okA) x = lerp(a[0], a[1], R());
      else if (okB) x = lerp(b[0], b[1], R());
      else x = lane < (lo + hi) / 2 ? hi : lo;
      lane = x;
      return x;
    };
    // vegg fra den ene bredden: velg siden som tvinger båten bort fra der den er
    const wallSide = (R, L, Rr) => {
      const c = (L + Rr) / 2, far = Math.abs(lane - c) > lerp(60, 15, h) ? 0 : 1;
      return far ? (R() < 0.5 ? -1 : 1) : (lane < c ? -1 : 1);
    };
    const rock = (d, x, r, swing) => lv.rocks.push(swing ? { d, x, r, swing } : { d, x, r });
    const log = (o) => lv.logs.push(o);

    // Hindrene. Hver får et startpunkt d, en tallgenerator R og "sp" (hvor
    // tett ting kommer etter hverandre), og gir tilbake der den slutter.
    const P_ = {
      // én stein (noen ganger to)
      rock(d, R) {
        const n = R() < 0.35 ? 2 : 1;
        let end = d;
        for (let k = 0; k < n; k++) {
          const r = 16 + 10 * R(), dd = d + r + k * 60;
          const L = bL(dd), Rr = bR(dd);
          rock(dd, lerp(L + r + 24, Rr - r - 24, R()), r);
          end = dd + r;
        }
        return end;
      },
      // to steiner med en åpning mellom
      pair(d, R) {
        const r = 18 + 6 * R(), g = lerp(100, 76, h) + 26 * R(); d += r;
        const L = bL(d), Rr = bR(d), gx = pickLane(R, L + g / 2 + 30, Rr - g / 2 - 30);
        rock(d, gx - g / 2 - r, r); rock(d, gx + g / 2 + r, r);
        return d + r;
      },
      // steinvegg fra den ene bredden, ut forbi midten
      wall(d, R, sp, side) {
        const r = 17 + 4 * R(); d += r;
        const L = bL(d), Rr = bR(d), W = Rr - L, reach = W * (lerp(0.42, 0.52, h) + 0.08 * R());
        const s = side || wallSide(R, L, Rr);
        lane = s < 0 ? (L + reach + Rr) / 2 + 10 : (L + Rr - reach) / 2 - 10;
        for (let k = 0; k * 30 < reach; k++) {
          const x = s < 0 ? L + 6 + k * 30 : Rr - 6 - k * 30;
          rock(d + (R() - 0.5) * 8, x, r + (R() - 0.5) * 4);
        }
        return d + r + 4;
      },
      // slalåm: steinvegger annenhver side
      slalom(d, R, sp) {
        const n = 2 + Math.floor(R() * (1 + 2 * h)), gap = sp * lerp(2.4, 1.6, h);
        let s = R() < 0.5 ? -1 : 1;
        for (let k = 0; k < n; k++) { d = P_.wall(d, R, sp, s) + gap; s = -s; }
        return d - gap;
      },
      // steinrøys: mange små steiner spredt utover
      field(d, R, sp) {
        const n = 4 + Math.floor(R() * 3 + 4 * h), span = sp * 2.2;
        const pts = [];
        for (let k = 0, tries = 0; k < n && tries < 80; tries++) {
          const dd = d + 14 + R() * span, r = 10 + 6 * R();
          const L = bL(dd), Rr = bR(dd), x = lerp(L + r + 8, Rr - r - 8, R());
          if (pts.some((p) => Math.hypot(p.x - x, p.d - dd) < p.r + r + 40)) continue;
          pts.push({ d: dd, x, r }); k++;
        }
        pts.sort((a, b) => a.d - b.d).forEach((p) => rock(p.d, p.x, p.r));
        return d + span + 30;
      },
      // tømmerstokker fra begge bredder, med en port
      gate(d, R) {
        d += 10;
        const L = bL(d), Rr = bR(d), g = lerp(126, 98, h) + 24 * R(), gx = pickLane(R, L + g / 2 + 20, Rr - g / 2 - 20);
        if (gx - g / 2 - L > 30) log({ d, x1: L - 12, x2: gx - g / 2 });
        if (Rr - gx - g / 2 > 30) log({ d, x1: gx + g / 2, x2: Rr + 12 });
        return d + 10;
      },
      // stokker annenhver side, som tvinger båten i sikksakk
      stagger(d, R, sp) {
        const n = 2 + Math.floor(R() * (1 + h)), gap = sp * lerp(2.9, 2.0, h);
        let s = wallSide(R, bL(d), bR(d));
        for (let k = 0; k < n; k++) {
          d += 10;
          const L = bL(d), Rr = bR(d), W = Rr - L, reach = W * (lerp(0.42, 0.5, h) + 0.06 * R());
          if (s < 0) log({ d, x1: L - 12, x2: L + reach }); else log({ d, x1: Rr - reach, x2: Rr + 12 });
          lane = s < 0 ? (L + reach + Rr) / 2 : (L + Rr - reach) / 2;
          d += 10 + gap; s = -s;
        }
        return d - gap;
      },
      // skrå stokk fra bredden
      diag(d, R) {
        const dh = 30 + 35 * R();
        const L = bL(d + dh), Rr = bR(d + dh), W = Rr - L, reach = W * (lerp(0.42, 0.5, h) + 0.08 * R());
        const s = wallSide(R, L, Rr);
        lane = s < 0 ? (L + reach + Rr) / 2 : (L + Rr - reach) / 2;
        if (s < 0) log({ d: d + dh / 2, d1: d + dh, x1: L - 10, d2: d + 10, x2: L + reach });
        else log({ d: d + dh / 2, d1: d + dh, x1: Rr + 10, d2: d + 10, x2: Rr - reach });
        return d + dh + 10;
      },
      // stokk som glir fram og tilbake midt i elva
      swinglog(d, R) {
        d += 10;
        const L = bL(d), Rr = bR(d), W = Rr - L, lg = 90 + 40 * R();
        const amp = Math.max(20, (W - lg) / 2 - 6);
        const c = (L + Rr) / 2;
        log({ d, x1: c - lg / 2, x2: c + lg / 2, swing: [amp, vAt(d) * (1.4 + 0.8 * R()), R() * TAU] });
        return d + 10;
      },
      // steiner som glir fram og tilbake
      swingrock(d, R, sp) {
        const n = 1 + Math.floor(R() * (1 + 2 * h));
        for (let k = 0; k < n; k++) {
          const r = 16 + 5 * R(); d += r;
          const L = bL(d), Rr = bR(d), W = Rr - L;
          const amp = Math.max(30, W / 2 - r - 10);
          rock(d, (L + Rr) / 2, r, [amp, vAt(d) * (1.3 + 0.8 * R()), R() * TAU]);
          d += r + sp * 0.6;
        }
        return d - sp * 0.6;
      },
      // virvel ved en smal åpning: steiner stenger resten av elva, og
      // virvelen ligger rett ved siden av åpningen og drar i båten
      whirl(d, R, sp, side) {
        const r = lerp(58, 70, h) + 10 * R(); d += r;
        const L = bL(d), Rr = bR(d), c = (L + Rr) / 2;
        const g = lerp(54, 40, h) + 10 * R();             // åpningen
        let lc = pickLane(R, L + 34, Rr - 34);              // midt i åpningen
        const s = side || (lc < c ? 1 : -1);                // virvelen på den største siden
        if (side) lc = s > 0 ? Math.min(lc, Rr - g / 2 - 2 * r + 10) : Math.max(lc, L + g / 2 + 2 * r - 10);
        lane = lc;
        const x = lc + s * (g / 2 + r);
        lv.whirls.push({ d, x, r, dir: R() < 0.5 ? 1 : -1 });
        // steiner fra virvelen ut til bredden (hvis den ikke rekker helt)
        const rr = 16 + 4 * R();
        for (let xx = x + s * (r + rr - 4); s > 0 ? xx < Rr + 4 : xx > L - 4; xx += s * 30) rock(d + (R() - 0.5) * 10, xx, rr);
        // og fra den andre siden av åpningen ut til den andre bredden
        for (let xx = lc - s * (g / 2 + rr); s > 0 ? xx > L - 4 : xx < Rr + 4; xx -= s * 30) rock(d + (R() - 0.5) * 10, xx, rr);
        return d + r;
      },
      // to virvler, én på hver side
      whirl2(d, R, sp) {
        const s = R() < 0.5 ? -1 : 1;
        d = P_.whirl(d, R, sp, s) + sp * 1.2;
        return P_.whirl(d, R, sp, -s);
      },
      // tre virvler i sikksakk
      whirlrow(d, R, sp) {
        let s = R() < 0.5 ? -1 : 1;
        for (let k = 0; k < 3; k++) { d = P_.whirl(d, R, sp, s) + sp * 0.9; s = -s; }
        return d - sp * 0.9;
      },
      // sidestrøm med noen steiner
      drift(d, R, sp) {
        const ln = sp * 2.6, vx = (R() < 0.5 ? -1 : 1) * (55 + 25 * R());
        lv.drifts.push({ d, len: ln, x1: 0, x2: 360, vx });
        const n = 2 + Math.floor(R() * 2);
        for (let k = 0; k < n; k++) {
          const dd = d + ln * (k + 0.6) / (n + 0.4), r = 17 + 5 * R();
          const L = bL(dd), Rr = bR(dd);
          rock(dd, lerp(L + r + 30, Rr - r - 30, R()), r);
        }
        return d + ln;
      },
      // trang renne mellom bergene (av og til med en stein)
      narrow(d, R, sp) {
        const ln = sp * (2 + R()), w = 118 + 30 * R();
        const W = width(d + 170), room = Math.max(0, (W - w) / 2 - 10);
        const n = { d0: d + 170, d1: d + 170 + ln, w, off: (R() < 0.5 ? -1 : 1) * room * (0.5 + 0.5 * R()) };
        narrows.push(n);
        // en eller to steiner inne i renna, annenhver side
        const k = ln > sp * 2.4 ? 2 : 1;
        let s = R() < 0.5 ? -1 : 1;
        for (let j = 0; j < k; j++) {
          const dd = n.d0 + ln * (j + 1) / (k + 1);
          rock(dd, center(dd) + s * w * 0.2, 14 + 4 * R());
          s = -s;
        }
        return n.d1 + 170;
      },
      // steinvegg tvers over elva med én åpning
      wallgap(d, R) {
        const r = 16 + 3 * R(); d += r;
        const L = bL(d), Rr = bR(d), g = lerp(104, 80, h) + 24 * R(), gx = pickLane(R, L + g / 2 + 24, Rr - g / 2 - 24);
        for (let x = L + 6; x < gx - g / 2 - r * 0.6; x += 30) rock(d + (R() - 0.5) * 8, x, r);
        for (let x = Rr - 6; x > gx + g / 2 + r * 0.6; x -= 30) rock(d + (R() - 0.5) * 8, x, r);
        return d + r + 4;
      },
    };

    // vekter → liste å trekke fra
    const bag = [];
    for (const k in def.mix) for (let i = 0; i < def.mix[k]; i++) bag.push(k);
    const fix = def.fix || {};

    let d = 650, i = 0, lastPearl = 0;
    lv.safe.push({ d: 0, x: 180 });
    while (true) {
      const p = P(d);
      const T = lerp(def.tf[0], def.tf[1], p), sp = vAt(d) * T;
      const R = rng(mix(def.seed, i, fix[i] || 0));
      h = p;
      // de tre første bitene er av det første slaget i oppskriften (oppvarming)
      const pick = bag[Math.floor(R() * bag.length)];
      const kind = i < 3 ? Object.keys(def.mix)[0] : pick;
      // ikke start en bit som ikke rekker å bli ferdig før havna
      if (d > len - 900) break;
      const start = d;
      d = P_[kind](d, R, sp);
      lv.parts.push({ i, kind, d0: start, d1: d });
      i++;
      // rolig stykke etter biten
      const gap = vAt(d) * lerp(def.gap[0], def.gap[1], P(d));
      const mid = d + gap / 2;
      lv.safe.push({ d: Math.round(mid), x: Math.round((bL(mid) + bR(mid)) / 2) });
      if (i - lastPearl >= (def.pearlEvery || 5) && R() < 0.7) {
        lastPearl = i;
        lv.pearls.push({ d: Math.round(mid + gap * 0.2), x: Math.round(lerp(bL(mid) + 34, bR(mid) - 34, R())) });
      }
      d += gap;
    }

    // elvebredden som punkter
    for (let dd = -200; dd <= len + 800; dd += 40) lv.banks.push([dd, Math.round(bL(dd) * 10) / 10, Math.round(bR(dd) * 10) / 10]);
    // havna ligger midt i elva
    lv.dockX = Math.round((bL(len) + bR(len)) / 2);
    for (const k of ['rocks', 'logs', 'whirls', 'pearls']) lv[k].sort((a, b) => a.d - b.d);
    for (const r of lv.rocks) { r.d = Math.round(r.d); r.x = Math.round(r.x); r.r = Math.round(r.r); }
    return lv;
  }

  /* ---------- banene (oppskrifter) ----------
   * v:   fart ved start og ved havna
   * gap: sekunder med rolig vann mellom hindrene (ved start → ved havna)
   * tf:  hvor tett ting kommer inne i et hinder (sekunder, start → slutt)
   * w:   elvas bredde (start → slutt), bend: [hvor mye den svinger, bølgelengde]
   * mix: hvilke hindre, og hvor ofte
   * fix: biter som er byttet ut fordi roboten ikke klarte dem (lages av tools/stryk.js --fix)
   */
  const DEFS = [
    {
      id: 'S-1', name: { no: 'Første stryk', en: 'First rapids' }, seed: 101,
      tip: { no: 'Trykk ved siden av båten for å styre. Trykk til venstre, så glir den mot høyre. Du tåler tre krasj.', en: 'Tap beside the boat to steer. Tap on its left and it glides right. You can crash three times.' },
      len: 26000, v: [115, 220], gap: [1.50, 0.88], tf: [0.95, 0.65], w: [300, 270],
      mix: { rock: 3, pair: 2, wall: 2, gate: 2 },
      fix: {}, // S-1
    },
    {
      id: 'S-2', name: { no: 'Strie strømmer', en: 'Fierce waters' }, seed: 202,
      tip: { no: 'Sidestrømmer drar båten med seg, og noen stokker flytter på seg.', en: 'Side currents pull the boat along, and some logs move.' },
      len: 28400, v: [121, 255], gap: [1.47, 0.78], tf: [0.94, 0.64], w: [290, 260],
      mix: { rock: 2, wall: 2, gate: 2, drift: 2, swinglog: 2, whirl: 1 },
      fix: {}, // S-2
    },
    {
      id: 'S-3', name: { no: 'Svingete elv', en: 'Winding river' }, seed: 606,
      tip: { no: 'Elva svinger. Følg den, og pass deg for steinene i svingene.', en: 'The river winds. Follow it and mind the rocks in the bends.' },
      len: 30800, v: [121, 232], gap: [1.44, 0.85], tf: [0.93, 0.63], w: [240, 220], bend: [50, 2600],
      mix: { rock: 3, wall: 2, gate: 2, pair: 1, slalom: 1 },
      fix: {}, // S-3
    },
    {
      id: 'S-4', name: { no: 'Virvelvannet', en: 'Whirlpool water' }, seed: 505,
      tip: { no: 'Virvlene suger båten inn. Hold deg unna midten av dem.', en: 'Whirlpools suck the boat in. Stay away from their middle.' },
      len: 33200, v: [140, 295], gap: [1.3, 0.7], tf: [0.92, 0.62], w: [300, 275],
      mix: { whirl: 2, whirl2: 2, whirlrow: 2, slalom: 2, stagger: 1 },
      fix: {}, // S-4
    },
    {
      id: 'S-5', name: { no: 'Juvet', en: 'The gorge' }, seed: 707,
      tip: { no: 'Bergveggene kommer tett. I de trange rennene er det lite plass.', en: 'The rock walls close in. The narrow chutes leave little room.' },
      len: 35600, v: [127, 244], gap: [1.38, 0.81], tf: [0.91, 0.61], w: [280, 250],
      mix: { narrow: 3, swingrock: 2, wallgap: 2, slalom: 1 },
      fix: {}, // S-5
    },
    {
      id: 'S-6', name: { no: 'Trange svinger', en: 'Tight bends' }, seed: 1111,
      tip: { no: 'Smal elv som svinger, med stokker som glir fram og tilbake.', en: 'A narrow, winding river with logs sliding back and forth.' },
      len: 38000, v: [150, 310], gap: [1.15, 0.62], tf: [0.90, 0.60], w: [235, 215], bend: [55, 2300],
      mix: { narrow: 2, swinglog: 2, rock: 2, wall: 2, stagger: 1 },
      fix: {}, // S-6
    },
    {
      id: 'S-7', name: { no: 'Malstrømmen', en: 'The maelstrom' }, seed: 1212,
      tip: { no: 'Virvler på rad, og strøm som drar sidelengs.', en: 'Whirlpools in a row, and currents that drag you sideways.' },
      len: 40400, v: [133, 256], gap: [1.32, 0.78], tf: [0.89, 0.60], w: [300, 275],
      mix: { whirl2: 2, whirlrow: 2, drift: 2, swingrock: 1, stagger: 1, slalom: 1 },
      fix: {}, // S-7
    },
    {
      id: 'S-8', name: { no: 'Steinrøysa', en: 'Boulder run' }, seed: 303,
      tip: { no: 'Her ligger steinene tett. Se etter den åpne veien.', en: 'The rocks are packed tight here. Look for the open way.' },
      len: 42800, v: [136, 262], gap: [1.29, 0.76], tf: [0.88, 0.59], w: [300, 270],
      mix: { field: 3, slalom: 2, wall: 2, rock: 1, pair: 1 },
      fix: { 65: 1 }, // S-8
    },
    {
      id: 'S-9', name: { no: 'Steinsprang', en: 'Rockfall' }, seed: 1313,
      tip: { no: 'Steinvegger med smale åpninger, og trange renner.', en: 'Rock walls with narrow openings, and tight chutes.' },
      len: 45200, v: [139, 268], gap: [1.26, 0.74], tf: [0.87, 0.58], w: [285, 260],
      mix: { field: 2, wallgap: 3, narrow: 2, slalom: 1 },
      fix: {}, // S-9
    },
    {
      id: 'S-10', name: { no: 'Sidestrømmer', en: 'Crosscurrents' }, seed: 808,
      tip: { no: 'Strømmen drar båten sidelengs. Styr i mot før det er for sent.', en: 'The current drags the boat sideways. Steer against it early.' },
      len: 50000, v: [145, 280], gap: [1.20, 0.71], tf: [0.85, 0.56], w: [290, 265],
      mix: { drift: 4, wall: 2, stagger: 2, rock: 1 },
      fix: {}, // S-10
    },
    {
      id: 'S-11', name: { no: 'Tømmerfløting', en: 'Log drive' }, seed: 404,
      tip: { no: 'Stokkene ligger fra bredden. Styr gjennom åpningene.', en: 'Logs reach out from the banks. Steer through the gaps.' },
      len: 47600, v: [118, 228], gap: [1.7, 0.95], tf: [0.86, 0.57], w: [300, 270],
      mix: { gate: 3, stagger: 1, diag: 2, swinglog: 2 },
      fix: {}, // S-11
    },
    {
      id: 'S-12', name: { no: 'Vandrende steiner', en: 'Wandering rocks' }, seed: 909,
      tip: { no: 'Noen steiner og stokker glir fram og tilbake. Vent på åpningen.', en: 'Some rocks and logs slide back and forth. Wait for the opening.' },
      len: 52400, v: [148, 286], gap: [1.17, 0.69], tf: [0.84, 0.55], w: [290, 265],
      mix: { swingrock: 3, swinglog: 3, stagger: 1, wall: 1 },
      fix: {}, // S-12
    },
    {
      id: 'S-13', name: { no: 'Stokk og stein', en: 'Logs and rocks' }, seed: 1010,
      tip: { no: 'Alt på en gang: stokker, steinvegger og steinrøyser.', en: 'Everything at once: logs, rock walls and boulder fields.' },
      len: 54800, v: [140, 270], gap: [1.45, 0.8], tf: [0.83, 0.54], w: [290, 260],
      mix: { stagger: 2, slalom: 2, diag: 2, field: 2, gate: 1 },
      fix: { 103: 1 }, // S-13
    },
    {
      id: 'S-14', name: { no: 'Flomstryket', en: 'Flood rapids' }, seed: 1414,
      tip: { no: 'Flom i elva. Alt kan komme, og det går fort.', en: 'The river is in flood. Anything can come, and it is fast.' },
      len: 57200, v: [154, 298], gap: [1.11, 0.66], tf: [0.82, 0.53], w: [280, 255], bend: [30, 2800],
      mix: { rock: 1, pair: 1, wall: 1, slalom: 1, field: 1, gate: 1, stagger: 1, diag: 1, swinglog: 1, swingrock: 1, whirl: 1, drift: 1, narrow: 1, wallgap: 1 },
      fix: { 79: 1 }, // S-14
    },
    {
      id: 'S-15', name: { no: 'Villmarka', en: 'The wilderness' }, seed: 1515,
      tip: { no: 'Det lengste og villeste stryket. Klarer noen hele?', en: 'The longest and wildest rapids. Can anyone make it all the way?' },
      len: 59600, v: [165, 330], gap: [1.0, 0.58], tf: [0.81, 0.52], w: [270, 245], bend: [40, 2500],
      mix: { rock: 1, pair: 1, wall: 1, slalom: 1, field: 1, gate: 1, stagger: 1, diag: 1, swinglog: 1, swingrock: 1, whirl: 1, whirl2: 1, whirlrow: 1, drift: 1, narrow: 1, wallgap: 1 },
      fix: { 109: 1 }, // S-15
    },
  ];

  const LEVELS = DEFS.map(build);

  root.Stryket = {
    K, DEFS, LEVELS, build, create, step, tap, clone, sy, boatD, logEnds, rockX, progress, starsFor, meters,
    speedAt, bankL, bankR, falloff,
  };
})(typeof window !== 'undefined' ? window : globalThis);
