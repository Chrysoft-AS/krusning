/* =====================================================================
 * Krusning – lyd
 * ---------------------------------------------------------------------
 * All lyd lages i sanntid med Web Audio (ingen lydfiler å holde styr på).
 * Toner hentes fra en pentatonisk skala, så alt låter pent sammen.
 * Merk: på iPhone er lyden av når lydløs-bryteren er på.
 * ===================================================================== */
(function (root) {
  'use strict';

  const PENTA = [0, 2, 4, 7, 9];
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const note = (i, base) => { // i-te tone i skalaen fra grunntonen
    const o = Math.floor(i / 5), d = ((i % 5) + 5) % 5;
    return midi((base || 72) + o * 12 + PENTA[d]);
  };

  const S = {
    ctx: null, master: null, sfxBus: null, musicBus: null, verb: null,
    sfxOn: true, musicOn: true,
    musicTimer: null, nextChordAt: 0, nextNoteAt: 0, chordIdx: 0,
  };

  S.unlock = function () {
    if (!S.ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      try { S.ctx = new AC(); } catch (e) { return; }
      const ctx = S.ctx;
      S.master = ctx.createGain(); S.master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      S.master.connect(comp); comp.connect(ctx.destination);
      S.verb = ctx.createConvolver();
      S.verb.buffer = impulse(ctx, 2.4, 2.8);
      const wet = ctx.createGain(); wet.gain.value = 0.32;
      S.verb.connect(wet); wet.connect(S.master);
      S.sfxBus = ctx.createGain(); S.sfxBus.gain.value = S.sfxOn ? 1 : 0;
      S.sfxBus.connect(S.master);
      S.musicBus = ctx.createGain(); S.musicBus.gain.value = S.musicOn ? 0.55 : 0;
      S.musicBus.connect(S.master);
      // en stille lyd "låser opp" lyden på iOS
      const b = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(0);
    }
    if (S.ctx.state === 'suspended') S.ctx.resume();
    if (S.musicOn) S.startMusic();
  };

  function impulse(ctx, seconds, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  S.setSfx = function (on) {
    S.sfxOn = on;
    if (S.sfxBus) S.sfxBus.gain.setTargetAtTime(on ? 1 : 0, S.ctx.currentTime, 0.05);
  };
  S.setMusic = function (on) {
    S.musicOn = on;
    if (S.musicBus) S.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, S.ctx.currentTime, 0.3);
    if (on && S.ctx) S.startMusic();
  };

  const ready = () => S.ctx && S.ctx.state === 'running';

  // En enkel tone med konvolutt. send = andel til romklang.
  function tone(o) {
    const ctx = S.ctx, t = o.t || ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.dur));
    const g = ctx.createGain();
    const a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.dur);
    osc.connect(g);
    g.connect(o.bus || S.sfxBus);
    if (o.send) { const s = ctx.createGain(); s.gain.value = o.send; g.connect(s); s.connect(S.verb); }
    osc.start(t); osc.stop(t + a + o.dur + 0.05);
  }

  function noise(o) {
    const ctx = S.ctx, t = o.t || ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * (o.dur + 0.02));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = o.filter || 'bandpass';
    f.frequency.value = o.freq || 2000; f.Q.value = o.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol || 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(S.sfxBus);
    if (o.send) { const s = ctx.createGain(); s.gain.value = o.send; g.connect(s); s.connect(S.verb); }
    src.start(t); src.stop(t + o.dur + 0.02);
  }

  /* ---------- lydeffekter ---------- */

  // Vanndråpe. x (0..1) velger tone: venstre dypt, høyre lyst.
  S.plip = function (x) {
    if (!ready()) return;
    const i = Math.max(0, Math.min(9, Math.round(x * 9)));
    const f = note(i, 67);
    tone({ f: f * 0.7, f2: f * 1.5, glide: 0.07, dur: 0.16, vol: 0.28, send: 0.45 });
    tone({ f: f * 2, dur: 0.06, vol: 0.05, type: 'triangle', send: 0.3 });
    noise({ dur: 0.07, freq: 3200, q: 0.8, vol: 0.05, filter: 'highpass' });
  };

  S.hit = function (f) {
    if (!ready() || f < 0.25) return;
    tone({ f: 180 + f * 120, f2: 320 + f * 200, glide: 0.08, dur: 0.12, vol: 0.05 * f, send: 0.3 });
  };

  S.bump = function (v, what) {
    if (!ready()) return;
    const k = Math.min(1, v / 320);
    if (k < 0.08) return;
    if (what === 'rock' || what === 'shore') {
      tone({ f: 150, f2: 90, dur: 0.09, vol: 0.22 * k, type: 'triangle' });
      noise({ dur: 0.05, freq: 900, q: 1.2, vol: 0.12 * k });
    } else if (what === 'log') {
      tone({ f: 210, f2: 160, dur: 0.1, vol: 0.22 * k, type: 'triangle' });
      tone({ f: 420, dur: 0.05, vol: 0.06 * k });
    } else if (what === 'pad') {
      tone({ f: 120, f2: 80, dur: 0.12, vol: 0.18 * k });
    } else { // båt mot båt: papir mot papir
      tone({ f: 330, f2: 250, dur: 0.07, vol: 0.14 * k, type: 'triangle' });
      noise({ dur: 0.05, freq: 2500, q: 0.7, vol: 0.06 * k });
    }
  };

  // Klokkespill når en båt kommer i havn. Stiger for hver båt.
  S.dock = function (n) {
    if (!ready()) return;
    const f = note(4 + n * 2, 72);
    const t = S.ctx.currentTime;
    tone({ f, dur: 0.9, vol: 0.2, send: 0.6, t });
    tone({ f: f * 2.76, dur: 0.25, vol: 0.05, send: 0.5, t });
    tone({ f: f * 1.5, dur: 0.6, vol: 0.07, send: 0.6, t: t + 0.07 });
  };

  S.win = function () {
    if (!ready()) return;
    const t = S.ctx.currentTime;
    [0, 2, 4, 5, 7].forEach((d, i) => {
      const f = note(d, 72);
      tone({ f, dur: 0.55, vol: 0.16, send: 0.55, t: t + i * 0.09 });
      tone({ f: f * 4, dur: 0.12, vol: 0.03, send: 0.4, t: t + i * 0.09 });
    });
    tone({ f: note(0, 48), dur: 1.6, vol: 0.08, attack: 0.08, type: 'triangle', send: 0.5, t });
  };

  S.star = function (i) {
    if (!ready()) return;
    const f = note(5 + i * 2, 72);
    tone({ f, dur: 0.5, vol: 0.18, send: 0.5 });
    tone({ f: f * 2, dur: 0.18, vol: 0.05, send: 0.5 });
  };

  S.pearl = function () {
    if (!ready()) return;
    const t = S.ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      const f = note(8 + i, 72);
      tone({ f, dur: 0.6, vol: 0.09, send: 0.8, t: t + i * 0.055 });
    }
  };

  S.sink = function () {
    if (!ready()) return;
    const t = S.ctx.currentTime;
    tone({ f: 520, f2: 110, glide: 0.9, dur: 0.95, vol: 0.14, send: 0.4, t });
    for (let i = 0; i < 4; i++) tone({ f: 300 + Math.random() * 300, f2: 700, glide: 0.05, dur: 0.06, vol: 0.06, t: t + 0.15 + i * 0.16 });
  };

  S.pop = function () {
    if (!ready()) return;
    tone({ f: 300, f2: 900, glide: 0.08, dur: 0.12, vol: 0.14, send: 0.4 });
  };

  S.click = function () {
    if (!ready()) return;
    tone({ f: 1100, f2: 1500, glide: 0.03, dur: 0.05, vol: 0.06 });
  };

  S.lose = function () { // stjerne mistet (diskret)
    if (!ready()) return;
    tone({ f: 520, f2: 390, glide: 0.15, dur: 0.18, vol: 0.06, type: 'triangle' });
  };

  /* ---------- rolig bakgrunnsmusikk (generert) ---------- */

  const CHORDS = [
    [48, 55, 64, 71], // Cmaj7
    [45, 52, 60, 67], // Am7
    [41, 48, 57, 64], // Fmaj7
    [43, 50, 59, 64], // G6
  ];

  S.startMusic = function () {
    if (!S.ctx || S.musicTimer) return;
    S.nextChordAt = S.ctx.currentTime + 0.3;
    S.nextNoteAt = S.ctx.currentTime + 1.2;
    S.musicTimer = setInterval(scheduleMusic, 200);
  };
  S.stopMusic = function () { clearInterval(S.musicTimer); S.musicTimer = null; };

  function scheduleMusic() {
    if (!S.ctx || S.ctx.state !== 'running') return;
    const now = S.ctx.currentTime, ahead = now + 0.5;
    while (S.nextChordAt < ahead) {
      const ch = CHORDS[S.chordIdx % CHORDS.length];
      S.chordIdx++;
      ch.forEach((n, i) => {
        tone({ f: midi(n), dur: 5.2, vol: i === 0 ? 0.045 : 0.03, attack: 1.4, type: i === 0 ? 'sine' : 'triangle', bus: S.musicBus, send: 0.7, t: S.nextChordAt });
      });
      S.nextChordAt += 6;
    }
    while (S.nextNoteAt < ahead) {
      const ch = CHORDS[(S.chordIdx + CHORDS.length - 1) % CHORDS.length];
      const n = ch[1 + Math.floor(Math.random() * 3)] + 24;
      tone({ f: midi(n), dur: 1.1, vol: 0.035, bus: S.musicBus, send: 0.85, t: S.nextNoteAt });
      tone({ f: midi(n) * 3, dur: 0.15, vol: 0.006, bus: S.musicBus, send: 0.6, t: S.nextNoteAt });
      S.nextNoteAt += 0.6 + Math.random() * 1.6;
    }
  }

  root.Sound = S;
})(typeof window !== 'undefined' ? window : globalThis);
