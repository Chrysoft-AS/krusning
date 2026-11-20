#!/usr/bin/env node
/* Krusning – automatisk gjennomspilling i ekte nettleser.
 * Spiller hver bane ved å trykke der hint-knappen peker, og sjekker at
 * banen blir fullført, at resultatskjermen dukker opp og at fremgang lagres.
 * Spiller også noen brett fra Rask runde og Dagens dam.
 * Bruk: node tools/playtest.js [bane-id ...]   (eller: quick / daily) */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const file = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(file);
  await page.waitForTimeout(600);
  // Banene på Stien, pluss de tre første brettene i hvert nivå av Rask runde
  // og de sju første dagene i Dagens dam.
  const args = process.argv.slice(2);
  const ids = [];
  if (!args.length || args.includes('path')) ids.push(...await page.evaluate(() => Levels.WORLDS.flatMap((w) => w.levels.map((l) => l.id))));
  if (!args.length || args.includes('quick')) for (const t of ['easy', 'medium', 'hard']) for (let i = 0; i < 3; i++) ids.push('quick:' + t + ':' + i);
  if (!args.length || args.includes('daily')) for (let i = 0; i < 7; i++) ids.push('daily:' + i);
  for (const a of args) if (/^\d/.test(a)) ids.push(a);

  // ekte fingertrykk på første bane
  await page.evaluate(() => Krusning.startLevel('1-1'));
  await page.waitForTimeout(300);
  const pt = await page.evaluate(() => { const p = Render.toScreen(178, 490); const r = document.getElementById('game').getBoundingClientRect(); return { x: p.x + r.left, y: p.y + r.top }; });
  await page.touchscreen.tap(pt.x, pt.y);
  await page.waitForTimeout(200);
  const tapsAfterTouch = await page.evaluate(() => Krusning.G.world.taps);
  console.log('Fingertrykk registrert:', tapsAfterTouch === 1 ? 'ja ✔' : 'NEI ✘ (' + tapsAfterTouch + ')');

  let fails = 0;
  for (const id of ids) {
    await page.evaluate((id) => {
      const [mode, a, b] = id.split(':');
      if (mode === 'quick') { Krusning.save().quick[a].i = +b; Krusning.startQuick(a); }
      else if (mode === 'daily') {
        const d = new Date(Date.UTC(...Pool.daily.start.split('-').map((v, i) => i === 1 ? v - 1 : +v)) + a * 86400000);
        Krusning.G.fakeToday = d.toISOString().slice(0, 10);
        Krusning.startDaily(Krusning.G.fakeToday);
      } else Krusning.startLevel(id);
    }, id);
    await page.waitForTimeout(150);
    const t0 = Date.now();
    let hintMs = 0, steps = 0, done = false;
    while (steps < 9) {
      // vent til vannet er rolig
      await page.waitForFunction(() => { const w = Krusning.G.world; return w.done || Engine.isSettled(w); }, null, { timeout: 20000 });
      if (await page.evaluate(() => Krusning.G.world.done)) { done = true; break; }
      const h0 = Date.now();
      await page.click('#btnHint');
      await page.waitForFunction(() => !Krusning.G.hintBusy, null, { timeout: 30000 });
      hintMs = Math.max(hintMs, Date.now() - h0);
      const hint = await page.evaluate(() => Krusning.G.hint);
      if (!hint) break;
      await page.evaluate(([x, y]) => Krusning.playerTap(x, y), [hint.x, hint.y]);
      steps++;
      await page.waitForTimeout(100);
    }
    if (!done) done = await page.evaluate(() => Krusning.G.world.done);
    let winShown = false;
    if (done) {
      await page.waitForTimeout(1300);
      winShown = await page.evaluate(() => !document.getElementById('win').hidden);
    }
    const r = await page.evaluate((id) => {
      const [mode, a] = id.split(':');
      const s = Krusning.save();
      if (mode === 'quick') return Krusning.G.entry.done ? { stars: Krusning.G.entry.stars } : null;
      if (mode === 'daily') return s.daily[Krusning.G.fakeToday] || null;
      return s.levels[id] || null;
    }, id);
    const ok = done && winShown && r;
    if (!ok) fails++;
    console.log(`${ok ? '✔' : '✘'} ${id}: ${done ? 'fullført' : 'IKKE fullført'} med ${steps} hint-trykk` +
      `${r ? ` (★${r.stars})` : ''}, resultatskjerm ${winShown ? 'ja' : 'nei'}, tregeste hint ${hintMs} ms, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  console.log(errors.length ? 'Feil i konsollen:\n' + errors.join('\n') : 'Ingen feil i konsollen ✔');
  console.log(fails ? `${fails} bane(r) feilet` : 'Alle baner kan løses med hint ✔');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
