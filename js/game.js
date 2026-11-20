/* =====================================================================
 * Krusning – spillets hovedfil
 * ---------------------------------------------------------------------
 * Binder sammen fysikk (engine.js), tegning (render.js), lyd (audio.js),
 * baner (levels.js) og tekster (strings.js). Her ligger:
 *   • skjermene: tittel, banekart, spill, resultat, innstillinger
 *   • trykk: hold for å sikte, slipp for å lage krusning
 *   • stjerner, perler, rekorder og lagring (kun på enheten)
 *   • effekter: sprut, kjølvann, gnister, fisk og blader
 *   • hint som regnes ut direkte fra situasjonen
 * ===================================================================== */
(function () {
  'use strict';
  const E = window.Engine, R = window.Render, S = window.Sound, I = window.I18N, LV = window.Levels;
  const C = E.C;
  const TAU = Math.PI * 2;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => I.t(k, v);

  /* ---------- lagring (localStorage – bare på denne enheten) ---------- */
  // Versjon 2 (nov. 2026): la til Rask runde (quick) og Dagens dam (daily).
  // Fremgang fra versjon 1 hentes automatisk inn første gang.
  const SAVE_KEY = 'krusning.save.v2';
  const OLD_KEY = 'krusning.save.v1';
  const TIERS = ['easy', 'medium', 'hard'];
  function quickDefaults() {
    const q = {};
    for (const tr of TIERS) q[tr] = { i: 0, played: 0, three: 0, pearls: 0, streak: 0, best: 0 };
    return q;
  }
  function defaults() { return { v: 2, lang: 'no', sfx: true, music: true, levels: {}, last: null, quick: quickDefaults(), daily: {} }; }
  function upgrade(s) {
    const out = Object.assign(defaults(), s, { v: 2 });
    out.quick = quickDefaults();
    for (const tr of TIERS) Object.assign(out.quick[tr], (s.quick && s.quick[tr]) || {});
    out.daily = s.daily || {};
    out.levels = s.levels || {};
    return out;
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) { const s = JSON.parse(raw); if (s && s.v === 2) return upgrade(s); }
      const old = localStorage.getItem(OLD_KEY);
      if (old) { const s = JSON.parse(old); if (s && s.v === 1) return upgrade(s); }
    } catch (e) { /* privat modus e.l. – spill uten lagring */ }
    return defaults();
  }
  let save = load();
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignorer */ } }

  /* ---------- baner og fremgang ---------- */
  const ALL = [];
  LV.WORLDS.forEach((w, wi) => (w.levels || []).forEach((lv, li) => ALL.push({ lv, w, wi, li, idx: ALL.length })));
  const byId = (id) => ALL.find((e) => e.lv.id === id);
  const rec = (id) => save.levels[id];

  function thresholds(lv) { return [lv.par, lv.par + Math.max(1, Math.round(lv.par * 0.5))]; }
  function starsFor(lv, taps) { const [a, b] = thresholds(lv); return taps <= a ? 3 : taps <= b ? 2 : 1; }
  function totalStars() { let n = 0; for (const k in save.levels) n += save.levels[k].stars || 0; return n; }
  function totalPearls() { let n = 0; for (const k in save.levels) if (save.levels[k].pearl) n++; return n; }
  // En verden åpnes med nok stjerner, og når finalen i verdenen før er klart.
  function prevFinale(w) {
    const i = LV.WORLDS.indexOf(w);
    for (let k = i - 1; k >= 0; k--) {
      const lv = LV.WORLDS[k].levels;
      if (lv && lv.length) return lv[lv.length - 1];
    }
    return null;
  }
  function worldOpen(w) {
    if (w.soon) return false;
    const fin = prevFinale(w);
    if (fin && !w.unlockPearls && !rec(fin.id)) return false;
    return totalStars() >= (w.unlockStars || 0) && totalPearls() >= (w.unlockPearls || 0);
  }
  function levelOpen(e) {
    if (rec(e.lv.id)) return true;
    if (!worldOpen(e.w)) return false;
    if (e.li === 0) return true;
    return !!rec(e.w.levels[e.li - 1].id);
  }
  function nextToPlay() {
    for (const e of ALL) if (levelOpen(e) && !rec(e.lv.id)) return e;
    return (save.last && byId(save.last)) || ALL[0];
  }
  const anyProgress = () => Object.keys(save.levels).length > 0;

  /* ---------- tilstand ---------- */
  const G = {
    screen: 'title',
    entry: null, world: null, titleWorld: null,
    acc: 0, time: 0, last: 0,
    aim: null, rect: null,
    particles: [], fish: [], leaves: [],
    boatFx: {}, dockFx: {}, look: null,
    completed: false, winAt: -1, result: null,
    hint: null, hintToken: 0, hintBusy: false, hintUsed: false,
    shownStars: 3, handOn: false, tipOn: false,
    mapWorld: 0, nextAmbient: 3,
  };

  // Dammen bak tittelskjermen: noen båter å leke med.
  const TITLE_LEVEL = {
    id: 'title',
    boats: [{ x: 92, y: 300, angle: -0.5 }, { x: 262, y: 262, angle: 3.5 }, { x: 178, y: 392, angle: -1.9, color: 2 }],
    pads: [{ x: 66, y: 450, r: 22, flower: true }, { x: 300, y: 405, r: 18 }],
    rocks: [{ x: 296, y: 136, r: 19 }],
    docks: [],
  };

  /* ---------- skjermer ---------- */
  const canvas = $('game');

  function setScreen(name) {
    G.screen = name;
    $('title').hidden = name !== 'title';
    $('map').hidden = name !== 'map';
    $('hud').hidden = name !== 'play';
    $('win').hidden = true;
    if (name !== 'play') { hideTip(true); hideHand(); $('banner').hidden = true; G.aim = null; G.hint = null; }
  }

  function transition(fn) {
    const f = $('fade');
    f.classList.add('on');
    setTimeout(() => { fn(); requestAnimationFrame(() => f.classList.remove('on')); }, 220);
  }

  function toTitle() {
    G.world = G.titleWorld;
    G.entry = null;
    spawnDecor('title');
    setBoatFx(G.world);
    setScreen('title');
    applyTexts();
  }

  /* ---------- bane ---------- */
  function startLevel(entry, quick) {
    G.entry = entry;
    if (!entry.mode) { save.last = entry.lv.id; persist(); }
    G.world = E.createWorld(entry.lv);
    G.acc = 0; G.particles = []; G.dockFx = {}; G.look = null;
    G.completed = false; G.winAt = -1; G.result = null;
    G.hint = null; G.hintToken++; G.hintUsed = false; G.hintBusy = false;
    $('btnHint').classList.remove('busy');
    G.shownStars = 3;
    setBoatFx(G.world);
    spawnDecor(entry.lv.id);
    setScreen('play');
    updateHud(true);
    if (!quick) showBanner(entry.lv);
    showTip(entry.lv, quick ? 150 : 900);
    G.handOn = !!entry.lv.hand && !rec(entry.lv.id);
    $('hand').hidden = !G.handOn;
  }

  function restart() {
    if (!G.entry) return;
    S.click();
    startLevel(G.entry, true);
    for (const b of G.world.boats) { const f = G.boatFx[b.id]; if (f) f.pop = 1; }
  }

  function setBoatFx(w) {
    G.boatFx = {};
    const colored = w.docks.some((d) => d.color >= 0);
    for (const b of w.boats) b.mark = colored;
    for (const b of w.boats) G.boatFx[b.id] = { squash: 0, blink: 0, nextBlink: 1 + Math.random() * 3, angle: b.angle, pop: 0, wake: 0 };
  }

  /* ---------- trykk ---------- */
  function toWorld(e) {
    const r = G.rect || canvas.getBoundingClientRect();
    return R.toWorld(e.clientX - r.left, e.clientY - r.top);
  }

  canvas.addEventListener('pointerdown', (e) => {
    S.unlock();
    const p = toWorld(e);
    if (G.screen === 'title') {
      if (E.insidePond(p.x, p.y, 2)) E.tap(G.world, p.x, p.y);
      return;
    }
    if (G.screen !== 'play' || G.completed || !E.insidePond(p.x, p.y, 2)) return;
    G.aim = { x: p.x, y: p.y, cancel: false, id: e.pointerId };
    hideHand();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!G.aim || e.pointerId !== G.aim.id) return;
    const p = toWorld(e);
    G.aim.x = p.x; G.aim.y = p.y;
    G.aim.cancel = !E.insidePond(p.x, p.y, 2);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!G.aim || e.pointerId !== G.aim.id) return;
    const a = G.aim; G.aim = null;
    if (!a.cancel) playerTap(a.x, a.y);
  });
  canvas.addEventListener('pointercancel', () => { G.aim = null; });
  // hindre zoom/rulling på iOS
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.target === canvas) e.preventDefault(); }, { passive: false });

  function playerTap(x, y) {
    if (!G.world || G.completed) return;
    if (!E.tap(G.world, x, y)) return;
    G.hintToken++;
    if (G.hintBusy) { G.hintBusy = false; $('btnHint').classList.remove('busy'); }
    G.hint = null;
    hideHand();
    hideTip();
  }

  /* ---------- hovedløkke ---------- */
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - G.last) / 1000));
    G.last = now; G.time += dt;
    if (G.world) {
      G.acc += dt;
      let n = 0;
      while (G.acc >= C.DT && n < 10) {
        E.step(G.world);
        G.acc -= C.DT; n++;
        if (G.world.events.length) handleEvents();
      }
      if (n >= 10) G.acc = 0;
    }
    updateFx(dt);
    if (G.screen === 'title') titleAmbience(dt);
    if (G.screen === 'play') liveStars();
    if (G.winAt > 0 && G.time >= G.winAt) { G.winAt = -1; showWin(); }
    R.draw({
      world: G.world, time: G.time,
      particles: G.particles, fish: G.fish, leaves: G.leaves,
      boatFx: G.boatFx, dockFx: G.dockFx,
      look: G.look, aim: G.aim, hint: G.hint,
    });
    if (G.handOn) positionHand();
    requestAnimationFrame(frame);
  }

  function handleEvents() {
    const w = G.world;
    for (const ev of w.events) {
      switch (ev.type) {
        case 'tap':
          splash(ev.x, ev.y);
          S.plip(ev.x / C.W);
          G.look = { x: ev.x, y: ev.y, until: G.time + 2.5 };
          break;
        case 'hit': {
          const f = G.boatFx[ev.id];
          if (f) f.squash = 1;
          S.hit(ev.f);
          break;
        }
        case 'bump': bumpFx(ev); S.bump(ev.v, ev.what); break;
        case 'dock': dockFx(ev); S.dock(ev.n); break;
        case 'complete': if (G.screen === 'play' && w === G.world && G.entry) onComplete(); break;
        case 'sink': sinkFx(ev); S.sink(); break;
        case 'crash': crashFx(ev); S.crash(); break;
        case 'fall': fallFx(ev); S.fall(); break;
        case 'respawn': respawnFx(ev); S.pop(); break;
      }
    }
    w.events.length = 0;
  }

  /* ---------- effekter ---------- */
  function addP(p) { p.t = 0; G.particles.push(p); if (G.particles.length > 420) G.particles.shift(); }

  function splash(x, y) {
    addP({ type: 'flash', x, y, size: 24, life: 0.42 });
    for (let i = 0; i < 11; i++) {
      const a = Math.random() * TAU, sp = 40 + Math.random() * 95;
      addP({ type: 'drop', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 4.5, size: 1.1 + Math.random() * 1.5, life: 0.32 + Math.random() * 0.28 });
    }
  }
  function bumpFx(ev) {
    const k = Math.min(1, ev.v / 300);
    for (let i = 0; i < 2 + k * 7; i++) {
      const a = Math.random() * TAU, sp = 20 + Math.random() * 60 * k;
      addP({ type: 'drop', x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 5, size: 1 + Math.random(), life: 0.3 + Math.random() * 0.2 });
    }
    for (const b of G.world.boats) {
      if (Math.hypot(b.x - ev.x, b.y - ev.y) < b.r + 6) { const f = G.boatFx[b.id]; if (f) f.squash = Math.max(f.squash, 0.6 * k); }
    }
  }
  function dockFx(ev) {
    G.dockFx[ev.dock] = { flash: 1 };
    const f = G.boatFx[ev.id]; if (f) f.pop = 1;
    addP({ type: 'ringfx', x: ev.x, y: ev.y, r0: 20, size: 34, life: 0.7 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + Math.random() * 0.3, sp = 50 + Math.random() * 70;
      addP({ type: 'spark', x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, size: 2.5 + Math.random() * 2.5, angle: Math.random() * 3, life: 0.6 + Math.random() * 0.4 });
    }
  }
  function sinkFx(ev) {
    for (let i = 0; i < 14; i++) {
      addP({ type: 'bubble', layer: 'under', x: ev.x + (Math.random() - 0.5) * 16, y: ev.y + (Math.random() - 0.5) * 16, vx: 0, vy: 0, size: 1.5 + Math.random() * 2.5, life: 0.4 + Math.random() * 0.9 });
    }
  }
  function crashFx(ev) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * TAU, sp = 40 + Math.random() * 90;
      addP({ type: 'drop', x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 4, size: 1.2 + Math.random() * 1.6, life: 0.4 + Math.random() * 0.3 });
    }
    const f = G.boatFx[ev.id]; if (f) f.squash = 1;
  }
  function fallFx(ev) {
    addP({ type: 'ringfx', x: ev.x + ev.nx * 10, y: ev.y + ev.ny * 10, r0: 6, size: 24, life: 0.5, rgb: '255,255,255' });
    for (let i = 0; i < 10; i++) {
      const a = Math.atan2(ev.ny, ev.nx) + (Math.random() - 0.5) * 2.4, sp = 30 + Math.random() * 70;
      addP({ type: 'drop', x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 4.5, size: 1 + Math.random() * 1.4, life: 0.3 + Math.random() * 0.3 });
    }
    const f = G.boatFx[ev.id]; if (f) f.squash = 0.8;
  }
  function respawnFx(ev) {
    addP({ type: 'ringfx', x: ev.x, y: ev.y, r0: 6, size: 30, life: 0.5, rgb: '255,255,255' });
    const f = G.boatFx[ev.id]; if (f) f.pop = 1;
  }
  function confetti() {
    const cols = R.PAL.boats.map((p) => p[0]).concat(['#ffffff', '#ffe08a']);
    for (let i = 0; i < 60; i++) {
      addP({
        type: 'paper', x: Math.random() * C.W, y: -20 - Math.random() * 140,
        vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 60, grav: 30, drag: 0.4,
        size: 3 + Math.random() * 3, color: cols[i % cols.length], angle: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 6, flip: 4 + Math.random() * 6, life: 3 + Math.random() * 1.5,
      });
    }
  }

  function updateFx(dt) {
    const ps = G.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.t += dt;
      if (p.t >= p.life) { ps.splice(i, 1); continue; }
      if (p.vx != null) {
        const k = Math.exp(-(p.drag || 0) * dt);
        p.vx *= k; p.vy *= k;
        if (p.grav) p.vy += p.grav * dt;
        if (p.type === 'paper') p.vx += Math.sin(p.t * 3 + p.angle) * 20 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }
    const w = G.world;
    if (w) {
      for (const b of w.boats) {
        const f = G.boatFx[b.id];
        if (!f) continue;
        f.squash = Math.max(0, f.squash - dt * 3.2);
        f.pop = Math.max(0, f.pop - dt * 2.6);
        f.nextBlink -= dt;
        if (f.nextBlink <= 0) { f.blink = 0.13; f.nextBlink = 2 + Math.random() * 4; }
        f.blink = Math.max(0, f.blink - dt);
        const sp = Math.hypot(b.vx, b.vy);
        let target = null;
        if (b.dock >= 0) target = w.docks[b.dock].angle;
        else if (sp > 25) target = Math.atan2(b.vy, b.vx);
        if (target != null) {
          let d = target - f.angle;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          f.angle += d * Math.min(1, dt * (b.dock >= 0 ? 5 : 7));
        }
        if (sp > 55 && b.dock < 0 && b.sink <= 0) {
          f.wake += dt;
          if (f.wake > 0.035) {
            f.wake = 0;
            addP({ type: 'wake', layer: 'under', x: b.x - Math.cos(f.angle) * 12, y: b.y - Math.sin(f.angle) * 12, size: 5 + sp / 90, angle: f.angle, life: 0.8 });
          }
        }
      }
      for (const k in G.dockFx) G.dockFx[k].flash = Math.max(0, G.dockFx[k].flash - dt * 1.6);
      updateFish(dt, w);
      updateLeaves(dt, w);
    }
    if (G.look && G.time > G.look.until) G.look = null;
  }

  /* ---------- liv i dammen: fisk og blader ---------- */
  function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
  }
  function spawnDecor(id) {
    const rnd = seeded(String(id));
    G.fish = [];
    for (let i = 0; i < 4; i++) {
      G.fish.push({ x: 40 + rnd() * 280, y: 60 + rnd() * 480, angle: rnd() * TAU, speed: 13 + rnd() * 9, size: 6.5 + rnd() * 4, phase: rnd() * 10, dart: 0, hit: {}, wander: rnd() * 10 });
    }
    G.leaves = [];
    const w = G.world;
    const cols = ['#e9a23b', '#d9663a', '#a6cf5f', '#f2c14e'];
    for (let i = 0; i < 3; i++) {
      let x = 0, y = 0;
      for (let tries = 0; tries < 30; tries++) {
        x = 30 + rnd() * 300; y = 40 + rnd() * 520;
        let ok = true;
        for (const b of w.bodies) if (Math.hypot(b.x - x, b.y - y) < b.r + 24) ok = false;
        for (const d of w.docks) if (Math.hypot(d.x - x, d.y - y) < d.r + 20) ok = false;
        for (const r of w.rocks) if (Math.hypot(r.x - x, r.y - y) < r.r + 16) ok = false;
        if (ok) break;
      }
      G.leaves.push({ x, y, vx: 0, vy: 0, angle: rnd() * TAU, spin: 0, size: 5.5 + rnd() * 2.5, color: cols[i % cols.length], hit: {} });
    }
  }

  function updateFish(dt, w) {
    for (const f of G.fish) {
      f.wander += dt;
      f.angle += Math.sin(f.wander * 0.7 + f.phase) * 0.9 * dt;
      // hold deg unna kanten
      const m = 40;
      if (f.x < m || f.x > C.W - m || f.y < m || f.y > C.H - m) {
        const a = Math.atan2(C.H / 2 - f.y, C.W / 2 - f.x);
        let d = a - f.angle; d = Math.atan2(Math.sin(d), Math.cos(d));
        f.angle += d * Math.min(1, dt * 2.5);
      }
      // skvett unna krusninger
      for (const rp of w.ripples) {
        if (f.hit[rp.id]) continue;
        const d = Math.hypot(f.x - rp.x, f.y - rp.y);
        if (rp.r >= d - 10) {
          f.hit[rp.id] = true;
          if (E.falloff(d) > 0.06) { f.dart = 1; f.angle = Math.atan2(f.y - rp.y, f.x - rp.x) + (Math.random() - 0.5) * 0.6; }
        }
      }
      f.dart = Math.max(0, f.dart - dt * 1.4);
      const sp = f.speed + f.dart * f.dart * 170;
      f.x += Math.cos(f.angle) * sp * dt;
      f.y += Math.sin(f.angle) * sp * dt;
      f.x = Math.max(8, Math.min(C.W - 8, f.x)); f.y = Math.max(8, Math.min(C.H - 8, f.y));
    }
  }

  function updateLeaves(dt, w) {
    for (const l of G.leaves) {
      for (const rp of w.ripples) {
        if (l.hit[rp.id]) continue;
        const d = Math.hypot(l.x - rp.x, l.y - rp.y);
        if (rp.r >= d - 4) {
          l.hit[rp.id] = true;
          const f = E.falloff(d);
          if (f > 0 && d > 0.01) { l.vx += ((l.x - rp.x) / d) * 150 * f; l.vy += ((l.y - rp.y) / d) * 150 * f; l.spin += (Math.random() - 0.5) * 6 * f; }
        }
      }
      const k = Math.exp(-1.4 * dt);
      l.vx *= k; l.vy *= k; l.spin *= k;
      l.x += l.vx * dt; l.y += l.vy * dt; l.angle += l.spin * dt;
      if (l.x < 8) { l.x = 8; l.vx = Math.abs(l.vx) * 0.5; }
      if (l.x > C.W - 8) { l.x = C.W - 8; l.vx = -Math.abs(l.vx) * 0.5; }
      if (l.y < 8) { l.y = 8; l.vy = Math.abs(l.vy) * 0.5; }
      if (l.y > C.H - 8) { l.y = C.H - 8; l.vy = -Math.abs(l.vy) * 0.5; }
    }
  }

  // På tittelskjermen hopper en fisk av og til, så båtene driver litt.
  function titleAmbience(dt) {
    G.nextAmbient -= dt;
    if (G.nextAmbient > 0) return;
    G.nextAmbient = 5 + Math.random() * 4;
    const w = G.world;
    for (let tries = 0; tries < 12; tries++) {
      const x = 40 + Math.random() * 280, y = 120 + Math.random() * 360;
      if (w.bodies.every((b) => Math.hypot(b.x - x, b.y - y) > 130)) { E.tap(w, x, y); break; }
    }
  }

  /* ---------- toppmeny, tips og hånd ---------- */
  function updateHud() {
    if (!G.entry || !G.world) return;
    const lv = G.entry.lv;
    $('hudId').textContent = entryLabel(G.entry);
    $('hudName').textContent = I.pick(lv.name);
    $('hudTaps').textContent = G.world.taps;
    $('hudPar').textContent = t('par') + ' ' + lv.par;
    paintHudStars(G.shownStars, -1);
  }

  function paintHudStars(n, lostIdx) {
    const stars = $('hudStars').children;
    for (let i = 0; i < 3; i++) {
      stars[i].classList.toggle('off', i >= n);
      if (i === lostIdx) { stars[i].classList.remove('lost'); void stars[i].getBoundingClientRect(); stars[i].classList.add('lost'); }
    }
  }

  // Viser hvor mange stjerner som fortsatt er mulig.
  function liveStars() {
    if (!G.world || !G.entry) return;
    const w = G.world, lv = G.entry.lv;
    if (+$('hudTaps').textContent !== w.taps) $('hudTaps').textContent = w.taps;
    const possible = G.completed ? starsFor(lv, w.taps) : starsFor(lv, E.isSettled(w) ? w.taps + 1 : w.taps);
    if (possible !== G.shownStars) {
      const lost = possible < G.shownStars ? possible : -1;
      if (lost >= 0 && !G.completed) S.lose();
      G.shownStars = possible;
      paintHudStars(possible, lost);
    }
    $('btnRestart').classList.toggle('nudge', !G.completed && possible < 3);
  }

  function showBanner(lv) {
    const b = $('banner');
    $('bannerId').textContent = entryLabel(G.entry);
    $('bannerName').textContent = I.pick(lv.name);
    b.hidden = false;
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(showBanner.tm);
    showBanner.tm = setTimeout(() => { b.hidden = true; }, 2000);
  }

  function showTip(lv, delay) {
    hideTip(true);
    if (!lv.tip) return;
    clearTimeout(showTip.tm);
    showTip.tm = setTimeout(() => {
      if (G.screen !== 'play' || G.entry.lv !== lv || G.world.taps > 0) return;
      const el = $('tip');
      $('tipText').textContent = I.pick(lv.tip);
      el.classList.remove('out');
      el.hidden = false;
      G.tipOn = true;
    }, delay || 0);
  }
  function hideTip(now) {
    clearTimeout(showTip.tm);
    const el = $('tip');
    if (el.hidden) return;
    if (now) { el.hidden = true; G.tipOn = false; return; }
    el.classList.add('out');
    setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 350);
    G.tipOn = false;
  }

  function positionHand() {
    const lv = G.entry && G.entry.lv;
    if (!lv || !lv.hand) return;
    const p = R.toScreen(lv.hand.x, lv.hand.y);
    const el = $('hand');
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
  }
  function hideHand() { G.handOn = false; $('hand').hidden = true; }

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(toast.tm);
    toast.tm = setTimeout(() => { el.hidden = true; }, 2700);
  }

  /* ---------- bane fullført ---------- */
  function onComplete() {
    G.completed = true;
    G.aim = null; G.hint = null;
    const lv = G.entry.lv, taps = G.world.taps;
    const stars = starsFor(lv, taps);
    const pearl = taps <= lv.pearl && !G.hintUsed;
    if (G.entry.mode) {
      G.result = recordMode(G.entry, taps, stars, pearl);
      G.winAt = G.time + 1.05;
      hideTip(true);
      setTimeout(() => { if (G.completed) { S.win(); confetti(); } }, 350);
      return;
    }
    const prev = rec(lv.id) ? Object.assign({}, rec(lv.id)) : null;
    const starsBefore = totalStars();
    G.openBefore = LV.WORLDS.map(worldOpen);
    const r = save.levels[lv.id] || (save.levels[lv.id] = { best: taps, stars: 0, pearl: false, plays: 0 });
    r.best = Math.min(r.best, taps);
    r.stars = Math.max(r.stars, stars);
    r.pearl = !!(r.pearl || pearl);
    r.plays = (r.plays || 0) + 1;
    persist();
    G.result = { stars, pearl, taps, prev, rec: r, firstPearl: pearl && !(prev && prev.pearl), newBest: !!prev && taps < prev.best, starsBefore };
    G.winAt = G.time + 1.05;
    hideTip(true);
    setTimeout(() => { if (G.completed) { S.win(); confetti(); } }, 350);
  }

  function showWin() {
    if (!G.result || G.screen !== 'play') return;
    const res = G.result, lv = G.entry.lv;
    $('winTitle').textContent = res.pearl ? t('winPearl') : t(res.stars === 3 ? 'win3' : res.stars === 2 ? 'win2' : 'win1');
    const stars = $('winStars').children;
    for (let i = 0; i < 3; i++) stars[i].classList.remove('on');
    $('winStats').textContent = t('usedOfPar', { used: I.ripples(res.taps), par: lv.par });
    const best = $('winBest');
    best.hidden = !res.newBest;
    best.textContent = t('newBest');

    const box = $('pearlBox');
    box.className = 'pearl-box';
    if (res.firstPearl) {
      box.classList.add('found');
      $('pearlTitle').textContent = t('pearlFound');
      $('pearlSub').textContent = t('pearlFoundSub');
    } else if (res.rec.pearl) {
      box.classList.add('have');
      $('pearlTitle').textContent = t('pearlHave');
      $('pearlSub').textContent = t('pearlHaveSub', { used: I.ripples(lv.pearl) });
    } else {
      box.classList.add('missing');
      $('pearlTitle').textContent = t('pearlGoal', { used: I.ripples(lv.pearl) });
      $('pearlSub').textContent = G.hintUsed ? t('pearlHintUsed') : t('pearlTease');
    }
    $('btnRetryTxt').textContent = res.stars < 3 ? t('retryFor3') : t('retry');
    $('btnNextTxt').textContent = t('next');
    $('btnWinMap').textContent = t('toMap');
    const mode = G.entry.mode;
    $('btnNext').querySelector('use').setAttribute('href', mode === 'daily' ? '#i-share' : '#i-next');
    if (mode === 'quick') {
      $('btnNextTxt').textContent = t('nextBoard');
      $('btnWinMap').textContent = t('menu');
      const q = save.quick[G.entry.tier];
      if (q.streak >= 2) { best.hidden = false; best.textContent = t('quickStreak', { n: q.streak }); }
    } else if (mode === 'daily') {
      $('btnNextTxt').textContent = t('share');
      $('btnWinMap').textContent = t('menu');
    }
    $('win').hidden = false;

    for (let i = 0; i < res.stars; i++) {
      setTimeout(() => { if (!$('win').hidden) { stars[i].classList.add('on'); S.star(i); } }, 380 + i * 300);
    }
    if (res.firstPearl) setTimeout(() => { if (!$('win').hidden) S.pearl(); }, 480 + res.stars * 300);

    // åpnet dette en ny verden?
    if (!G.entry.mode && G.openBefore) {
      LV.WORLDS.forEach((w, i) => {
        if (!G.openBefore[i] && worldOpen(w)) setTimeout(() => toast(t('unlocked', { name: I.pick(w.name) })), 1400);
      });
    }
  }

  function goNext() {
    S.click();
    const e = G.entry;
    if (e.mode === 'quick') { transition(() => startLevel(quickEntry(e.tier))); return; }
    if (e.mode === 'daily') { shareDaily(e.day); return; }
    const nxt = ALL[e.idx + 1];
    if (nxt && levelOpen(nxt)) { transition(() => startLevel(nxt)); return; }
    // slutten av verdenen: vis neste verden på kartet
    transition(() => {
      openMap(Math.min(LV.WORLDS.length - 1, e.wi + 1));
      const w = LV.WORLDS[e.wi + 1];
      if (w && !w.soon && !worldOpen(w) && w.unlockStars > totalStars()) toast(t('needStars', { n: w.unlockStars - totalStars(), name: I.pick(w.name) }));
    });
  }

  /* ---------- banekart ---------- */
  function openMap(wi) {
    G.mapWorld = wi != null ? wi : G.entry && !G.entry.mode ? G.entry.wi : nextToPlay().wi;
    if (G.screen === 'play' || !G.world) { G.world = G.titleWorld; G.entry = null; spawnDecor('title'); setBoatFx(G.world); }
    renderMap();
    setScreen('map');
  }

  function starRow(n) {
    let h = '';
    for (let i = 0; i < 3; i++) h += `<svg class="star${i < n ? '' : ' off'}"><use href="#i-star"/></svg>`;
    return h;
  }

  function renderMap() {
    const w = LV.WORLDS[G.mapWorld];
    $('mapWorldNo').textContent = t('world', { n: w.id });
    $('mapWorldName').textContent = I.pick(w.name);
    $('mapStars').textContent = totalStars();
    $('mapPearls').textContent = totalPearls();
    $('mapBlurb').textContent = I.pick(w.blurb);
    const open = worldOpen(w);
    const grid = $('levelGrid');
    const lock = $('worldLock');
    if (open && w.levels.length) {
      const cur = nextToPlay();
      grid.innerHTML = '';
      for (const e of ALL.filter((x) => x.w === w)) {
        const r = rec(e.lv.id);
        const ok = levelOpen(e);
        const b = document.createElement('button');
        b.className = 'lvl' + (ok ? '' : ' locked') + (ok && e === cur && !r ? ' current' : '');
        b.setAttribute('aria-label', `${e.lv.id} ${I.pick(e.lv.name)}`);
        b.innerHTML = `<span class="pad">${ok ? `<span class="num">${e.li + 1}</span>` : '<svg class="lock"><use href="#i-lock"/></svg>'}`
          + `${r && r.pearl ? '<i class="pearl lvl-pearl"></i>' : ''}</span>`
          + `<span class="lvl-stars">${starRow(r ? r.stars : 0)}</span>`;
        if (ok) b.addEventListener('click', () => { S.unlock(); S.click(); transition(() => startLevel(e)); });
        grid.appendChild(b);
      }
      grid.hidden = false; lock.hidden = true;
    } else {
      grid.hidden = true; lock.hidden = false;
      $('lockBlurb').textContent = I.pick(w.blurb);
      let need = '', frac = 0;
      if (w.unlockPearls) { need = t('unlockPearls', { n: w.unlockPearls }); frac = totalPearls() / w.unlockPearls; }
      else if (!open && w.unlockStars && totalStars() < w.unlockStars) { need = t('unlockStars', { n: w.unlockStars }); frac = totalStars() / w.unlockStars; }
      else if (!open && prevFinale(w)) { need = t('needFinale', { id: prevFinale(w).id }); frac = 0.95; }
      if (w.soon) need = (need ? need + ' · ' : '') + t('soon');
      else if (open) { need = t('demoSoon'); frac = 1; }
      $('lockNeed').textContent = need;
      $('lockBarFill').style.width = Math.min(100, Math.round(frac * 100)) + '%';
      $('mapBlurb').textContent = '';
    }
    const dots = $('worldDots');
    dots.innerHTML = LV.WORLDS.map((_, i) => `<i class="${i === G.mapWorld ? 'on' : ''}"></i>`).join('');
    $('worldPrev').disabled = G.mapWorld === 0;
    $('worldNext').disabled = G.mapWorld === LV.WORLDS.length - 1;
  }

  /* ---------- Rask runde og Dagens dam ---------- */
  // Brettene lages av js/gen.js fra frø i js/pool.js (testet på forhånd med tools/gen.js).
  const PO = window.Pool, GEN = window.Gen;
  const TIER_NEED = { easy: null, medium: '1-10', hard: '2-1' }; // mekanikkene må være møtt på Stien
  const tierOpen = (tr) => !TIER_NEED[tr] || !!rec(TIER_NEED[tr]);
  const pad2 = (n) => String(n).padStart(2, '0');

  function entryLabel(e) {
    if (e.mode === 'quick') return t('tier_' + e.tier);
    if (e.mode === 'daily') return '#' + e.num;
    return e.lv.id;
  }

  function quickEntry(tr) {
    const list = PO.quick[tr], q = save.quick[tr];
    const lv = GEN.fromPool(list[q.i % list.length], tr);
    return { lv, mode: 'quick', tier: tr, wi: 0, idx: -1, done: false, stars: 0, pearl: false, prevStreak: 0 };
  }

  // Datoer som tekst 'ÅÅÅÅ-MM-DD' i lokal tid. Dagnummer telles fra Pool.daily.start.
  function todayKey() {
    if (G.fakeToday) return G.fakeToday; // brukes av testene
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function keyUTC(key) { const p = key.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function keyAdd(key, n) {
    const d = new Date(keyUTC(key) + n * 86400000);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  function dayNum(key) { return Math.round((keyUTC(key) - keyUTC(PO.daily.start)) / 86400000); }
  function weekday(key) { return new Date(keyUTC(key)).getUTCDay(); }

  function dailyEntry(key) {
    const n = Math.max(0, dayNum(key));
    const days = PO.daily.days;
    const row = days[n % days.length]; // [frø, nivå, par, perle]
    const lv = GEN.fromPool([row[0], row[2], row[3]], row[1], { noCurrent: true });
    lv.id = 'D' + (n + 1);
    return { lv, mode: 'daily', tier: row[1], day: key, num: n + 1, wi: 0, idx: -1 };
  }
  function dailyStreak() {
    let k = todayKey();
    if (!save.daily[k]) k = keyAdd(k, -1);
    let n = 0;
    while (save.daily[k]) { n++; k = keyAdd(k, -1); }
    return n;
  }

  // Lagrer resultatet i Rask runde / Dagens dam og lager data til resultatkortet.
  function recordMode(e, taps, stars, pearl) {
    if (e.mode === 'quick') {
      const q = save.quick[e.tier];
      const firstPearl = pearl && !e.pearl;
      if (!e.done) { e.done = true; e.prevStreak = q.streak; q.i++; q.played++; }
      if (stars === 3 && e.stars < 3) { q.three++; q.streak = e.prevStreak + 1; q.best = Math.max(q.best, q.streak); }
      else if (e.stars < 3 && stars < 3) q.streak = 0;
      if (firstPearl) q.pearls++;
      e.stars = Math.max(e.stars, stars); e.pearl = e.pearl || pearl;
      persist();
      return { stars, pearl, taps, rec: { pearl: e.pearl }, firstPearl, newBest: false, starsBefore: totalStars() };
    }
    const prev = save.daily[e.day];
    const r = save.daily[e.day] = prev ? Object.assign({}, prev) : { best: taps, stars: 0, pearl: false, n: e.num };
    r.best = Math.min(r.best, taps);
    r.stars = Math.max(r.stars, stars);
    r.pearl = !!(r.pearl || pearl);
    persist();
    return { stars, pearl, taps, rec: r, firstPearl: pearl && !(prev && prev.pearl), newBest: !!prev && taps < prev.best, starsBefore: totalStars() };
  }

  function startDaily(key) {
    $('daily').hidden = true;
    transition(() => startLevel(dailyEntry(key)));
  }

  // Tilbake til tittelskjermen med riktig kort åpent.
  function leaveMode() {
    const mode = G.entry.mode;
    transition(() => { toTitle(); if (mode === 'quick') openQuick(); else openDaily(); });
  }

  function starText(n, pearl) { return '★'.repeat(n) + '☆'.repeat(3 - n) + (pearl ? ' ◉' : ''); }

  function shareDaily(key) {
    const r = save.daily[key];
    if (!r) return;
    const txt = t('shareText', { n: dailyEntry(key).num, used: I.ripples(r.best), stars: starText(r.stars, r.pearl) });
    const copy = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(() => toast(t('copied')), () => toast(txt));
      } else toast(txt);
    };
    if (navigator.share) navigator.share({ text: txt }).catch((err) => { if (!err || err.name !== 'AbortError') copy(); });
    else copy();
  }

  function openDaily() { renderDaily(); $('daily').hidden = false; }
  function renderDaily() {
    const key = todayKey(), e = dailyEntry(key), r = save.daily[key];
    $('dailyTitle').textContent = t('daily');
    $('dailySub').textContent = '#' + e.num + ' · ' + t('wd' + weekday(key)) + ' · ' + t('tier_' + e.tier);
    // kalender: fire uker, mandag først, denne uka nederst
    const first = keyAdd(key, -((weekday(key) + 6) % 7) - 21);
    let h = t('wdShort').split(',').map((d) => `<b>${d}</b>`).join('');
    for (let i = 0; i < 28; i++) {
      const k = keyAdd(first, i), d = save.daily[k];
      const cls = ['cal-day'];
      if (keyUTC(k) > keyUTC(key)) cls.push('future');
      else if (dayNum(k) < 0) cls.push('before');
      if (k === key) cls.push('today');
      if (d) cls.push('done', 's' + d.stars);
      h += `<span class="${cls.join(' ')}">${+k.slice(8)}${d && d.pearl ? '<i class="pearl"></i>' : ''}</span>`;
    }
    $('dailyCal').innerHTML = h;
    const st = dailyStreak();
    $('dailyStreak').textContent = st === 0 ? t('streakNone') : st === 1 ? t('streakDay1') : t('streakDays', { n: st });
    $('dailyResult').hidden = !r;
    if (r) $('dailyResult').textContent = t('dailyDone', { used: I.ripples(r.best), stars: starText(r.stars, r.pearl) });
    $('btnDailyShare').hidden = !r;
    $('btnDailyShareTxt').textContent = t('share');
    $('btnDailyPlayTxt').textContent = r ? t('dailyAgain') : t('dailyPlay');
  }

  function openQuick() { renderQuick(); $('quick').hidden = false; }
  function renderQuick() {
    $('quickTitle').textContent = t('quick');
    $('quickSub').textContent = t('quickSub');
    const box = $('quickTiers');
    box.innerHTML = '';
    TIERS.forEach((tr, ti) => {
      const q = save.quick[tr], ok = tierOpen(tr);
      const b = document.createElement('button');
      b.className = 'tier-btn' + (ok ? '' : ' locked');
      const dots = [0, 1, 2].map((k) => `<i class="${k <= ti ? '' : 'off'}"></i>`).join('');
      const sub = !ok ? t('quickNeed', { id: TIER_NEED[tr] })
        : q.played ? t('quickStats', { n: q.played, s: q.streak, b: q.best }) : t('quickNew');
      b.innerHTML = `<span class="tier-dots">${dots}</span><span class="tier-text"><b>${t('tier_' + tr)}</b><span>${sub}</span></span>`;
      b.addEventListener('click', () => {
        S.click();
        if (!ok) { toast(sub); return; }
        $('quick').hidden = true;
        transition(() => startLevel(quickEntry(tr)));
      });
      box.appendChild(b);
    });
  }

  /* ---------- hint (regnes ut fra situasjonen akkurat nå) ---------- */
  function requestHint() {
    if (!G.world || G.completed || G.screen !== 'play' || G.hintBusy) return;
    S.unlock(); S.click();
    if (!E.isSettled(G.world)) { toast(t('hintWait')); return; }
    if (!G.hintUsed) { G.hintUsed = true; toast(t('hintUsed')); }
    G.hintBusy = true;
    $('btnHint').classList.add('busy');
    const token = ++G.hintToken;
    findHint(G.world, token, (pt) => {
      if (token !== G.hintToken) return;
      G.hintBusy = false;
      $('btnHint').classList.remove('busy');
      if (!pt) { toast(t('hintNone')); return; }
      G.hint = pt;
      hideTip();
    });
  }

  function hintScore(w) {
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

  // Som Engine.isSettled, men godtar krusninger som allerede har passert alt.
  function calmEnough(w) {
    for (const b of w.bodies) {
      if (b.dock >= 0) continue;
      if (b.sink > 0 || b.pushes.length) return false;
      if (b.vx * b.vx + b.vy * b.vy > C.SETTLE_V * C.SETTLE_V) return false;
      for (const rp of w.ripples) if (rp.r < C.RIPPLE_RANGE && rp.hit.indexOf(b.id) < 0) return false;
    }
    return true;
  }

  function findHint(world, token, cb) {
    const base = E.clone(world);
    const movers = base.bodies.filter((b) => b.dock < 0);
    const reach = C.RIPPLE_RANGE - 12;
    // bare trykk som faktisk når noe, i blandet rekkefølge (så vi kan stoppe tidlig)
    const pts = [];
    for (let y = 6; y < C.H; y += 11) {
      for (let x = 5; x < C.W; x += 11) {
        if (!E.insidePond(x, y, 8)) continue;
        if (movers.some((b) => Math.hypot(b.x - x, b.y - y) < reach)) pts.push([x, y]);
      }
    }
    const rnd = seeded('hint' + base.taps);
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const tmp = pts[i]; pts[i] = pts[j]; pts[j] = tmp; }
    const res = [];
    let i = 0, wins = 0;
    const now = hintScore(base);
    (function chunk() {
      if (token !== G.hintToken) return;
      const t0 = performance.now();
      while (i < pts.length && performance.now() - t0 < 11) {
        const [x, y] = pts[i++];
        const w = E.clone(base);
        E.tap(w, x, y);
        let done = false;
        for (let s = 0; s < 760; s++) {
          E.step(w); w.events.length = 0;
          if (w.done) { done = true; break; }
          if ((s & 7) === 7 && calmEnough(w)) break;
        }
        if (done) wins++;
        res.push({ x, y, done, score: done ? 1e9 : hintScore(w) });
      }
      if (i < pts.length && wins < 40) { requestAnimationFrame(chunk); return; }
      const winList = res.filter((r) => r.done);
      if (winList.length) {
        let best = null, bn = -1;
        for (const p of winList) {
          let n = 0;
          for (const q of winList) if (Math.abs(p.x - q.x) <= 11 && Math.abs(p.y - q.y) <= 11) n++;
          if (n > bn) { bn = n; best = p; }
        }
        cb({ x: best.x, y: best.y });
        return;
      }
      let best = null;
      for (const r of res) if (!best || r.score > best.score) best = r;
      cb(best && best.score > now + 8 ? { x: best.x, y: best.y } : null);
    })();
  }

  /* ---------- innstillinger ---------- */
  function openSettings() {
    S.unlock(); S.click();
    $('resetConfirm').hidden = true;
    $('setReset').hidden = false;
    paintSettings();
    $('settings').hidden = false;
  }
  function paintSettings() {
    $('setSfx').setAttribute('aria-checked', String(save.sfx));
    $('setMusic').setAttribute('aria-checked', String(save.music));
    for (const b of $('setLang').children) b.classList.toggle('on', b.dataset.lang === save.lang);
  }

  /* ---------- tekster ---------- */
  function applyTexts() {
    document.documentElement.lang = save.lang === 'en' ? 'en' : 'no';
    const logo = $('logo');
    logo.innerHTML = 'Krusning'.split('').map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('');
    $('tagline').textContent = t('tagline');
    $('btnPlay').textContent = anyProgress() ? t('continueAt', { id: nextToPlay().lv.id }) : t('play');
    $('btnLevelsTxt').textContent = t('levels');
    $('btnDailyTxt').textContent = t('daily');
    $('btnQuickTxt').textContent = t('quick');
    $('dailyDot').hidden = !!save.daily[todayKey()];
    $('dailyClose').setAttribute('aria-label', t('close'));
    $('quickClose').setAttribute('aria-label', t('close'));
    $('soundTip').textContent = t('soundTip');
    $('setTitle').textContent = t('settings');
    $('setSfxLbl').textContent = t('sound');
    $('setMusicLbl').textContent = t('music');
    $('setLangLbl').textContent = t('language');
    $('setReset').textContent = t('reset');
    $('resetAsk').textContent = t('resetAsk');
    $('resetYes').textContent = t('resetYes');
    $('resetNo').textContent = t('cancel');
    $('credits').textContent = t('credits');
    $('btnHint').setAttribute('aria-label', t('hint'));
    $('btnRestart').setAttribute('aria-label', t('restart'));
    $('btnSettings').setAttribute('aria-label', t('settings'));
    $('mapBack').setAttribute('aria-label', t('back'));
    $('setClose').setAttribute('aria-label', t('close'));
  }

  /* ---------- knapper ---------- */
  $('btnPlay').addEventListener('click', () => {
    S.unlock(); S.click();
    transition(() => startLevel(anyProgress() ? nextToPlay() : ALL[0]));
  });
  $('btnLevels').addEventListener('click', () => { S.unlock(); S.click(); openMap(); });
  $('btnLevels2').addEventListener('click', () => { S.click(); if (G.entry && G.entry.mode) leaveMode(); else openMap(G.entry ? G.entry.wi : 0); });
  $('btnSettings').addEventListener('click', openSettings);
  $('btnRestart').addEventListener('click', restart);
  $('btnHint').addEventListener('click', requestHint);
  $('btnRetry').addEventListener('click', () => { $('win').hidden = true; restart(); });
  $('btnNext').addEventListener('click', goNext);
  $('btnWinMap').addEventListener('click', () => { S.click(); if (G.entry && G.entry.mode) leaveMode(); else transition(() => openMap(G.entry ? G.entry.wi : 0)); });
  $('btnDaily').addEventListener('click', () => { S.unlock(); S.click(); openDaily(); });
  $('btnQuick').addEventListener('click', () => { S.unlock(); S.click(); openQuick(); });
  $('dailyClose').addEventListener('click', () => { S.click(); $('daily').hidden = true; });
  $('quickClose').addEventListener('click', () => { S.click(); $('quick').hidden = true; });
  $('daily').addEventListener('click', (e) => { if (e.target === $('daily')) $('daily').hidden = true; });
  $('quick').addEventListener('click', (e) => { if (e.target === $('quick')) $('quick').hidden = true; });
  $('btnDailyPlay').addEventListener('click', () => { S.click(); startDaily(todayKey()); });
  $('btnDailyShare').addEventListener('click', () => { S.click(); shareDaily(todayKey()); });
  $('mapBack').addEventListener('click', () => { S.click(); toTitle(); });
  $('worldPrev').addEventListener('click', () => { S.click(); G.mapWorld = Math.max(0, G.mapWorld - 1); renderMap(); });
  $('worldNext').addEventListener('click', () => { S.click(); G.mapWorld = Math.min(LV.WORLDS.length - 1, G.mapWorld + 1); renderMap(); });
  $('setClose').addEventListener('click', () => { S.click(); $('settings').hidden = true; });
  $('settings').addEventListener('click', (e) => { if (e.target === $('settings')) $('settings').hidden = true; });
  $('setSfx').addEventListener('click', () => { save.sfx = !save.sfx; S.setSfx(save.sfx); persist(); paintSettings(); S.click(); });
  $('setMusic').addEventListener('click', () => { save.music = !save.music; S.setMusic(save.music); persist(); paintSettings(); S.click(); });
  for (const b of $('setLang').children) {
    b.addEventListener('click', () => {
      save.lang = b.dataset.lang; I.lang = save.lang; persist();
      applyTexts(); paintSettings(); updateHud();
      if (G.screen === 'map') renderMap();
      if (!$('daily').hidden) renderDaily();
      if (!$('quick').hidden) renderQuick();
      S.click();
    });
  }
  $('setReset').addEventListener('click', () => { $('resetConfirm').hidden = false; $('setReset').hidden = true; });
  $('resetNo').addEventListener('click', () => { $('resetConfirm').hidden = true; $('setReset').hidden = false; });
  $('resetYes').addEventListener('click', () => {
    save = Object.assign(defaults(), { lang: save.lang, sfx: save.sfx, music: save.music });
    persist();
    $('settings').hidden = true;
    toTitle();
  });
  document.addEventListener('keydown', (e) => {
    if (G.screen !== 'play') return;
    if (e.key === 'r' || e.key === 'R') restart();
    if (e.key === 'h' || e.key === 'H') requestHint();
  });

  /* ---------- skjermstørrelse ---------- */
  let resizeQueued = false;
  function onResize() {
    resizeQueued = false;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    G.rect = r;
    R.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1), 68, 10);
  }
  function queueResize() { if (!resizeQueued) { resizeQueued = true; requestAnimationFrame(onResize); } }
  window.addEventListener('resize', queueResize);
  window.addEventListener('orientationchange', queueResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', queueResize);
  document.addEventListener('visibilitychange', () => {
    if (!S.ctx) return;
    if (document.hidden) S.ctx.suspend(); else if (save.sfx || save.music) S.ctx.resume();
  });

  /* ---------- oppstart ---------- */
  function boot(data) {
    I.lang = save.lang || 'no';
    S.sfxOn = save.sfx; S.musicOn = save.music;
    R.init(canvas);
    onResize();
    G.titleWorld = E.createWorld(TITLE_LEVEL);
    toTitle();
    const d = data || {};
    if (d.screen === 'play' && d.level && byId(d.level) && levelOpen(byId(d.level))) startLevel(byId(d.level), true);
    else if (d.screen === 'map') openMap(d.map || 0);
    requestAnimationFrame((now) => { G.last = now; requestAnimationFrame(frame); });
  }

  // Når en ny versjon publiseres mens spillet er åpent, fortsetter vi der vi var.
  const hot = window.claude && window.claude.hot;
  try { if (hot && hot.snapshot) hot.snapshot(() => ({ screen: G.screen, level: G.entry && !G.entry.mode && G.entry.lv.id, map: G.mapWorld })); } catch (e) { /* ok */ }
  if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});

  // til testing i nettleserkonsollen
  window.Krusning = {
    G, startLevel: (id) => startLevel(byId(id)), save: () => save, playerTap, openMap,
    startQuick: (tr) => startLevel(quickEntry(tr)), startDaily: (key) => startLevel(dailyEntry(key || todayKey())),
    openDaily, openQuick, todayKey,
  };
})();
