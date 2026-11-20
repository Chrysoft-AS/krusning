#!/usr/bin/env node
/* =====================================================================
 * Krusning – bygg én selvstendig HTML-fil (for deling/publisering)
 * ---------------------------------------------------------------------
 * Leser index.html og bakes inn css/ og js/ slik at alt ligger i én fil:
 *   dist/krusning.html
 * Fila er laget for claude.ai-artefakter (uten <html>/<head>/<body>,
 * som legges til automatisk der). Til iOS-appen brukes index.html
 * og mappene direkte.
 *
 * Bruk:  node tools/build-artifact.js
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function between(s, a, b) {
  const i = s.indexOf(a), j = s.indexOf(b);
  if (i < 0 || j < 0) throw new Error('Fant ikke markørene ' + a + ' / ' + b);
  return s.slice(i + a.length, j);
}

let head = between(html, '<!-- ARTIFACT-HEAD-START -->', '<!-- ARTIFACT-HEAD-END -->');
let body = between(html, '<!-- ARTIFACT-BODY-START -->', '<!-- ARTIFACT-BODY-END -->');

head = head.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, f) =>
  '<style>\n' + fs.readFileSync(path.join(root, f), 'utf8') + '\n</style>');

body = body.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, f) => {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  if (src.includes('</script')) throw new Error(f + ' inneholder "</script" – kan ikke bakes inn');
  return '<script>\n' + src + '\n</script>';
});

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'krusning.html');
fs.writeFileSync(out, head.trim() + '\n' + body.trim() + '\n');
console.log('Skrev', path.relative(root, out), '(' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
