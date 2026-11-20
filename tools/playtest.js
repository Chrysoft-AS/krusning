#!/usr/bin/env node
/* Krusning – automatisk gjennomspilling i ekte nettleser.
 * Spiller hver bane ved å trykke der hint-knappen peker, og sjekker at
 * banen blir fullført, at resultatskjermen dukker opp og at fremgang lagres.
 * Bruk: node tools/playtest.js [bane-id ...] */
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
  const ids = process.argv.slice(2).length ? process.argv.slice(2)
    : await page.evaluate(() => Levels.WORLDS.flatMap((w) => w.levels.map((l) => l.id)));

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
    await page.evaluate((id) => Krusning.startLevel(id), id);
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
    const r = await page.evaluate((id) => Krusning.save().levels[id] || null, id);
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
