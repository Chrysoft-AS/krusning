/* =====================================================================
 * Krusning – tegning (Canvas 2D)
 * ---------------------------------------------------------------------
 * Alt som tegnes på skjermen, i lag nedenfra og opp:
 *   bakgrunn (gress, sand, vann)  →  lysmønster i vannet  →  fisk
 *   → strøm og virvler → havner → skygger → krusninger → kjølvann
 *   → steiner, stokker, vannliljer → båter → partikler → siktehjelp
 *
 * Alle mål er i "dam-enheter" (360 × 600). Fargene står i PAL.
 * ===================================================================== */
(function (root) {
  'use strict';
  const E = root.Engine;
  const C = E.C;
  const TAU = Math.PI * 2;

  const PAL = {
    grassA: '#a9d672', grassB: '#7fb850',
    blade: ['rgba(70,120,40,0.35)', 'rgba(190,230,130,0.45)', 'rgba(95,150,55,0.4)'],
    sand: '#f1dca6', sandEdge: '#dcc285',
    waterTop: '#5cc6d0', waterMid: '#3aa9c2', waterBot: '#2b8bb0',
    deep: 'rgba(16,70,110,0.20)',
    shallow: 'rgba(205,250,240,1)',
    foam: 'rgba(255,255,255,0.55)',
    shadow: 'rgba(10,50,75,0.22)',
    rock: '#9ba5ae', rockLight: '#d2d8dd', rockDark: '#6f7984',
    log: '#946541', logLight: '#c38e5e', logEnd: '#e7c796', logRing: '#a8774a',
    pad: '#6dc05b', padDark: '#4f9e44', padLight: '#9adf84',
    flower: '#ff9fc8', flowerLight: '#ffd3e6', flowerC: '#ffe27a',
    dock: '#ffe08a', dockDeep: '#f4b73f',
    eye: '#1b2a33',
    boats: [
      ['#ff8f7e', '#e86d5d', '#ffd0c7'],
      ['#ffd166', '#e7b23f', '#fff0c2'],
      ['#7fe0b5', '#56c293', '#d3f7e7'],
      ['#7cc4ff', '#559fe0', '#d5ecff'],
      ['#c4a1ff', '#a17ce8', '#ece0ff'],
      ['#ffb38a', '#ec8f62', '#ffe2d1'],
    ],
  };

  // Forutsigbar "tilfeldighet" så pynten ser lik ut hver gang.
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  }

  const R = {
    PAL,
    canvas: null, ctx: null,
    cssW: 0, cssH: 0, dpr: 1,
    s: 1, ox: 0, oy: 0,
    bg: null, caustic: null, causticPat: null,
    rockShapes: new Map(),
  };

  R.init = function (canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d');
    R.caustic = makeCaustics(96, 10, 7);
  };

  // Plasser dammen midt i det ledige området (mellom toppmeny og bunn).
  R.resize = function (cssW, cssH, dpr, top, bottom) {
    R.cssW = cssW; R.cssH = cssH; R.dpr = dpr;
    R.canvas.width = Math.round(cssW * dpr);
    R.canvas.height = Math.round(cssH * dpr);
    const margin = 14;
    const availH = cssH - top - bottom;
    R.s = Math.min(cssW / (C.W + margin * 2), availH / (C.H + margin * 2));
    R.ox = (cssW - C.W * R.s) / 2;
    R.oy = top + (availH - C.H * R.s) / 2;
    R.causticPat = R.ctx.createPattern(R.caustic, 'repeat');
    R.bg = renderBackground();
  };

  R.toWorld = function (cx, cy) { return { x: (cx - R.ox) / R.s, y: (cy - R.oy) / R.s }; };
  R.toScreen = function (x, y) { return { x: R.ox + x * R.s, y: R.oy + y * R.s }; };

  function worldTransform(ctx) {
    const k = R.dpr * R.s;
    ctx.setTransform(k, 0, 0, k, R.dpr * R.ox, R.dpr * R.oy);
  }

  function pondPath(ctx, inset) {
    const i = inset || 0;
    const r = Math.max(2, C.CORNER - i);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(i, i, C.W - i * 2, C.H - i * 2, r);
    else {
      const x = i, y = i, w = C.W - i * 2, h = C.H - i * 2;
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
  }

  /* ---------- bakgrunn (tegnes én gang per skjermstørrelse) ---------- */

  function renderBackground() {
    const cv = document.createElement('canvas');
    cv.width = R.canvas.width; cv.height = R.canvas.height;
    const ctx = cv.getContext('2d');
    const k = R.dpr * R.s;
    // synlig område i dam-enheter
    const vx0 = -R.ox / R.s, vy0 = -R.oy / R.s;
    const vx1 = (R.cssW - R.ox) / R.s, vy1 = (R.cssH - R.oy) / R.s;
    worldTransform(ctx);

    // gress
    const g = ctx.createLinearGradient(0, vy0, 0, vy1);
    g.addColorStop(0, PAL.grassA); g.addColorStop(1, PAL.grassB);
    ctx.fillStyle = g;
    ctx.fillRect(vx0 - 2, vy0 - 2, vx1 - vx0 + 4, vy1 - vy0 + 4);
    const rnd = rng(7);
    const area = (vx1 - vx0) * (vy1 - vy0);
    const blades = Math.min(2600, Math.round(area / 55));
    ctx.lineCap = 'round';
    for (let i = 0; i < blades; i++) {
      const x = vx0 + rnd() * (vx1 - vx0), y = vy0 + rnd() * (vy1 - vy0);
      if (E.insidePond(x, y, -12)) continue;
      ctx.strokeStyle = PAL.blade[i % 3];
      ctx.lineWidth = 1.1;
      const h = 3 + rnd() * 4, lean = (rnd() - 0.5) * 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + lean, y - h); ctx.stroke();
    }
    // små blomster i gresset
    for (let i = 0; i < 60; i++) {
      const x = vx0 + rnd() * (vx1 - vx0), y = vy0 + rnd() * (vy1 - vy0);
      if (E.insidePond(x, y, -22)) continue;
      const col = i % 3 === 0 ? '#fff6e0' : i % 3 === 1 ? '#ffd1e3' : '#fff2a6';
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * TAU;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * 1.7, y + Math.sin(a) * 1.7, 1.25, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#f5b83d'; ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill();
    }

    // sandkant (litt ujevn ytterkant)
    ctx.fillStyle = PAL.sandEdge;
    wobblyRim(ctx, 11, 2.2, 3);
    ctx.fill();
    ctx.fillStyle = PAL.sand;
    wobblyRim(ctx, 8.5, 1.6, 5);
    ctx.fill();
    // småstein i sanden
    for (let i = 0; i < 90; i++) {
      const t = rnd();
      const p = rimPoint(t, 4 + rnd() * 4);
      ctx.fillStyle = i % 2 ? 'rgba(150,130,90,0.35)' : 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 0.6 + rnd() * 1.1, 0, TAU); ctx.fill();
    }

    // vann
    const wg = ctx.createLinearGradient(0, 0, 0, C.H);
    wg.addColorStop(0, PAL.waterTop); wg.addColorStop(0.5, PAL.waterMid); wg.addColorStop(1, PAL.waterBot);
    pondPath(ctx, 0);
    ctx.fillStyle = wg; ctx.fill();
    ctx.save();
    pondPath(ctx, 0); ctx.clip();
    const rg = ctx.createRadialGradient(C.W / 2, C.H * 0.55, 30, C.W / 2, C.H * 0.55, C.H * 0.6);
    rg.addColorStop(0, PAL.deep); rg.addColorStop(1, 'rgba(16,70,110,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, C.W, C.H);
    // grunt vann langs kanten (myk overgang)
    for (let i = 7; i >= 0; i--) {
      ctx.globalAlpha = 0.07;
      ctx.strokeStyle = PAL.shallow;
      ctx.lineWidth = 4 + i * 5;
      pondPath(ctx, 0); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // skumlinje
    ctx.strokeStyle = PAL.foam; ctx.lineWidth = 1.6;
    pondPath(ctx, 0.8); ctx.stroke();

    // siv og steiner rundt dammen
    const reeds = rng(11);
    for (let i = 0; i < 16; i++) {
      const p = rimPoint(reeds(), 13 + reeds() * 5);
      if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue;
      drawReeds(ctx, p.x, p.y, reeds);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    void k;
    return cv;
  }

  function rimPoint(t, out) {
    // punkt langs dammens kant (t: 0..1), forskjøvet "out" utover
    const W = C.W, H = C.H, Rr = C.CORNER;
    const straightW = W - 2 * Rr, straightH = H - 2 * Rr, arc = (Math.PI / 2) * Rr;
    const total = 2 * straightW + 2 * straightH + 4 * arc;
    let d = t * total;
    const segs = [
      [straightW, (u) => ({ x: Rr + u, y: 0, nx: 0, ny: -1 })],
      [arc, (u) => { const a = -Math.PI / 2 + u / Rr; return { x: W - Rr + Math.cos(a) * Rr, y: Rr + Math.sin(a) * Rr, nx: Math.cos(a), ny: Math.sin(a) }; }],
      [straightH, (u) => ({ x: W, y: Rr + u, nx: 1, ny: 0 })],
      [arc, (u) => { const a = u / Rr; return { x: W - Rr + Math.cos(a) * Rr, y: H - Rr + Math.sin(a) * Rr, nx: Math.cos(a), ny: Math.sin(a) }; }],
      [straightW, (u) => ({ x: W - Rr - u, y: H, nx: 0, ny: 1 })],
      [arc, (u) => { const a = Math.PI / 2 + u / Rr; return { x: Rr + Math.cos(a) * Rr, y: H - Rr + Math.sin(a) * Rr, nx: Math.cos(a), ny: Math.sin(a) }; }],
      [straightH, (u) => ({ x: 0, y: H - Rr - u, nx: -1, ny: 0 })],
      [arc, (u) => { const a = Math.PI + u / Rr; return { x: Rr + Math.cos(a) * Rr, y: Rr + Math.sin(a) * Rr, nx: Math.cos(a), ny: Math.sin(a) }; }],
    ];
    for (const [len, f] of segs) {
      if (d <= len) { const p = f(d); return { x: p.x + p.nx * out, y: p.y + p.ny * out, nx: p.nx, ny: p.ny }; }
      d -= len;
    }
    return { x: 0, y: 0, nx: 0, ny: -1 };
  }

  function wobblyRim(ctx, out, amp, seed) {
    const n = 140;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const wob = amp * (Math.sin(t * TAU * 9 + seed) * 0.6 + Math.sin(t * TAU * 23 + seed * 2) * 0.4);
      const p = rimPoint(t, out + wob);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }

  function drawReeds(ctx, x, y, rnd) {
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const bx = x + (rnd() - 0.5) * 8, by = y + (rnd() - 0.5) * 4;
      const h = 12 + rnd() * 10, lean = (rnd() - 0.5) * 6;
      ctx.strokeStyle = i % 2 ? '#5f9a3c' : '#4f8a33';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + lean * 0.3, by - h * 0.6, bx + lean, by - h); ctx.stroke();
      if (i % 2 === 0) {
        ctx.fillStyle = '#8a5a35';
        ctx.beginPath(); ctx.ellipse(bx + lean * 0.9, by - h + 1, 1.6, 4, lean * 0.05, 0, TAU); ctx.fill();
      }
    }
  }

  // Lysmønster (som sol gjennom vann): Worley-støy som fliser sømløst.
  function makeCaustics(size, points, seed) {
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const rnd = rng(seed);
    const pts = [];
    for (let i = 0; i < points; i++) pts.push([rnd() * size, rnd() * size]);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let f1 = 1e9, f2 = 1e9;
        for (const [px, py] of pts) {
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const dx = x - (px + ox * size), dy = y - (py + oy * size);
            const d = dx * dx + dy * dy;
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
          }
        }
        const edge = Math.sqrt(f2) - Math.sqrt(f1);
        const v = Math.max(0, 1 - edge / 6.5);
        const a = Math.pow(v, 1.7);
        const i = (y * size + x) * 4;
        img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /* ---------- hovedtegning ---------- */

  R.draw = function (st) {
    const ctx = R.ctx;
    const t = st.time;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(R.bg, 0, 0);
    worldTransform(ctx);
    const w = st.world;

    // alt "i vannet" klippes til dammen
    ctx.save();
    pondPath(ctx, 0); ctx.clip();
    drawCaustics(ctx, t);
    if (st.fish) drawFish(ctx, st.fish, t);
    if (w) {
      drawCurrents(ctx, w, t);
      drawFalls(ctx, w, t);
      drawIce(ctx, w, t);
      drawWinds(ctx, w, t);
      for (const v of w.whirls) drawWhirl(ctx, v, t);
      for (const m of w.maels) drawMael(ctx, m, t);
      if (w.banks.length) drawBanksUnder(ctx, w, t);
      for (const c of w.cascades) drawCascadeWater(ctx, c, t);
      drawRainSpots(ctx, w, t);
      for (const d of w.docks) drawDockWater(ctx, d, t);
      drawShadows(ctx, w);
    }
    if (st.leaves) drawLeaves(ctx, st.leaves);
    if (w) drawRipples(ctx, w);
    if (w && w.timber.length) drawTimber(ctx, w, t);
    drawParticles(ctx, st.particles, 'under');
    ctx.restore();

    if (w) {
      if (w.banks.length) drawBanksUp(ctx, w, t);
      for (const r of w.rocks) drawRock(ctx, r, t);
      for (const l of w.logs) drawLog(ctx, l);
      if (w.walls.length || w.gates.length) {
        // moloer og porter går inn i sanden, men ikke ut på gresset
        ctx.save(); pondPath(ctx, -6); ctx.clip();
        for (const s of w.walls) drawWall(ctx, s);
        w.gates.forEach((g, i) => drawGate(ctx, g, i, w.t));
        ctx.restore();
      }
      for (const s of w.switches) drawSwitch(ctx, s, t);
      drawFrogLeaves(ctx, w, t);
      for (const p of w.pads) drawPad(ctx, p, t);
      for (let i = 0; i < w.docks.length; i++) drawDock(ctx, w.docks[i], t, st.dockFx && st.dockFx[i]);
      for (const L of (w.level.lamps || [])) drawLamp(ctx, L, t);
      for (const b of w.boats) drawBoat(ctx, b, t, st.boatFx && st.boatFx[b.id], st.look);
      for (const c of w.cascades) drawCascadeTop(ctx, c, t);
      for (const f of w.frogs) drawFrog(ctx, f, t, st.aim && E.previewFrogs(w, st.aim.x, st.aim.y).indexOf(f) >= 0);
      drawFallingDrops(ctx, w);
    }
    drawParticles(ctx, st.particles, 'over');
    if (w && w.tide) drawTideGauge(ctx, w, t);
    if (w) drawMood(ctx, w, t);
    if (w && w.dark) drawDark(ctx, w, st, t);
    if (st.hint) drawHint(ctx, st.hint, t, w);
    if (st.hint && !st.aim && w) drawArrows(ctx, w, st.hint.x, st.hint.y, 0.55);
    if (st.aim && w) drawAim(ctx, w, st.aim, t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  function drawCaustics(ctx, t) {
    if (!R.causticPat) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.085;
    ctx.fillStyle = R.causticPat;
    ctx.scale(2.1, 2.1);
    ctx.translate((t * 2.6) % 96, (t * 1.5) % 96);
    ctx.fillRect(-100, -100, C.W / 2.1 + 200, C.H / 2.1 + 200);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    worldTransform(ctx);
    ctx.globalAlpha = 0.05;
    ctx.scale(3.1, 3.1);
    ctx.translate(-(t * 1.4) % 96, (t * 2.1) % 96);
    ctx.fillRect(-100, -100, C.W / 3.1 + 200, C.H / 3.1 + 200);
    ctx.restore();
  }

  function drawFish(ctx, fish, t) {
    for (const f of fish) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      ctx.globalAlpha = 0.22 * (f.alpha == null ? 1 : f.alpha);
      ctx.fillStyle = '#0e4560';
      const L = f.size, wig = Math.sin(t * (6 + f.speed * 0.08) + f.phase) * 0.35;
      ctx.beginPath(); ctx.ellipse(0, 0, L, L * 0.36, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(-L * 0.9, 0); ctx.rotate(wig);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-L * 0.7, -L * 0.35); ctx.lineTo(-L * 0.7, L * 0.35); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(-L * 0.1, 0, L * 0.25, L * 0.62, 0.3, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawLeaves(ctx, leaves) {
    for (const l of leaves) {
      ctx.save();
      ctx.translate(l.x, l.y); ctx.rotate(l.angle);
      ctx.fillStyle = 'rgba(10,50,75,0.15)';
      leafPath(ctx, l.size, 1.5, 2); ctx.fill();
      ctx.fillStyle = l.color;
      leafPath(ctx, l.size, 0, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(-l.size, 0); ctx.lineTo(l.size, 0); ctx.stroke();
      ctx.restore();
    }
  }
  function leafPath(ctx, s, ox, oy) {
    ctx.beginPath();
    ctx.moveTo(-s + ox, oy);
    ctx.quadraticCurveTo(ox, -s * 0.75 + oy, s + ox, oy);
    ctx.quadraticCurveTo(ox, s * 0.75 + oy, -s + ox, oy);
  }

  // Strøm: myk lysere flate + små piler (›) som glir i strømretningen.
  function drawCurrents(ctx, w, t) {
    for (const c of w.currents) {
      ctx.save();
      ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip();
      ctx.fillStyle = 'rgba(215,250,255,0.055)';
      for (let k = 0; k < 3; k++) ctx.fillRect(c.x + k * 6, c.y + k * 6, c.w - k * 12, c.h - k * 12);
      const sp = Math.hypot(c.vx, c.vy) || 1;
      const ux = c.vx / sp, uy = c.vy / sp;
      // rutenett som går opp i flaten, så mønsteret kan "rulle" uten skjøter
      const nx = Math.max(1, Math.round(c.w / 28)), ny = Math.max(1, Math.round(c.h / 28));
      const gx = c.w / nx, gy = c.h / ny, d = t * sp * 0.85, s = 5.5;
      const stagger = ny % 2 === 0;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.1;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          let x = c.x + (i + 0.5 + (stagger && j % 2 ? 0.5 : 0)) * gx + ux * d;
          let y = c.y + (j + 0.5) * gy + uy * d;
          x = c.x + ((((x - c.x) % c.w) + c.w) % c.w);
          y = c.y + ((((y - c.y) % c.h) + c.h) % c.h);
          const edge = Math.min(x - c.x, c.x + c.w - x, y - c.y, c.y + c.h - y);
          const a = Math.max(0, Math.min(1, (edge - 3) / 14)) * 0.5;
          if (a <= 0.02) continue;
          ctx.strokeStyle = `rgba(255,255,255,${a})`;
          ctx.beginPath();
          ctx.moveTo(x - ux * s - uy * s, y - uy * s + ux * s);
          ctx.lineTo(x, y);
          ctx.lineTo(x - ux * s + uy * s, y - uy * s - ux * s);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function drawWhirl(ctx, v, t) {
    const g = ctx.createRadialGradient(v.x, v.y, 2, v.x, v.y, v.r);
    g.addColorStop(0, 'rgba(8,40,70,0.55)');
    g.addColorStop(0.35, 'rgba(12,60,95,0.28)');
    g.addColorStop(1, 'rgba(20,80,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(v.x, v.y, v.r, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(t * 1.6 * v.power * v.dir);
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 4; arm++) {
      ctx.rotate(TAU / 4);
      ctx.beginPath();
      for (let i = 0; i <= 28; i++) {
        const u = i / 28;
        const rr = v.r * (0.95 - u * 0.85);
        const a = u * 3.2 * v.dir;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDockWater(ctx, d, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    const g = ctx.createRadialGradient(d.x, d.y, 2, d.x, d.y, d.r + 14);
    const a = d.boat >= 0 ? 0.55 : 0.28 + pulse * 0.12;
    g.addColorStop(0, `rgba(255,236,170,${a})`);
    g.addColorStop(0.6, `rgba(255,226,140,${a * 0.5})`);
    g.addColorStop(1, 'rgba(255,226,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r + 14, 0, TAU); ctx.fill();
  }

  function drawShadows(ctx, w) {
    ctx.fillStyle = PAL.shadow;
    for (const r of w.rocks) { ctx.save(); ctx.translate(3, 5); rockPath(ctx, r); ctx.fill(); ctx.restore(); }
    for (const l of w.logs) {
      ctx.strokeStyle = PAL.shadow; ctx.lineCap = 'round'; ctx.lineWidth = l.r * 2;
      ctx.beginPath(); ctx.moveTo(l.x1 + 3, l.y1 + 5); ctx.lineTo(l.x2 + 3, l.y2 + 5); ctx.stroke();
    }
    for (const s of w.walls.concat(w.gates.filter((g) => !g.open))) {
      ctx.strokeStyle = PAL.shadow; ctx.lineCap = 'round'; ctx.lineWidth = s.r * 2;
      ctx.beginPath(); ctx.moveTo(s.x1 + 3, s.y1 + 5); ctx.lineTo(s.x2 + 3, s.y2 + 5); ctx.stroke();
    }
    for (const p of w.pads) { ctx.beginPath(); ctx.arc(p.x + 2, p.y + 3, p.r, 0, TAU); ctx.fill(); }
    for (const b of w.boats) {
      if (b.sink > 0) continue;
      ctx.save(); ctx.translate(b.x + 3, b.y + 5); ctx.rotate(b.angle);
      hullPath(ctx); ctx.fill(); ctx.restore();
    }
  }

  // Halvplanet på én side av en foss (brukes til å farge og klippe).
  function halfPlane(ctx, f, below) {
    const dx = f.x2 - f.x1, dy = f.y2 - f.y1, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L * 3000, uy = dy / L * 3000;
    const k = below ? 3000 : -3000;
    ctx.moveTo(f.x1 - ux, f.y1 - uy);
    ctx.lineTo(f.x1 + ux, f.y1 + uy);
    ctx.lineTo(f.x1 + ux + f.nx * k, f.y1 + uy + f.ny * k);
    ctx.lineTo(f.x1 - ux + f.nx * k, f.y1 - uy + f.ny * k);
    ctx.closePath();
  }

  // Foss nedover: dypere (mørkere) vann nedenfor, skum og striper langs kanten.
  function drawFalls(ctx, w, t) {
    for (const f of w.falls) {
      ctx.fillStyle = 'rgba(8,48,88,0.16)';
      ctx.beginPath(); halfPlane(ctx, f, true); ctx.fill();
      const dx = f.x2 - f.x1, dy = f.y2 - f.y1, L = Math.hypot(dx, dy) || 1;
      const ux = dx / L, uy = dy / L;
      // skygge under kanten
      const g = ctx.createLinearGradient(f.x1, f.y1, f.x1 + f.nx * 26, f.y1 + f.ny * 26);
      g.addColorStop(0, 'rgba(6,40,70,0.28)'); g.addColorStop(1, 'rgba(6,40,70,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(f.x1 - ux * 40, f.y1 - uy * 40); ctx.lineTo(f.x2 + ux * 40, f.y2 + uy * 40);
      ctx.lineTo(f.x2 + ux * 40 + f.nx * 26, f.y2 + uy * 40 + f.ny * 26); ctx.lineTo(f.x1 - ux * 40 + f.nx * 26, f.y1 - uy * 40 + f.ny * 26);
      ctx.closePath(); ctx.fill();
      // vann som renner over kanten (striper som glir nedover)
      ctx.lineCap = 'round';
      const n = Math.ceil(L / 9) + 8;
      for (let i = -4; i < n; i++) {
        const along = i * 9 + ((i * 37) % 5);
        const ph = ((t * 1.4 + (i * 0.37) % 1) % 1);
        const len = 6 + ((i * 53) % 9);
        const d0 = ph * 18, a = 0.5 * (1 - ph);
        const x = f.x1 + ux * along, y = f.y1 + uy * along;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + f.nx * d0, y + f.ny * d0);
        ctx.lineTo(x + f.nx * (d0 + len), y + f.ny * (d0 + len));
        ctx.stroke();
      }
      // kanten: lys leppe og skum
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(f.x1 - ux * 40, f.y1 - uy * 40); ctx.lineTo(f.x2 + ux * 40, f.y2 + uy * 40); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(f.x1 - ux * 40 - f.nx * 5, f.y1 - uy * 40 - f.ny * 5); ctx.lineTo(f.x2 + ux * 40 - f.nx * 5, f.y2 + uy * 40 - f.ny * 5); ctx.stroke();
    }
  }

  // Foss ovenfra, i vannet: lyst skum og ringer som går utover.
  function drawCascadeWater(ctx, c, t) {
    const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, c.r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.4, 'rgba(225,250,255,0.25)');
    g.addColorStop(1, 'rgba(225,250,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill();
    for (let k = 0; k < 3; k++) {
      const u = (t * 0.9 + k / 3) % 1;
      const rr = C.CASCADE_CORE + u * (c.r - C.CASCADE_CORE);
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - u)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, TAU); ctx.stroke();
    }
  }
  // Foss ovenfra, over båtene: den fallende vannsøylen sett ovenfra.
  function drawCascadeTop(ctx, c, t) {
    ctx.save();
    ctx.translate(c.x, c.y);
    const R0 = C.CASCADE_CORE + 1;
    ctx.fillStyle = 'rgba(10,60,90,0.18)';
    ctx.beginPath(); ctx.arc(2, 3, R0, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, R0);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#e6fbff'); g.addColorStop(1, '#bfeef7');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * TAU;
      const rr = R0 + Math.sin(a * 5 + t * 9) * 1.4 + Math.sin(a * 3 - t * 7) * 1;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    // dråper som spruter ut
    for (let i = 0; i < 10; i++) {
      const u = (t * 1.7 + i * 0.13) % 1;
      const a = i * 2.39 + Math.floor(t * 1.7 + i * 0.13) * 1.3;
      const rr = R0 + u * 14;
      ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - u)})`;
      ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawRipples(ctx, w) {
    const falls = w.falls;
    const walls = w.walls.length || w.gates.some((g) => !g.open);
    ctx.lineCap = 'round';
    for (const rp of w.ripples) {
      const r = rp.r;
      if (r < 1) continue;
      // med fosser: ringen vises bare på sin egen vannhøyde
      let clipped = false;
      if (falls.length || walls) { ctx.save(); clipped = true; }
      for (const f of falls) {
        ctx.beginPath(); halfPlane(ctx, f, E.fallSide(f, rp.x, rp.y) > 0); ctx.clip();
      }
      if (walls) clipWallShadows(ctx, w, rp.x, rp.y);
      drawRing(ctx, rp, r);
      if (clipped) ctx.restore();
    }
  }
  function drawRing(ctx, rp, r) {
    const range = rp.range || C.RIPPLE_RANGE, p = rp.p || 1;
    const life = 1 - r / (range + 24);
    const a = Math.max(0, E.falloff(r * 0.92, range)) * Math.min(1, life * 3) * (0.5 + 0.5 * Math.min(1, p));
    if (a <= 0.01) return;
    // mørk kant utenfor (gir dybde)
    ctx.strokeStyle = `rgba(10,60,90,${0.16 * a})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(rp.x, rp.y, r + 2.5, 0, TAU); ctx.stroke();
    // hovedringen
    ctx.strokeStyle = `rgba(255,255,255,${0.75 * a})`;
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(rp.x, rp.y, r, 0, TAU); ctx.stroke();
    // ringene bak
    for (let k = 1; k <= 2; k++) {
      const rr = r - k * 11;
      if (rr <= 2) break;
      ctx.strokeStyle = `rgba(255,255,255,${(0.38 / k) * a})`;
      ctx.lineWidth = 2 - k * 0.4;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rr, 0, TAU); ctx.stroke();
    }
  }

  /* ---------- verden 4–7: regn, molo, sluser, frosker, is, vind og natt ---------- */

  // Farger på brytere og sluseporter (samme farge og merke hører sammen).
  const GATE_COL = [['#ff86b6', '#d9588c'], ['#ae92ff', '#7f61e3'], ['#ffb15e', '#e0892c'], ['#62d6c8', '#33a99b']];

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

  // Is: lyse, frostete flak med sprekker og et glimt som glir over.
  function drawIce(ctx, w, t) {
    for (const r of w.ice) {
      ctx.save();
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.fillStyle = 'rgba(238,249,255,0.66)'; ctx.fill();
      ctx.clip();
      const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(0.5, 'rgba(190,225,250,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0.3)');
      ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
      const rnd = rng(Math.round(r.x * 7 + r.y * 13 + r.w * 3 + 1));
      ctx.strokeStyle = 'rgba(140,185,220,0.55)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
      const n = Math.round((r.w * r.h) / 2600) + 2;
      for (let i = 0; i < n; i++) {
        let x = r.x + rnd() * r.w, y = r.y + rnd() * r.h;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 3; k++) { x += (rnd() - 0.5) * 36; y += (rnd() - 0.5) * 36; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      const u = ((t * 0.16 + r.x * 0.003 + r.y * 0.002) % 1.8) - 0.4;
      const sx = r.x + u * (r.w + r.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 12;
      line(ctx, sx, r.y - 10, sx - r.h * 0.6, r.y + r.h + 10);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 12); ctx.stroke();
    }
  }

  // Vind: lyse striper som suser i vindretningen.
  function drawWinds(ctx, w, t) {
    for (const v of w.winds) {
      const sp = Math.hypot(v.ax, v.ay) || 1, ux = v.ax / sp, uy = v.ay / sp, px = -uy, py = ux;
      const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      const hp = Math.abs(px) * v.w / 2 + Math.abs(py) * v.h / 2;
      const ha = Math.abs(ux) * v.w / 2 + Math.abs(uy) * v.h / 2 + 30;
      ctx.save();
      ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(v.x, v.y, v.w, v.h);
      const rnd = rng(Math.round(v.x * 3 + v.y * 7 + v.w + 11));
      const n = Math.round((v.w * v.h) / 1300) + 5;
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const off = (rnd() * 2 - 1) * hp, ph = rnd(), spd = 0.75 + rnd() * 0.5, len = 18 + rnd() * 24;
        const along = (((t * (70 + sp * 0.8) * spd) / (2 * ha) + ph) % 1) * 2 * ha - ha;
        const x = cx + px * off + ux * along, y = cy + py * off + uy * along;
        const edge = Math.min(along + ha, ha - along);
        const a = Math.max(0, Math.min(1, edge / 40)) * 0.55;
        if (a <= 0.02) continue;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) {
          const s = -len + (k / 6) * len, wv = Math.sin(s * 0.18 + t * 6 + i) * 1.6;
          const xx = x + ux * s + px * wv, yy = y + uy * s + py * wv;
          if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Regn: der dråpen faller. Skyggen av en regnsky, og en stiplet ring
  // som viser hvor langt dråpen rekker.
  function drawRainSpots(ctx, w, t) {
    for (const d of w.rains) {
      const g = ctx.createRadialGradient(d.x, d.y, 4, d.x, d.y, d.range * 0.85);
      g.addColorStop(0, 'rgba(20,45,70,0.22)'); g.addColorStop(0.6, 'rgba(20,45,70,0.1)'); g.addColorStop(1, 'rgba(20,45,70,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.range * 0.85, 0, TAU); ctx.fill();
      ctx.save();
      ctx.setLineDash([3, 6]);
      ctx.lineDashOffset = -t * 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.34)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.range * 0.72, 0, TAU); ctx.stroke();
      ctx.restore();
      const left = E.nextDrop(w, d) * C.DT;
      const u = Math.max(0, 1 - left / 0.8);
      ctx.fillStyle = `rgba(10,50,80,${0.15 + 0.25 * u})`;
      ctx.beginPath(); ctx.arc(d.x, d.y, 3 + 5 * u, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(d.x, d.y, 7, 0, TAU); ctx.stroke();
    }
  }
  // Regn: dråpen på vei ned (tegnes over alt annet).
  function drawFallingDrops(ctx, w) {
    for (const d of w.rains) {
      const left = E.nextDrop(w, d) * C.DT;
      if (left > 0.8) continue;
      const u = 1 - left / 0.8, k = 1 - u;
      const x = d.x + k * 18, y = d.y - k * 110;
      const s = 3.6 + k * 3.5;
      ctx.save();
      ctx.globalAlpha = Math.min(1, u * 2.5);
      ctx.translate(x, y); ctx.rotate(-0.17);
      ctx.fillStyle = 'rgba(225,246,255,0.95)';
      ctx.strokeStyle = 'rgba(40,110,150,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -s * 2.2);
      ctx.quadraticCurveTo(s * 1.1, -s * 0.2, 0, s);
      ctx.quadraticCurveTo(-s * 1.1, -s * 0.2, 0, -s * 2.2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  // Tømmer i elva: stokkene flyter med strømmen, med skygge og litt skum
  // foran. (Klippes til dammen, så de kommer inn under kanten.)
  function drawTimber(ctx, w, t) {
    for (const tm of w.timber) {
      E.eachTimber(w, tm, (x1, y1, x2, y2, r, i) => {
        const bob = Math.sin(t * 2.1 + i * 1.7) * 0.7;
        ctx.strokeStyle = PAL.shadow; ctx.lineCap = 'round'; ctx.lineWidth = r * 2;
        ctx.beginPath(); ctx.moveTo(x1 + 3, y1 + 5); ctx.lineTo(x2 + 3, y2 + 5); ctx.stroke();
        // skum der stokken skyver vannet foran seg
        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        ctx.beginPath(); ctx.ellipse(x2 + tm.ux * 4, y2 + tm.uy * 4, r * 1.1, r * 1.5, Math.atan2(tm.uy, tm.ux), 0, TAU); ctx.fill();
        drawLog(ctx, { x1, y1: y1 + bob, x2, y2: y2 + bob, r }, i * 7 + 3);
      });
    }
  }

  // Malstrøm: mørk virvel med skumarmer som går rundt, og et hull i midten.
  function drawMael(ctx, m, t) {
    const g = ctx.createRadialGradient(m.x, m.y, 4, m.x, m.y, m.r);
    g.addColorStop(0, 'rgba(5,30,55,0.75)'); g.addColorStop(0.25, 'rgba(10,45,75,0.4)');
    g.addColorStop(0.7, 'rgba(20,70,100,0.14)'); g.addColorStop(1, 'rgba(20,70,100,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(t * 1.6 * m.dir);
    ctx.lineCap = 'round';
    for (let a = 0; a < 5; a++) {
      ctx.rotate(TAU / 5);
      ctx.strokeStyle = 'rgba(235,250,255,0.5)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const u = k / 24, rr = 14 + u * (m.r - 18), ang = -m.dir * u * 2.4;
        const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(3,18,35,0.85)';
    ctx.beginPath(); ctx.arc(m.x, m.y, C.MAEL_CORE, 0, TAU); ctx.fill();
  }

  // Sandbanker. Under vann: svak sandflekk (stiplet kant hvis den kommer
  // opp ved neste trykk). Over vann: tegnes som en sandøy.
  function bankShape(ctx, k, grow) {
    ctx.lineCap = 'round';
    ctx.lineWidth = (k.r + grow) * 2;
    ctx.beginPath(); ctx.moveTo(k.x1, k.y1); ctx.lineTo(k.x2 + 0.01, k.y2); ctx.stroke();
  }
  function tideFade(w) { return Math.min(1, Math.max(0, (w.t - w.tideT) / 0.6)); }
  function drawBanksUnder(ctx, w, t) {
    const f = tideFade(w);
    const nextUp = w.tide ? w.tide[(w.tideI + 1) % w.tide.length] : 2;
    for (const k of w.banks) {
      const up = E.bankUp(w, k);
      ctx.strokeStyle = `rgba(241,220,166,${up ? 0.25 : 0.22 + 0.2 * (1 - f) * 0})`;
      bankShape(ctx, k, 2);
      if (!up && nextUp < k.h) {
        ctx.save();
        ctx.setLineDash([5, 6]); ctx.lineDashOffset = -t * 10;
        ctx.strokeStyle = `rgba(255,248,220,${0.45 + 0.25 * Math.sin(t * 4)})`; ctx.lineWidth = 2;
        const dx = k.x2 - k.x1, dy = k.y2 - k.y1, L = Math.hypot(dx, dy);
        if (L < 1) { ctx.beginPath(); ctx.arc(k.x1, k.y1, k.r + 2, 0, TAU); ctx.stroke(); }
        else {
          const px = -dy / L * (k.r + 2), py = dx / L * (k.r + 2), a = Math.atan2(dy, dx);
          ctx.beginPath();
          ctx.moveTo(k.x1 + px, k.y1 + py); ctx.lineTo(k.x2 + px, k.y2 + py);
          ctx.arc(k.x2, k.y2, k.r + 2, a + Math.PI / 2, a - Math.PI / 2, true);
          ctx.lineTo(k.x1 - px, k.y1 - py);
          ctx.arc(k.x1, k.y1, k.r + 2, a - Math.PI / 2, a + Math.PI / 2, true);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
  function drawBanksUp(ctx, w, t) {
    const f = tideFade(w);
    for (const k of w.banks) {
      if (!E.bankUp(w, k)) continue;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.65 * f;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; bankShape(ctx, k, 3 + Math.sin(t * 2) * 0.8);
      ctx.strokeStyle = PAL.sandEdge; bankShape(ctx, k, 0);
      ctx.strokeStyle = PAL.sand; bankShape(ctx, k, -3);
      // noen småstein
      const rnd = rng(Math.round(k.x1 * 7 + k.y1 * 3));
      ctx.fillStyle = 'rgba(150,130,90,0.5)';
      for (let i = 0; i < 4; i++) {
        const u = rnd(), o = (rnd() - 0.5) * k.r;
        const dx = k.x2 - k.x1, dy = k.y2 - k.y1, L = Math.hypot(dx, dy) || 1;
        ctx.beginPath(); ctx.arc(k.x1 + dx * u - dy / L * o, k.y1 + dy * u + dx / L * o, 1.6 + rnd() * 1.4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }
  // Tidevannsstaken på venstre side: viser vannstanden nå (fylt) og ved
  // neste trykk (ring).
  // Tidevannsstang øverst til venstre i vannet: fylt prikk = vannet nå,
  // ring = hvor vannet står etter neste trykk.
  function drawTideGauge(ctx, w, t) {
    const x = 18, y0 = 26, h = 50;
    const lv = E.tideLevel(w), nx = w.tide[(w.tideI + 1) % w.tide.length];
    ctx.fillStyle = 'rgba(10,50,70,0.18)';
    ctx.beginPath(); ctx.ellipse(x + 2, y0 + h + 8, 9, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(126,88,52,0.95)';
    ctx.fillRect(x - 2.5, y0 - 8, 5, h + 16);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x - 2.5, y0 - 8, 1.5, h + 16);
    for (let i = 0; i <= 2; i++) {
      const y = y0 + h - (i / 2) * h;
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(x - 6, y - 1, 12, 2);
    }
    const f = tideFade(w);
    const ny = y0 + h - (nx / 2) * h;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, ny, 5, 0, TAU); ctx.stroke();
    const cy = y0 + h - (lv / 2) * h;
    ctx.fillStyle = `rgba(80,190,240,${0.6 + 0.4 * f})`;
    ctx.beginPath(); ctx.arc(x, cy, 4.5, 0, TAU); ctx.fill();
  }

  // Molo: en mur av steinblokker.
  function drawWall(ctx, s) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, px = -uy, py = ux;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = s.r * 2 + 5; line(ctx, s.x1, s.y1, s.x2, s.y2);
    ctx.strokeStyle = PAL.rockDark; ctx.lineWidth = s.r * 2 + 1; line(ctx, s.x1, s.y1 + 1.5, s.x2, s.y2 + 1.5);
    ctx.strokeStyle = PAL.rock; ctx.lineWidth = s.r * 2; line(ctx, s.x1, s.y1, s.x2, s.y2);
    ctx.strokeStyle = PAL.rockLight; ctx.lineWidth = s.r * 0.7;
    line(ctx, s.x1 - px * s.r * 0.4, s.y1 - py * s.r * 0.4, s.x2 - px * s.r * 0.4, s.y2 - py * s.r * 0.4);
    ctx.strokeStyle = 'rgba(70,80,92,0.5)'; ctx.lineWidth = 1.1; ctx.lineCap = 'butt';
    for (let a = 13, k = 0; a < len - 5; a += 15, k++) {
      const x = s.x1 + ux * a, y = s.y1 + uy * a, o = k % 2 ? 0 : 0.5;
      line(ctx, x - px * s.r * (0.95 - o), y - py * s.r * (0.95 - o), x + px * s.r * 0.95, y + py * s.r * 0.95);
    }
    ctx.lineCap = 'round';
  }

  // Sluseport: farget port av planker. Når den åpnes, glir den inn i stolpene.
  function drawGate(ctx, g, i, now) {
    const col = GATE_COL[i % GATE_COL.length];
    const dx = g.x2 - g.x1, dy = g.y2 - g.y1, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, px = -uy, py = ux;
    const k = g.open ? Math.min(1, (now - g.openT) / 0.7) : 0;
    const mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2;
    if (k < 1) {
      const e = 1 - k * k;
      ctx.globalAlpha = 1 - k * 0.6;
      ctx.lineCap = 'butt';
      for (const [sx, sy, dir] of [[g.x1, g.y1, 1], [g.x2, g.y2, -1]]) {
        const ex = sx + ux * dir * (len / 2) * e, ey = sy + uy * dir * (len / 2) * e;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = g.r * 2 + 4; line(ctx, sx, sy, ex, ey);
        ctx.strokeStyle = col[1]; ctx.lineWidth = g.r * 2; line(ctx, sx, sy, ex, ey);
        ctx.strokeStyle = col[0]; ctx.lineWidth = g.r * 1.1;
        line(ctx, sx - px * g.r * 0.3, sy - py * g.r * 0.3, ex - px * g.r * 0.3, ey - py * g.r * 0.3);
        ctx.strokeStyle = 'rgba(90,40,60,0.35)'; ctx.lineWidth = 1;
        for (let a = 9; a < (len / 2) * e - 3; a += 10) {
          const x = sx + ux * dir * a, y = sy + uy * dir * a;
          line(ctx, x - px * g.r, y - py * g.r, x + px * g.r, y + py * g.r);
        }
      }
      ctx.globalAlpha = 1;
      if (k === 0) drawMark(ctx, i, mx, my, 5, col[0], 0.95);
    } else {
      ctx.save();
      ctx.setLineDash([3, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
      line(ctx, g.x1, g.y1, g.x2, g.y2);
      ctx.restore();
    }
    for (const [x, y] of [[g.x1, g.y1], [g.x2, g.y2]]) {
      ctx.fillStyle = 'rgba(10,50,75,0.25)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 2.5, g.r + 2, 0, TAU); ctx.fill();
      ctx.fillStyle = PAL.log; ctx.beginPath(); ctx.arc(x, y, g.r + 2, 0, TAU); ctx.fill();
      ctx.fillStyle = col[0]; ctx.beginPath(); ctx.arc(x, y, g.r - 1.5, 0, TAU); ctx.fill();
    }
  }

  // Bryter: en flytende knapp. Grønn hake når den er trykket inn.
  function drawSwitch(ctx, s, t) {
    const col = GATE_COL[s.gate % GATE_COL.length];
    ctx.save();
    ctx.translate(s.x, s.y);
    if (!s.on) {
      const u = (t * 0.8) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - u)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, s.r + 2 + u * 10, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(10,50,75,0.22)'; ctx.beginPath(); ctx.arc(1.5, 2.5, s.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f7f2e6'; ctx.beginPath(); ctx.arc(0, 0, s.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = col[1]; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, s.r - 1.5, 0, TAU); ctx.stroke();
    ctx.fillStyle = s.on ? col[1] : col[0];
    ctx.beginPath(); ctx.arc(0, s.on ? 1 : -0.5, s.r * 0.55, 0, TAU); ctx.fill();
    if (s.on) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-3.5, 1); ctx.lineTo(-1, 3.5); ctx.lineTo(4, -2); ctx.stroke();
    } else {
      drawMark(ctx, s.gate, 0, -0.5, 3.4, col[0], 1);
    }
    ctx.restore();
  }

  // Frosker: små blader der frosken kan sitte, og en stiplet bue til neste hopp.
  function drawFrogLeaves(ctx, w, t) {
    for (const f of w.frogs) {
      f.hops.forEach(([x, y], i) => {
        ctx.save();
        ctx.translate(x, y); ctx.rotate(i * 2.1 + f.id * 1.3 + Math.sin(t * 0.8 + i) * 0.05);
        ctx.fillStyle = 'rgba(10,50,75,0.2)';
        ctx.beginPath(); ctx.arc(1.5, 2.5, 11, 0, TAU); ctx.fill();
        ctx.fillStyle = PAL.padDark;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 11, 0.35, TAU - 0.35); ctx.closePath(); ctx.fill();
        ctx.fillStyle = PAL.pad;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 9.6, 0.4, TAU - 0.4); ctx.closePath(); ctx.fill();
        ctx.restore();
      });
      if (f.hops.length > 1 && f.jt < 0) {
        const to = f.hops[(f.at + 1) % f.hops.length];
        const mx = (f.x + to[0]) / 2, my = (f.y + to[1]) / 2 - Math.hypot(to[0] - f.x, to[1] - f.y) * 0.18;
        ctx.save();
        ctx.setLineDash([2, 5]); ctx.lineDashOffset = -t * 10;
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.quadraticCurveTo(mx, my, to[0], to[1]); ctx.stroke();
        ctx.restore();
      }
    }
  }
  function drawFrog(ctx, f, t, wake) {
    const n = f.hops.length, to = f.hops[(f.at + 1) % n];
    let x = f.x, y = f.y, lift = 0;
    if (f.jt >= 0) {
      const u = Math.min(1, f.jt / C.FROG_JUMP);
      x = f.x + (to[0] - f.x) * u; y = f.y + (to[1] - f.y) * u; lift = Math.sin(u * Math.PI);
    }
    const ang = n > 1 ? Math.atan2(to[1] - f.y, to[0] - f.x) + Math.PI / 2 : 0;
    ctx.fillStyle = `rgba(10,50,75,${0.25 * (1 - lift * 0.5)})`;
    ctx.beginPath(); ctx.ellipse(x + 2, y + 3, 8 * (1 - lift * 0.3), 7 * (1 - lift * 0.3), 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(x, y - lift * 18);
    const s = 1 + lift * 0.4 + (wake ? Math.sin(t * 20) * 0.04 : 0);
    ctx.scale(s, s); ctx.rotate(ang);
    const green = '#74d05e', dark = '#3f9a3a', light = '#b7ef9a';
    // bakbein (strakt ut i hoppet)
    ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      if (lift > 0.05) { ctx.moveTo(sd * 4, 4); ctx.lineTo(sd * 6, 10); ctx.lineTo(sd * 5, 15); }
      else { ctx.moveTo(sd * 4, 4); ctx.lineTo(sd * 9, 3); ctx.lineTo(sd * 8, 8); }
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sd * 3, -3); ctx.lineTo(sd * 7, -6); ctx.stroke();
    }
    ctx.fillStyle = green;
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 8, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.ellipse(0, 2, 3.6, 4, 0, 0, TAU); ctx.fill();
    for (const sd of [-1, 1]) {
      ctx.fillStyle = green; ctx.beginPath(); ctx.arc(sd * 3.6, -6, 3.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(sd * 3.6, -6.4, 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = PAL.eye; ctx.beginPath(); ctx.arc(sd * 3.6, -6.8, 1.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // Lykt på en liten flottør (lyser opp i mørket).
  function drawLamp(ctx, L, t) {
    const fl = 0.85 + Math.sin(t * 7 + L.x) * 0.08 + Math.sin(t * 13 + L.y) * 0.05;
    ctx.fillStyle = 'rgba(10,50,75,0.25)'; ctx.beginPath(); ctx.arc(L.x + 1.5, L.y + 2.5, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a6a4a'; ctx.beginPath(); ctx.arc(L.x, L.y, 7, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(L.x, L.y, 1, L.x, L.y, 14);
    g.addColorStop(0, `rgba(255,240,180,${fl})`); g.addColorStop(0.4, `rgba(255,200,100,${0.6 * fl})`); g.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L.x, L.y, 14, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(L.x, L.y, 3, 0, TAU); ctx.fill();
  }

  // Skyggen bak moloer og lukkede porter: krusningen vises ikke der.
  function clipWallShadows(ctx, w, x, y) {
    const segs = w.walls.concat(w.gates.filter((g) => !g.open));
    for (const s of segs) {
      const far = (px, py) => {
        const dx = px - x, dy = py - y, d = Math.hypot(dx, dy) || 1;
        return [px + (dx / d) * 2000, py + (dy / d) * 2000];
      };
      const a = far(s.x1, s.y1), b = far(s.x2, s.y2);
      ctx.beginPath();
      ctx.rect(-500, -500, C.W + 1000, C.H + 1000);
      ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.lineTo(b[0], b[1]); ctx.lineTo(a[0], a[1]); ctx.closePath();
      ctx.clip('evenodd');
    }
  }

  // Stemning per verden: grått regnvær, snø over isen.
  function drawMood(ctx, w, t) {
    const mood = w.level && w.level.mood;
    if (mood === 'rain') {
      ctx.fillStyle = 'rgba(60,80,105,0.22)';
      ctx.fillRect(-60, -80, C.W + 120, C.H + 160);
      ctx.strokeStyle = 'rgba(230,242,255,0.34)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      for (let i = 0; i < 46; i++) {
        const ph = ((i * 0.618) % 1), spd = 0.9 + ((i * 37) % 10) / 25;
        const u = (t * spd * 0.9 + ph) % 1;
        const x = ((i * 83) % (C.W + 100)) - 50 + u * 60, y = -60 + u * (C.H + 120);
        line(ctx, x, y, x - 4, y - 16);
      }
    } else if (mood === 'dusk' && !w.dark) {
      // skumring: fiolett lys og noen ildfluer
      ctx.fillStyle = 'rgba(70,45,120,0.16)';
      ctx.fillRect(-60, -80, C.W + 120, C.H + 160);
      for (let i = 0; i < 9; i++) {
        const x = 40 + ((i * 131) % 280) + Math.sin(t * 0.5 + i * 2) * 26, y = 60 + ((i * 197) % 480) + Math.cos(t * 0.4 + i) * 20;
        const a = 0.35 + 0.35 * Math.sin(t * 2 + i * 1.7);
        ctx.fillStyle = `rgba(255,240,150,${Math.max(0, a)})`;
        ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
      }
    } else if (mood === 'ice') {
      ctx.fillStyle = 'rgba(215,235,255,0.10)';
      ctx.fillRect(-60, -80, C.W + 120, C.H + 160);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 34; i++) {
        const ph = ((i * 0.618) % 1), spd = 0.35 + ((i * 37) % 10) / 40;
        const u = (t * spd * 0.12 + ph) % 1;
        const x = ((i * 97) % (C.W + 60)) - 30 + Math.sin(t * 0.8 + i) * 10, y = -40 + u * (C.H + 80);
        ctx.beginPath(); ctx.arc(x, y, 1.2 + (i % 3) * 0.5, 0, TAU); ctx.fill();
      }
    }
  }

  // Natt: alt er mørkt, unntatt rundt lykter, båter, havner og krusninger.
  let darkCv = null;
  function drawDark(ctx, w, st, t) {
    const W = R.canvas.width, H = R.canvas.height;
    if (!darkCv) darkCv = document.createElement('canvas');
    if (darkCv.width !== W || darkCv.height !== H) { darkCv.width = W; darkCv.height = H; }
    const d = darkCv.getContext('2d');
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, W, H);
    const more = !!st.light;
    d.fillStyle = more ? 'rgba(12,18,48,0.68)' : 'rgba(8,12,36,0.86)';
    d.fillRect(0, 0, W, H);
    const k = R.dpr * R.s;
    d.setTransform(k, 0, 0, k, R.dpr * R.ox, R.dpr * R.oy);
    d.globalCompositeOperation = 'destination-out';
    const boost = more ? 1.35 : 1;
    const hole = (x, y, r, a) => {
      const g = d.createRadialGradient(x, y, r * 0.12, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.55, `rgba(0,0,0,${a * 0.75})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g; d.beginPath(); d.arc(x, y, r, 0, TAU); d.fill();
    };
    const fl = (s) => 1 + Math.sin(t * 6 + s) * 0.03 + Math.sin(t * 11 + s * 2) * 0.02;
    for (const b of w.boats) hole(b.x, b.y, 50 * boost * fl(b.id), b.sink > 0 ? 0.5 : 0.95);
    w.docks.forEach((dk, i) => hole(dk.x, dk.y, 58 * boost * fl(i + 7), 1));
    for (const L of (w.level.lamps || [])) hole(L.x, L.y, (L.r || 80) * boost * fl(L.x), 1);
    for (const f of w.frogs) hole(f.x, f.y, 24 * boost, 0.55);
    for (const s of w.switches) hole(s.x, s.y, 26 * boost, 0.6);
    for (const rp of w.ripples) {
      const a = E.falloff(rp.r * 0.9, rp.range) * rp.p;
      if (a < 0.03 || rp.r < 2) continue;
      d.lineWidth = 22; d.strokeStyle = `rgba(0,0,0,${Math.min(0.85, 0.9 * a)})`;
      d.beginPath(); d.arc(rp.x, rp.y, rp.r, 0, TAU); d.stroke();
    }
    if (st.aim) hole(st.aim.x, st.aim.y, 44, 0.8);
    if (st.hint) hole(st.hint.x, st.hint.y, 34, 0.8);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(darkCv, 0, 0);
    ctx.restore();
    // varmt lys fra lyktene
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x, y, r, a) => {
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, `rgba(255,190,100,${a})`); g.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    };
    w.docks.forEach((dk, i) => glow(dk.x, dk.y, 44 * fl(i + 3), 0.16));
    for (const L of (w.level.lamps || [])) glow(L.x, L.y, 40 * fl(L.y), 0.2);
    for (const b of w.boats) if (b.sink <= 0) glow(b.x, b.y, 24, 0.12);
    ctx.restore();
  }

  /* ---------- faste ting ---------- */

  function rockShape(r) {
    const key = r.seed + ':' + r.r;
    let pts = R.rockShapes.get(key);
    if (!pts) {
      const rnd = rng(r.seed * 31 + 5);
      pts = [];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd() * 0.3;
        const rr = r.r * (0.9 + rnd() * 0.16);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      R.rockShapes.set(key, pts);
    }
    return pts;
  }
  function rockPath(ctx, r, scale, ox, oy) {
    const pts = rockShape(r);
    const s = scale || 1;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % pts.length];
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      if (i === 0) ctx.moveTo(r.x + (ox || 0) + ((pts[pts.length - 1][0] + p0[0]) / 2) * s, r.y + (oy || 0) + ((pts[pts.length - 1][1] + p0[1]) / 2) * s);
      ctx.quadraticCurveTo(r.x + (ox || 0) + p0[0] * s, r.y + (oy || 0) + p0[1] * s, r.x + (ox || 0) + mx * s, r.y + (oy || 0) + my * s);
    }
    ctx.closePath();
  }
  function drawRock(ctx, r, t) {
    // skum rundt steinen
    ctx.strokeStyle = `rgba(255,255,255,${0.28 + 0.08 * Math.sin(t * 1.7 + r.seed)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r + 3.5, 0, TAU); ctx.stroke();
    ctx.fillStyle = PAL.rockDark; rockPath(ctx, r, 1.02, 0, 1.5); ctx.fill();
    ctx.fillStyle = PAL.rock; rockPath(ctx, r); ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = PAL.rockLight; rockPath(ctx, r, 0.62, -r.r * 0.16, -r.r * 0.2); ctx.fill();
    ctx.globalAlpha = 1;
    // mose-flekk
    ctx.fillStyle = 'rgba(120,170,80,0.45)';
    ctx.beginPath(); ctx.ellipse(r.x + r.r * 0.3, r.y + r.r * 0.32, r.r * 0.26, r.r * 0.14, 0.4, 0, TAU); ctx.fill();
  }

  function drawLog(ctx, l, seed) {
    const dx = l.x2 - l.x1, dy = l.y2 - l.y1, len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = l.r * 2 + 4;
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    ctx.strokeStyle = PAL.log; ctx.lineWidth = l.r * 2;
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    ctx.strokeStyle = PAL.logLight; ctx.lineWidth = l.r * 0.7;
    ctx.beginPath(); ctx.moveTo(l.x1 - px * l.r * 0.35, l.y1 - py * l.r * 0.35); ctx.lineTo(l.x2 - px * l.r * 0.35, l.y2 - py * l.r * 0.35); ctx.stroke();
    // barkstreker
    ctx.strokeStyle = 'rgba(70,40,20,0.35)'; ctx.lineWidth = 1;
    const rnd = rng(seed != null ? seed : Math.round(l.x1 * 3 + l.y1 * 5));
    for (let s = 0.12; s < 0.9; s += 0.11) {
      const u = s + rnd() * 0.05, o = (rnd() - 0.5) * l.r;
      const x = l.x1 + dx * u + px * o, y = l.y1 + dy * u + py * o;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (dx / len) * 7, y + (dy / len) * 7); ctx.stroke();
    }
    // endeved med årringer
    for (const [x, y] of [[l.x1, l.y1], [l.x2, l.y2]]) {
      ctx.fillStyle = PAL.logEnd;
      ctx.beginPath(); ctx.arc(x, y, l.r * 0.82, 0, TAU); ctx.fill();
      ctx.strokeStyle = PAL.logRing; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(x, y, l.r * 0.5, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, l.r * 0.22, 0, TAU); ctx.stroke();
    }
  }

  function drawPad(ctx, p, t) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + Math.sin(t * 0.7 + p.id) * 0.05);
    const notch = 0.32;
    ctx.fillStyle = PAL.padDark;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, p.r, notch, TAU - notch); ctx.closePath(); ctx.fill();
    ctx.fillStyle = PAL.pad;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, p.r - 1.6, notch + 0.04, TAU - notch - 0.04); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(40,110,40,0.45)'; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const a = notch + 0.35 + (i / 6) * (TAU - 2 * notch - 0.7);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * p.r * 0.85, Math.sin(a) * p.r * 0.85); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(-p.r * 0.3, -p.r * 0.35, p.r * 0.35, p.r * 0.18, -0.5, 0, TAU); ctx.fill();
    if (p.flower) {
      ctx.rotate(-p.angle);
      for (let i = 0; i < 8; i++) {
        ctx.rotate(TAU / 8);
        ctx.fillStyle = i % 2 ? PAL.flower : PAL.flowerLight;
        ctx.beginPath(); ctx.ellipse(p.r * 0.28, 0, p.r * 0.26, p.r * 0.12, 0, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = PAL.flowerC;
      ctx.beginPath(); ctx.arc(0, 0, p.r * 0.14, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawDock(ctx, d, t, fx) {
    const occ = d.boat >= 0;
    const flash = fx && fx.flash > 0 ? fx.flash : 0;
    const col = d.color >= 0 ? PAL.boats[d.color % PAL.boats.length][0] : PAL.dock;
    ctx.save();
    ctx.translate(d.x, d.y);
    // flytende bøyer i en ring
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + t * (occ ? 0.15 : 0.35);
      const bob = Math.sin(t * 2.2 + i) * 0.6;
      const x = Math.cos(a) * (d.r + bob), y = Math.sin(a) * (d.r + bob);
      ctx.fillStyle = 'rgba(10,50,75,0.2)';
      ctx.beginPath(); ctx.arc(x + 1, y + 1.6, 3.1, 0, TAU); ctx.fill();
      ctx.fillStyle = i % 2 ? '#ffffff' : col;
      ctx.beginPath(); ctx.arc(x, y, 3.1, 0, TAU); ctx.fill();
    }
    // tau mellom bøyene
    ctx.strokeStyle = occ ? 'rgba(255,240,190,0.95)' : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = occ ? 1.8 : 1.1;
    ctx.setLineDash(occ ? [] : [3, 4]);
    ctx.beginPath(); ctx.arc(0, 0, d.r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    if (d.color >= 0) drawMark(ctx, d.color, 0, 0, 6.5, col, occ ? 0.35 : 0.85);
    if (flash > 0) {
      ctx.strokeStyle = `rgba(255,240,180,${flash})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, d.r + (1 - flash) * 22, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // Merke per farge (prikk, trekant, firkant, rute …), så fargene også
  // kan skilles uten å se farge.
  function drawMark(ctx, ci, x, y, s, col, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    const k = ci % 5;
    if (k === 0) ctx.arc(0, 0, s * 0.8, 0, TAU);
    else if (k === 1) { ctx.moveTo(0, -s); ctx.lineTo(s * 0.95, s * 0.7); ctx.lineTo(-s * 0.95, s * 0.7); ctx.closePath(); }
    else if (k === 2) ctx.rect(-s * 0.72, -s * 0.72, s * 1.44, s * 1.44);
    else if (k === 3) { ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0); ctx.closePath(); }
    else { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * 0.45 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); }
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /* ---------- båter ---------- */

  function hullPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-17, 0);
    ctx.lineTo(-11, -9.5);
    ctx.lineTo(11, -9.5);
    ctx.lineTo(17.5, 0);
    ctx.lineTo(11, 9.5);
    ctx.lineTo(-11, 9.5);
    ctx.closePath();
  }

  function drawBoat(ctx, b, t, fx, look) {
    const pal = PAL.boats[b.color % PAL.boats.length];
    let scale = 1.12 + Math.sin(t * 2.1 + b.id * 1.7) * 0.02;
    let alpha = 1, spin = 0;
    if (fx && fx.squash > 0) scale += Math.sin(fx.squash * Math.PI) * 0.16;
    if (b.sink > 0) {
      const u = Math.min(1, b.sink / C.SINK_TIME);
      scale *= 1 - u * 0.85; alpha = 1 - u * 0.9; spin = u * 9;
    }
    if (fx && fx.pop > 0) scale *= 1 + Math.sin(fx.pop * Math.PI) * 0.25;
    const ang = (fx ? fx.angle : b.angle) + spin;
    const rock = Math.sin(t * 1.9 + b.id) * 0.05;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(b.x, b.y);
    ctx.save();
    ctx.rotate(ang + rock);
    ctx.scale(scale, scale);
    // skrog
    ctx.fillStyle = pal[1];
    hullPath(ctx); ctx.fill();
    ctx.fillStyle = pal[0];
    ctx.beginPath();
    ctx.moveTo(-16, -0.5); ctx.lineTo(-10.4, -8.6); ctx.lineTo(10.4, -8.6); ctx.lineTo(16.4, -0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal[2];
    ctx.globalAlpha = alpha * 0.55;
    ctx.beginPath(); ctx.moveTo(-10.4, -8.6); ctx.lineTo(10.4, -8.6); ctx.lineTo(8, -6.4); ctx.lineTo(-8, -6.4); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = alpha;
    // seilet (brettet midtparti)
    ctx.fillStyle = pal[2];
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(0, -5.2); ctx.lineTo(11, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal[1];
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(0, 5.2); ctx.lineTo(11, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(60,30,30,0.18)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.stroke();
    hullPath(ctx); ctx.stroke();
    if (b.heavy) {
      // lasteskute: kasser bak og foran, og kraftigere kant
      ctx.strokeStyle = 'rgba(70,40,25,0.75)'; ctx.lineWidth = 1.6;
      hullPath(ctx); ctx.stroke();
      for (const [cx, cw] of [[-14.5, 6.5], [8.5, 5.5]]) {
        ctx.fillStyle = '#c48a52'; ctx.fillRect(cx, -4.2, cw, 8.4);
        ctx.strokeStyle = '#7a4f2a'; ctx.lineWidth = 0.9; ctx.strokeRect(cx, -4.2, cw, 8.4);
        ctx.beginPath(); ctx.moveTo(cx, -4.2); ctx.lineTo(cx + cw, 4.2); ctx.moveTo(cx + cw, -4.2); ctx.lineTo(cx, 4.2); ctx.stroke();
      }
    }
    ctx.restore();

    // ansikt (alltid oppreist – ser søtere ut)
    drawFace(ctx, b, t, fx, look, scale);
    // fargemerke når banen har fargede havner
    if (b.mark) drawMark(ctx, b.color, 0, 11 * scale, 3.6 * scale, pal[1], alpha);
    ctx.restore();
  }

  function drawFace(ctx, b, t, fx, look, scale) {
    const happy = b.dock >= 0;
    const s = scale;
    const ex = 4.6 * s, ey = -1.5 * s;
    const blink = fx && fx.blink > 0;
    const speed = Math.hypot(b.vx, b.vy);
    let lx = 0, ly = 0;
    if (look && !happy) {
      const dx = look.x - b.x, dy = look.y - b.y, d = Math.hypot(dx, dy) || 1;
      lx = (dx / d) * 1.2; ly = (dy / d) * 1.2;
    } else if (speed > 15) { lx = (b.vx / speed) * 1.2; ly = (b.vy / speed) * 1.2; }
    for (const side of [-1, 1]) {
      const x = side * ex, y = ey;
      if (happy) {
        ctx.strokeStyle = PAL.eye; ctx.lineWidth = 1.5 * s; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x, y + 1 * s, 2.2 * s, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        continue;
      }
      if (b.sink > 0) {
        ctx.strokeStyle = PAL.eye; ctx.lineWidth = 1.2 * s;
        ctx.beginPath(); ctx.moveTo(x - 1.6 * s, y - 1.6 * s); ctx.lineTo(x + 1.6 * s, y + 1.6 * s);
        ctx.moveTo(x + 1.6 * s, y - 1.6 * s); ctx.lineTo(x - 1.6 * s, y + 1.6 * s); ctx.stroke();
        continue;
      }
      const squint = speed > 160 ? 0.55 : 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(x, y, 2.9 * s, (blink ? 0.4 : 3.3 * squint) * s, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(27,42,51,0.35)'; ctx.lineWidth = 0.6 * s; ctx.stroke();
      if (!blink) {
        ctx.fillStyle = PAL.eye;
        ctx.beginPath(); ctx.arc(x + lx * s, y + ly * s, 1.75 * s * (squint < 1 ? 0.8 : 1), 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x + lx * s - 0.6 * s, y + ly * s - 0.7 * s, 0.6 * s, 0, TAU); ctx.fill();
      }
    }
    if (happy) {
      ctx.fillStyle = 'rgba(255,120,120,0.45)';
      ctx.beginPath(); ctx.ellipse(-7.4 * s, 2.2 * s, 2 * s, 1.2 * s, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(7.4 * s, 2.2 * s, 2 * s, 1.2 * s, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = PAL.eye; ctx.lineWidth = 1.2 * s;
      ctx.beginPath(); ctx.arc(0, 1.6 * s, 2 * s, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
  }

  /* ---------- effekter ---------- */

  function drawParticles(ctx, parts, layer) {
    if (!parts) return;
    for (const p of parts) {
      if ((p.layer || 'over') !== layer) continue;
      const u = p.t / p.life;
      const a = Math.max(0, 1 - u);
      switch (p.type) {
        case 'drop':
          ctx.fillStyle = `rgba(235,252,255,${a * 0.9})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - u * 0.5), 0, TAU); ctx.fill();
          break;
        case 'flash':
          ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`;
          ctx.lineWidth = 2.5 * a + 0.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, 3 + u * p.size, 0, TAU); ctx.stroke();
          break;
        case 'wake':
          ctx.strokeStyle = `rgba(255,255,255,${a * 0.42})`;
          ctx.lineWidth = 1.6 * (1 - u * 0.5);
          ctx.lineCap = 'round';
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle || 0);
          ctx.beginPath(); ctx.arc(0, 0, p.size * (1 + u * 2.4), Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
          ctx.restore();
          break;
        case 'spark': {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle + u * 3);
          const s = p.size * (1 - u * 0.6);
          ctx.fillStyle = p.color || `rgba(255,226,120,${a})`;
          ctx.globalAlpha = a;
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const an = (i / 4) * TAU;
            ctx.lineTo(Math.cos(an) * s, Math.sin(an) * s);
            ctx.lineTo(Math.cos(an + TAU / 8) * s * 0.35, Math.sin(an + TAU / 8) * s * 0.35);
          }
          ctx.closePath(); ctx.fill();
          ctx.restore(); ctx.globalAlpha = 1;
          break;
        }
        case 'paper': {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle + p.t * p.spin);
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.fillStyle = p.color;
          const sq = Math.abs(Math.cos(p.t * p.flip));
          ctx.fillRect(-p.size, -p.size * 0.6 * sq, p.size * 2, p.size * 1.2 * sq);
          ctx.restore(); ctx.globalAlpha = 1;
          break;
        }
        case 'bubble':
          ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + u), 0, TAU); ctx.stroke();
          break;
        case 'ringfx':
          ctx.strokeStyle = `rgba(${p.rgb || '255,240,180'},${a * 0.9})`;
          ctx.lineWidth = 3 * a + 0.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r0 + u * p.size, 0, TAU); ctx.stroke();
          break;
      }
    }
  }

  function drawHint(ctx, h, t, w) {
    // Med tømmer i elva gjelder hintet et bestemt øyeblikk: en ring krymper
    // inn mot punktet og lyser grønt når det er tid for å trykke.
    if (h.at != null && w) {
      const left = (h.at - h.win - w.steps) * C.DT;
      const now = left <= 0;
      if (!now) {
        const k = Math.min(1, left / 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.5 * (1 - k)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(h.x, h.y, 11 + 46 * k, 0, TAU); ctx.stroke();
      } else {
        const p = (t * 4) % 1;
        ctx.fillStyle = 'rgba(140,240,150,0.28)';
        ctx.beginPath(); ctx.arc(h.x, h.y, 16, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(140,240,150,${0.95 * (1 - p)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(h.x, h.y, 10 + p * 18, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = now ? 'rgba(150,245,160,1)' : 'rgba(255,236,150,0.95)';
      ctx.beginPath(); ctx.arc(h.x, h.y, now ? 6 : 4.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(40,80,0,0.4)'; ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }
    const pulse = (t * 1.3) % 1;
    ctx.strokeStyle = `rgba(255,236,150,${0.9 * (1 - pulse)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(h.x, h.y, 6 + pulse * 26, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,236,150,0.95)';
    ctx.beginPath(); ctx.arc(h.x, h.y, 4.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,0,0.4)'; ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawAim(ctx, w, aim, t) {
    const ok = !aim.cancel;
    // rekkevidde
    ctx.save();
    ctx.setLineDash([4, 7]);
    ctx.lineDashOffset = -t * 20;
    ctx.strokeStyle = ok ? 'rgba(255,255,255,0.28)' : 'rgba(255,160,160,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(aim.x, aim.y, C.RIPPLE_RANGE * 0.98, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // dråpen som skal slippes
    const bob = Math.sin(t * 8) * 1.2;
    ctx.fillStyle = 'rgba(10,50,75,0.25)';
    ctx.beginPath(); ctx.ellipse(aim.x, aim.y + 2, 5, 2.5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,170,170,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(aim.x, aim.y, 9 + bob, 0, TAU); ctx.stroke();
    if (!ok) {
      ctx.beginPath(); ctx.moveTo(aim.x - 5, aim.y - 5); ctx.lineTo(aim.x + 5, aim.y + 5);
      ctx.moveTo(aim.x + 5, aim.y - 5); ctx.lineTo(aim.x - 5, aim.y + 5); ctx.stroke();
      return;
    }
    drawArrows(ctx, w, aim.x, aim.y, 1);
  }

  // piler på det som vil bli dyttet (styrke = lengde og tykkelse)
  function drawArrows(ctx, w, x, y, alpha) {
    for (const fr of E.previewFrogs(w, x, y)) {
      ctx.strokeStyle = `rgba(190,255,160,${0.85 * alpha})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(fr.x, fr.y, 15, 0, TAU); ctx.stroke();
    }
    for (const p0 of E.preview(w, x, y)) {
      const p = Object.assign({}, p0, { f: p0.f / p0.body.mass });
      const b = p.body;
      const len = 10 + 46 * p.f;
      const sx = b.x + p.nx * (b.r + 5), sy = b.y + p.ny * (b.r + 5);
      const ex = sx + p.nx * len, ey = sy + p.ny * len;
      const a = (0.35 + 0.6 * p.f) * alpha;
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = 2 + 2.5 * p.f;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex - p.nx * 4, ey - p.ny * 4); ctx.stroke();
      const hx = -p.ny, hy = p.nx, hs = 4 + 3 * p.f;
      ctx.beginPath();
      ctx.moveTo(ex + p.nx * 3, ey + p.ny * 3);
      ctx.lineTo(ex - p.nx * hs + hx * hs, ey - p.ny * hs + hy * hs);
      ctx.lineTo(ex - p.nx * hs - hx * hs, ey - p.ny * hs - hy * hs);
      ctx.closePath(); ctx.fill();
    }
  }


  /* ---------- Stryket (elvestryk) ---------- */
  // Egen tegning for elva: bredder, skum og hindringer ruller nedover,
  // mens båten ligger fast. Gjenbruker stein, stokk, virvel og båt.

  function hash(n) { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  R.drawStryk = function (st, view) {
    const Sx = root.Stryket, K = Sx.K, lv = st.lv;
    const ctx = R.ctx, t = view.time;
    const Y = (d) => Sx.sy(st, d);
    // synlig område i dam-enheter (elva går over hele skjermen)
    const vy0 = -R.oy / R.s - 12, vy1 = (R.cssH - R.oy) / R.s + 12;
    const vx0 = -R.ox / R.s - 12, vx1 = (R.cssW - R.ox) / R.s + 12;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    worldTransform(ctx);
    const gg = ctx.createLinearGradient(0, vy0, 0, vy1);
    gg.addColorStop(0, PAL.grassA); gg.addColorStop(1, PAL.grassB);
    ctx.fillStyle = gg; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    drawStrykLand(ctx, st, lv, Y, vy0, vy1);
    // sandkant og vann mellom breddene
    const wob = (d, k) => Math.sin(d * 0.05 + k) * 1.4 + Math.sin(d * 0.013 + k) * 1.8;
    const riverPath = (off, wk) => {
      ctx.beginPath();
      for (let y = vy0; y <= vy1 + 8; y += 8) { const d = st.dist + (K.BOAT_Y - y); ctx.lineTo(Sx.bankL(lv, d) - off - wob(d, 1) * wk, y); }
      for (let y = vy1 + 8; y >= vy0; y -= 8) { const d = st.dist + (K.BOAT_Y - y); ctx.lineTo(Sx.bankR(lv, d) + off + wob(d, 2) * wk, y); }
      ctx.closePath();
    };
    ctx.fillStyle = PAL.sandEdge; riverPath(12, 1); ctx.fill();
    ctx.fillStyle = PAL.sand; riverPath(9, 0.8); ctx.fill();
    ctx.save();
    riverPath(0, 0); ctx.clip();
    const wg = ctx.createLinearGradient(0, vy0, 0, vy1);
    wg.addColorStop(0, PAL.waterTop); wg.addColorStop(0.5, PAL.waterMid); wg.addColorStop(1, PAL.waterBot);
    ctx.fillStyle = wg; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    // grunt vann langs bredden
    for (let i = 5; i >= 0; i--) {
      ctx.globalAlpha = 0.08; ctx.strokeStyle = PAL.shallow; ctx.lineWidth = 4 + i * 5;
      riverPath(0, 0); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // lysmønster som ruller med elva
    if (R.causticPat) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.09;
      ctx.fillStyle = R.causticPat;
      ctx.scale(2.1, 2.1);
      ctx.translate((t * 2) % 96, (st.dist / 2.1) % 96);
      ctx.fillRect(-150, -300, C.W / 2.1 + 300, C.H / 2.1 + 500);
      ctx.restore();
    }
    // skumstriper i strømmen
    const top = st.dist + K.BOAT_Y - vy0, bot = st.dist + K.BOAT_Y - vy1; // synlig strekning (d)
    ctx.lineCap = 'round';
    const gap = 38;
    for (let j = Math.floor(bot / gap); j <= Math.ceil(top / gap); j++) {
      for (let k = 0; k < 2; k++) {
        const h = hash(j * 3 + k * 17);
        const d = j * gap + h * gap;
        const L = Sx.bankL(lv, d) + 14, Rr = Sx.bankR(lv, d) - 14;
        const x = L + hash(j * 7 + k * 5 + 1) * (Rr - L), y = Y(d);
        const len = 10 + h * 18;
        ctx.strokeStyle = `rgba(255,255,255,${0.12 + 0.12 * hash(j + k * 9)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
      }
    }
    // sidestrømmer: piler som glir sidelengs
    for (const c of (lv.drifts || [])) {
      const y1 = Y(c.d + c.len), y2 = Y(c.d);
      if (y2 < -20 || y1 > C.H + 20) continue;
      ctx.save();
      ctx.beginPath(); ctx.rect(c.x1, y1, c.x2 - c.x1, y2 - y1); ctx.clip();
      ctx.fillStyle = 'rgba(215,250,255,0.07)';
      ctx.fillRect(c.x1, y1, c.x2 - c.x1, y2 - y1);
      const dir = Math.sign(c.vx), s = 6, sp = 34;
      const shift = ((t * Math.abs(c.vx) * 0.8) % sp) * dir;
      ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
      for (let yy = y1 + 20; yy < y2; yy += 40) {
        for (let xx = c.x1 - sp; xx < c.x2 + sp; xx += sp) {
          const x = xx + shift + ((yy - y1) / 40 % 2) * sp / 2;
          const edge = Math.min(yy - y1, y2 - yy);
          ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, Math.min(1, edge / 30)) * 0.45})`;
          ctx.beginPath(); ctx.moveTo(x - dir * s, yy - s); ctx.lineTo(x, yy); ctx.lineTo(x - dir * s, yy + s); ctx.stroke();
        }
      }
      ctx.restore();
    }
    for (const w of (lv.whirls || [])) {
      const y = Y(w.d);
      if (y < -w.r || y > C.H + w.r) continue;
      drawWhirl(ctx, { x: w.x, y, r: w.r, power: 1.3, dir: w.dir || 1 }, t);
    }
    // havna i mål
    const fy = Y(lv.length);
    if (fy > -60 && fy < C.H + 60) drawStrykDock(ctx, lv, fy, t, st.done);
    // bøyer (ny start)
    (lv.checkpoints || []).forEach((cp, i) => {
      const y = Y(cp.d);
      if (y < -20 || y > C.H + 20) return;
      const L = Sx.bankL(lv, cp.d), Rr = Sx.bankR(lv, cp.d), passed = st.cp > i;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(Rr, y); ctx.stroke(); ctx.setLineDash([]);
      const n = Math.max(3, Math.round((Rr - L) / 34));
      for (let k = 0; k <= n; k++) {
        const x = L + 6 + (Rr - L - 12) * (k / n), bob = Math.sin(t * 2.4 + k) * 0.8;
        ctx.fillStyle = 'rgba(10,50,75,0.2)';
        ctx.beginPath(); ctx.arc(x + 1, y + 1.6 + bob, 3.4, 0, TAU); ctx.fill();
        ctx.fillStyle = k % 2 ? '#ffffff' : passed ? '#7fe0b5' : '#ff8f7e';
        ctx.beginPath(); ctx.arc(x, y + bob, 3.4, 0, TAU); ctx.fill();
      }
    });
    // perler
    (lv.pearls || []).forEach((p, i) => {
      if (st.got[i]) return;
      const y = Y(p.d);
      if (y < -20 || y > C.H + 20) return;
      drawPearl(ctx, p.x, y + Math.sin(t * 2 + i) * 1.2, t + i);
    });
    // krusninger
    for (const rp of st.ripples) if (rp.r > 1) drawRing(ctx, { x: rp.x, y: rp.y, range: K.RIPPLE_RANGE, p: 1 }, rp.r);
    drawParticles(ctx, view.particles, 'under');
    ctx.restore();
    // skumkant langs bredden
    ctx.strokeStyle = PAL.foam; ctx.lineWidth = 1.6;
    riverPath(0.8, 0); ctx.stroke();
    (lv.rocks || []).forEach((r, i) => {
      const y = Y(r.d);
      if (y < -40 || y > C.H + 40) return;
      drawRock(ctx, { x: Sx.rockX(st, r), y, r: r.r, seed: i * 7 + 3 }, t);
    });
    (lv.logs || []).forEach((g, i) => {
      const e = Sx.logEnds(st, g);
      if (Math.max(e.y1, e.y2) < -30 || Math.min(e.y1, e.y2) > C.H + 30) return;
      drawLog(ctx, { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, r: K.LOG_R }, i * 13 + 5);
    });
    const fx = view.boatFx || {};
    const sinkU = st.sink > 0 ? 1 - st.sink / K.SINK_TIME : 0;
    drawBoat(ctx, {
      id: 0, x: st.x, y: st.y, vx: st.vx, vy: st.done ? 0 : -60, color: view.color || 0,
      dock: st.done ? 0 : -1, sink: sinkU > 0 ? Math.min(1, sinkU * 1.4) * C.SINK_TIME : 0,
    }, t, fx, null);
    drawParticles(ctx, view.particles, 'over');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  function drawPearl(ctx, x, y, t) {
    ctx.fillStyle = 'rgba(10,50,75,0.22)';
    ctx.beginPath(); ctx.arc(x + 1.2, y + 2, 7, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.2 * Math.sin(t * 3)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 10 + Math.sin(t * 3) * 1.5, 0, TAU); ctx.stroke();
    const g = ctx.createRadialGradient(x - 2.5, y - 2.5, 0.5, x, y, 7.5);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f3eefc'); g.addColorStop(1, '#c9bfe6');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.arc(x - 2.4, y - 2.6, 1.7, 0, TAU); ctx.fill();
  }

  // Land langs elva: gresstrå, siv, småstein og blomster (fast plass langs elva).
  function drawStrykLand(ctx, st, lv, Y, vy0, vy1) {
    const Sx = root.Stryket, K = Sx.K;
    const top = st.dist + K.BOAT_Y - vy0 + 40, bot = st.dist + K.BOAT_Y - vy1 - 40;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const edge = (d) => side < 0 ? Sx.bankL(lv, d) : Sx.bankR(lv, d);
      // gresstrå
      const bs = 9;
      for (let j = Math.floor(bot / bs); j <= Math.ceil(top / bs); j++) {
        for (let k = 0; k < 3; k++) {
          const h = hash(j * 5 + k * 31 + (side > 0 ? 900 : 0));
          const d = j * bs + h * bs, e = edge(d);
          const x = e + side * (16 + hash(j * 3 + k + side * 7) * 150), y = Y(d);
          ctx.strokeStyle = PAL.blade[(j + k) % 3]; ctx.lineWidth = 1.1;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (h - 0.5) * 3, y - 3 - h * 4); ctx.stroke();
        }
      }
      const step = 40;
      for (let j = Math.floor(bot / step); j <= Math.ceil(top / step); j++) {
        const h = hash(j * 11 + (side > 0 ? 500 : 0));
        const d = j * step + h * step, y = Y(d), e = edge(d);
        const x = e + side * (17 + hash(j * 5 + side) * 60);
        if (h < 0.35) drawReeds(ctx, x, y, rng(j * 13 + (side > 0 ? 7 : 3)));
        else if (h < 0.55) {
          ctx.fillStyle = 'rgba(150,130,90,0.5)';
          ctx.beginPath(); ctx.ellipse(x, y, 3.2, 2.2, 0, 0, TAU); ctx.fill();
        } else if (h < 0.8) {
          const col = j % 3 === 0 ? '#fff6e0' : j % 3 === 1 ? '#ffd1e3' : '#fff2a6';
          for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 1.7, y + Math.sin(a) * 1.7, 1.25, 0, TAU); ctx.fill(); }
          ctx.fillStyle = '#f5b83d'; ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill();
        }
      }
    }
  }

  // Målet: en brygge tvers over elva med en åpning og bøyer rundt havna.
  function drawStrykDock(ctx, lv, y, t, done) {
    const Sx = root.Stryket;
    const L = Sx.bankL(lv, lv.length), Rr = Sx.bankR(lv, lv.length), x = lv.dockX;
    // rolig vann i havna
    const g = ctx.createRadialGradient(x, y - 30, 4, x, y - 30, 70);
    g.addColorStop(0, 'rgba(255,240,180,0.35)'); g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 30, 70, 0, TAU); ctx.fill();
    // brygger fra hver side
    for (const [a, b] of [[L - 10, x - 38], [x + 38, Rr + 10]]) {
      ctx.fillStyle = 'rgba(10,50,75,0.22)'; ctx.fillRect(a, y - 7 + 3, b - a, 16);
      ctx.fillStyle = PAL.log; ctx.fillRect(a, y - 7, b - a, 16);
      ctx.fillStyle = PAL.logLight;
      for (let px = a; px < b; px += 9) ctx.fillRect(px + 1, y - 6, 7, 14);
      ctx.fillStyle = PAL.log;
      ctx.fillRect(a, y - 8, b - a, 2.5);
    }
    for (const px of [x - 38, x + 38]) {
      ctx.fillStyle = '#7a4f2a'; ctx.beginPath(); ctx.arc(px, y + 1, 5.5, 0, TAU); ctx.fill();
      ctx.fillStyle = PAL.logEnd; ctx.beginPath(); ctx.arc(px, y + 1, 3.6, 0, TAU); ctx.fill();
    }
    // flagg
    ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x - 38, y); ctx.lineTo(x - 38, y - 26); ctx.stroke();
    const wave = Math.sin(t * 4) * 2;
    ctx.fillStyle = done ? '#7fe0b5' : '#ffd166';
    ctx.beginPath(); ctx.moveTo(x - 38, y - 26); ctx.quadraticCurveTo(x - 28, y - 24 + wave, x - 20, y - 21); ctx.lineTo(x - 38, y - 15); ctx.closePath(); ctx.fill();
  }

  root.Render = R;
})(typeof window !== 'undefined' ? window : globalThis);
