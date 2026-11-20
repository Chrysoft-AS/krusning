/* =====================================================================
 * Krusning – baner
 * ---------------------------------------------------------------------
 * Dette er fila du (eller AI) oftest endrer. Hver bane er bare data.
 *
 * Dammen er 360 bred og 600 høy. (0,0) er øverst til venstre.
 *   boats:  båter            { x, y }            (color: valgfri farge-indeks)
 *   docks:  havner           { x, y }            (color: kun båt med samme farge)
 *   rocks:  steiner          { x, y, r }
 *   logs:   tømmerstokker    { x1, y1, x2, y2, r }
 *   pads:   vannliljer       { x, y, r }         (flytbare, tunge)
 *   whirls: strømvirvler     { x, y, r, power }  (suger båter ned)
 *   currents: strøm          { x, y, w, h, vx, vy }
 *   par:    antall krusninger for ★★★
 *   pearl:  beste løsning vi kjenner (gir perle)
 *   hand:   viser en animert hånd (kun i første bane)
 *
 * Etter endringer: kjør `node tools/solve.js <bane-id>` for å sjekke
 * at banen kan løses og at par/perle/hint stemmer.
 * ===================================================================== */
(function (root) {
  'use strict';

  const WORLDS = [
    {
      id: 1,
      name: { no: 'Dammen', en: 'The Pond' },
      blurb: { no: 'Rolig vann. Lær deg krusningene.', en: 'Calm water. Learn the ripples.' },
      unlockStars: 0,
      levels: [
        {
          id: '1-1',
          name: { no: 'Første krusning', en: 'First ripple' },
          tip: { no: 'Trykk på vannet like bak båten', en: 'Tap the water just behind the boat' },
          par: 1, pearl: 1,
          boats: [{ x: 180, y: 430 }],
          docks: [{ x: 180, y: 220 }],
          hand: { x: 180, y: 480 },
        },
        {
          id: '1-2',
          name: { no: 'Bort fra ringen', en: 'Away from the ring' },
          tip: { no: 'Krusningen dytter båten bort fra der du trykker', en: 'Ripples push boats away from where you tap' },
          par: 1, pearl: 1,
          boats: [{ x: 110, y: 330, angle: 0 }],
          docks: [{ x: 270, y: 330 }],
        },
        {
          id: '1-3',
          name: { no: 'Sikt og slipp', en: 'Aim and release' },
          tip: { no: 'Hold fingeren på vannet for å sikte. Slipp for å lage krusning', en: 'Hold your finger on the water to aim. Release to make a ripple' },
          par: 2, pearl: 1,
          boats: [{ x: 90, y: 470 }],
          docks: [{ x: 262, y: 185 }],
        },
        {
          id: '1-4',
          name: { no: 'To båter', en: 'Two boats' },
          tip: { no: 'Én krusning dytter alle båtene den når', en: 'One ripple pushes every boat it reaches' },
          par: 2, pearl: 1,
          boats: [{ x: 125, y: 320, angle: Math.PI }, { x: 235, y: 320, angle: 0 }],
          docks: [{ x: 42, y: 320 }, { x: 318, y: 320 }],
        },
        {
          id: '1-5',
          name: { no: 'Steinen', en: 'The rock' },
          tip: { no: 'Båter spretter av stein og bredd', en: 'Boats bounce off rocks and the shore' },
          par: 2, pearl: 1,
          boats: [{ x: 100, y: 480 }],
          rocks: [{ x: 132, y: 378, r: 32 }],
          docks: [{ x: 100, y: 255 }],
        },
        {
          id: '1-6',
          name: { no: 'Tre små båter', en: 'Three little boats' },
          par: 2, pearl: 1,
          boats: [{ x: 180, y: 268 }, { x: 135, y: 346 }, { x: 225, y: 346 }],
          docks: [{ x: 180, y: 135 }, { x: 46, y: 398 }, { x: 314, y: 398 }],
        },
        {
          id: '1-7',
          name: { no: 'Kanalen', en: 'The canal' },
          par: 2, pearl: 1,
          boats: [{ x: 150, y: 495 }],
          logs: [
            { x1: 140, y1: 220, x2: 140, y2: 410, r: 9 },
            { x1: 220, y1: 220, x2: 220, y2: 410, r: 9 },
          ],
          docks: [{ x: 180, y: 170 }],
        },
        {
          id: '1-8',
          name: { no: 'Biljard', en: 'Billiards' },
          tip: { no: 'Båter kan dytte hverandre', en: 'Boats can push each other' },
          par: 3, pearl: 2,
          boats: [{ x: 180, y: 520 }, { x: 180, y: 380 }],
          rocks: [{ x: 90, y: 300, r: 26 }, { x: 270, y: 300, r: 26 }],
          docks: [{ x: 180, y: 110 }, { x: 70, y: 470 }],
        },
        {
          id: '1-9',
          name: { no: 'Vannliljene', en: 'Lily pads' },
          tip: { no: 'Vannliljer er tunge, men de kan flyttes', en: 'Lily pads are heavy, but they can be moved' },
          par: 3, pearl: 2,
          boats: [{ x: 180, y: 500 }],
          pads: [
            { x: 180, y: 300, r: 28, flower: true },
            { x: 118, y: 285, r: 24 },
            { x: 242, y: 285, r: 24 },
          ],
          docks: [{ x: 180, y: 120 }],
        },
        {
          id: '1-10',
          name: { no: 'Virvelen', en: 'The whirlpool' },
          tip: { no: 'Unngå virvelen – den drar båter ned', en: 'Avoid the whirlpool – it pulls boats under' },
          par: 2, pearl: 1,
          boats: [{ x: 110, y: 430 }],
          whirls: [{ x: 180, y: 300, r: 65, power: 1 }],
          docks: [{ x: 260, y: 190 }],
        },
        {
          id: '1-11',
          name: { no: 'Fire hjørner', en: 'Four corners' },
          par: 3, pearl: 1,
          boats: [{ x: 147, y: 267 }, { x: 213, y: 267 }, { x: 147, y: 333 }, { x: 213, y: 333 }],
          rocks: [{ x: 180, y: 120, r: 22 }, { x: 180, y: 480, r: 22 }],
          docks: [{ x: 70, y: 190 }, { x: 290, y: 190 }, { x: 70, y: 410 }, { x: 290, y: 410 }],
        },
        {
          id: '1-12',
          name: { no: 'Storfangst', en: 'Big catch' },
          par: 3, pearl: 2,
          boats: [{ x: 130, y: 470 }, { x: 230, y: 470 }, { x: 180, y: 330 }],
          pads: [{ x: 110, y: 200, r: 22, flower: true }, { x: 250, y: 200, r: 22 }],
          whirls: [{ x: 180, y: 195, r: 55, power: 1 }],
          docks: [{ x: 40, y: 470 }, { x: 320, y: 470 }, { x: 180, y: 90 }],
        },
      ],
    },
    {
      id: 2,
      name: { no: 'Bekken', en: 'The Brook' },
      blurb: { no: 'Strømmen tar båtene med seg.', en: 'The current carries the boats.' },
      unlockStars: 24,
      levels: [
        {
          id: '2-1',
          name: { no: 'Strømmen', en: 'The current' },
          tip: { no: 'Strømmen tar båten med seg. Få den uti!', en: 'The current carries the boat. Get it in!' },
          par: 1, pearl: 1,
          boats: [{ x: 295, y: 440, angle: Math.PI }],
          currents: [{ x: 140, y: 150, w: 80, h: 420, vx: 0, vy: -85 }],
          logs: [
            { x1: 124, y1: 212, x2: 156, y2: 150, r: 7 },
            { x1: 236, y1: 212, x2: 204, y2: 150, r: 7 },
          ],
          docks: [{ x: 180, y: 100 }],
        },
        {
          id: '2-2',
          name: { no: 'Over bekken', en: 'Across the brook' },
          tip: { no: 'Sikt litt mot strømmen når du skal krysse', en: 'Aim a little upstream to cross' },
          par: 2, pearl: 1,
          boats: [{ x: 90, y: 405 }],
          currents: [{ x: 0, y: 255, w: 360, h: 95, vx: 100, vy: 0 }],
          docks: [{ x: 110, y: 195 }],
        },
        {
          id: '2-3',
          name: { no: 'Virvelfella', en: 'Whirlpool trap' },
          par: 2, pearl: 1,
          boats: [{ x: 80, y: 140, angle: 0 }],
          currents: [{ x: 140, y: 60, w: 80, h: 390, vx: 0, vy: 90 }],
          whirls: [{ x: 180, y: 505, r: 62, power: 1.1 }],
          docks: [{ x: 280, y: 150 }],
        },
        {
          id: '2-4',
          name: { no: 'Veiskillet', en: 'The fork' },
          par: 2, pearl: 1,
          tip: { no: 'Velg riktig side av steinen', en: 'Pick the right side of the rock' },
          boats: [{ x: 298, y: 95, angle: Math.PI }],
          rocks: [{ x: 180, y: 310, r: 38 }],
          currents: [
            { x: 120, y: 40, w: 120, h: 220, vx: 0, vy: 85 },
            { x: 95, y: 260, w: 85, h: 80, vx: -65, vy: 65 },
            { x: 180, y: 260, w: 85, h: 80, vx: 65, vy: 65 },
            { x: 40, y: 340, w: 95, h: 230, vx: 0, vy: 80 },
            { x: 225, y: 340, w: 95, h: 230, vx: 0, vy: 80 },
          ],
          whirls: [{ x: 272, y: 515, r: 50, power: 1.2 }],
          docks: [{ x: 88, y: 520 }],
        },
        {
          id: '2-5',
          name: { no: 'Deltaet', en: 'The delta' },
          par: 4, pearl: 3,
          boats: [{ x: 85, y: 115 }, { x: 180, y: 95 }, { x: 275, y: 115 }],
          currents: [
            { x: 150, y: 140, w: 60, h: 300, vx: 0, vy: 90 },
            { x: 30, y: 300, w: 120, h: 60, vx: -70, vy: 0 },
            { x: 210, y: 300, w: 120, h: 60, vx: 70, vy: 0 },
          ],
          rocks: [{ x: 180, y: 470, r: 26 }],
          docks: [{ x: 52, y: 470 }, { x: 180, y: 545 }, { x: 308, y: 470 }],
        },
      ],
    },
    { id: 3, name: { no: 'Regnværet', en: 'The Rain' }, blurb: { no: 'Regndråper lager egne krusninger.', en: 'Raindrops make ripples of their own.' }, soon: true, levels: [] },
    { id: 4, name: { no: 'Natten', en: 'The Night' }, blurb: { no: 'Lykter i mørket.', en: 'Lanterns in the dark.' }, soon: true, levels: [] },
    { id: 5, name: { no: 'Perlebukta', en: 'Pearl Bay' }, blurb: { no: 'Hemmelige baner for perlejegere.', en: 'Secret levels for pearl hunters.' }, soon: true, unlockPearls: 10, levels: [] },
  ];

  const api = { WORLDS };
  root.Levels = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
