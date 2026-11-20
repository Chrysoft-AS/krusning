#!/usr/bin/env node
/* Krusning – skjermbilder og røyktest i ekte nettleser (Playwright/Chromium).
 * Bruk: node tools/shots.js [mappe]   (standard: ./shots)
 * Tar bilder av tittel, første bane, sikting, resultat og banekart,
 * og melder fra om feil i konsollen. */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const out = path.resolve(process.argv[2] || 'shots');
fs.mkdirSync(out, { recursive: true });
const file = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(file);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(out, '01-title.png') });

  // tap the water on the title (toy ripple)
  await page.mouse.click(195, 520);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(out, '02-title-ripple.png') });

  await page.click('#btnPlay');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(out, '03-level1.png') });

  // aim: press and hold behind the boat
  const toScreen = (x, y) => page.evaluate(([x, y]) => { const p = Render.toScreen(x, y); const r = document.getElementById('game').getBoundingClientRect(); return { x: p.x + r.left, y: p.y + r.top }; }, [x, y]);
  let p = await toScreen(178, 490);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '04-aim.png') });
  await page.mouse.up();
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(out, '05-ripple.png') });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: path.join(out, '06-win.png') });

  // level 1-6 (three boats) mid-motion
  await page.evaluate(() => Krusning.startLevel('1-6'));
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(out, '07-level6.png') });
  p = await toScreen(178, 331);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(out, '08-level6-motion.png') });

  // level with rock, logs, pads, whirl
  await page.evaluate(() => Krusning.startLevel('1-12'));
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(out, '09-level12.png') });

  await page.evaluate(() => Krusning.openMap(0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, '10-map.png') });
  await page.click('#worldNext');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '11-map-world2.png') });

  await page.click('#mapBack');
  await page.click('#btnSettings');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, '12-settings.png') });

  console.log(errors.length ? errors.join('\n') : 'Ingen feil i konsollen ✔');
  await browser.close();
})();
