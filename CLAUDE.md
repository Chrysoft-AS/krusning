# CLAUDE.md – slik jobber du med Krusning

Brukeren er **ikke programmerer** og skriver norsk. Svar på norsk med enkle ord. Vis resultatet: et skjermbilde, en lenke eller en kort forklaring av hva som er endret. Gjør selv det du kan, og spør bare når brukeren må ta et valg.

## Hva prosjektet er

Et rolig fysikk-puslespill for iPhone, laget i ren HTML5/JavaScript (ingen rammeverk, ingen byggesteg). Du trykker på vannet, og krusninger dytter papirbåter til havna. Les `DESIGN.md` for spilldesignet.

```
index.html          siden (HUD, menyer, kort)  – åpnes direkte i nettleser
css/style.css       utseende på menyer og knapper
js/engine.js        fysikk – deterministisk, uten DOM, uten tilfeldighet
js/levels.js        ALLE baner som data (den fila som endres oftest)
js/gen.js           brettgenerator for Rask runde og Dagens dam (frø → brett)
js/pool.js          ferdig testede frø (LAGES av tools/gen.js, ikke rediger)
js/stryket.js       Stryket (elvestryk): egen modus, simulering + baner (deterministisk, uten DOM)
js/render.js        tegning på canvas (dam, båter, krusninger, effekter)
js/audio.js         syntetisert lyd og musikk (Web Audio, ingen lydfiler)
js/strings.js       all tekst, norsk + engelsk
js/game.js          skjermer, input, stjerner/perler, lagring, hint
tools/solve.js      banetester: finner minste antall trykk, sjekker par/perle
tools/stryk.js      banetester for Stryket (en robot spiller banene)
tools/gen.js        lager og tester brett til Rask runde og Dagens dam → js/pool.js
tools/worldgen.js   lager og tester forslag til nye verdener på Stien (blandingsverdener)
tools/playtest.js   spiller alle baner i ekte nettleser (følger hint-knappen)
tools/shots.js      skjermbilder av alle skjermer (iPhone-størrelse)
tools/build-artifact.js   bygger dist/krusning.html (én fil) for deling
```

## Faste regler

1. **Alt kjører lokalt.** Ingen server, ingen innlogging, ingen nettverkskall. Eneste unntak er Google Fonts i nettversjonen, og den fonten skal pakkes inn i iOS-appen.
2. **`engine.js` skal være deterministisk.** Ingen `Math.random`, ingen tid fra klokka og ingen DOM. Samme trykk skal alltid gi samme resultat, ellers slutter løseren og hint-systemet å virke.
3. **Etter endringer i baner eller fysikk:** kjør `node tools/solve.js <bane-id>`, og hele `node tools/solve.js` før publisering. Konstantene i `Engine.C` påvirker *alle* baner, også brettene i Rask runde og Dagens dam.
   **Endrer du `Engine.C` eller `js/gen.js`:** øk `VERSION` i `gen.js` og kjør `node tools/gen.js --fresh` (tar 1–2 timer). Ellers stemmer ikke par/perle i `pool.js`. Merk at Dagens dam da endres for alle.
4. **Etter endringer i grafikk eller menyer:** kjør `node tools/shots.js shots` og se på bildene. Kjør `node tools/playtest.js` for å sjekke hele flyten (alle baner skal bli «✔»).
5. **All tekst ligger i `strings.js`** (både norsk og engelsk). Banenavn og tips ligger i `levels.js` som `{ no: '…', en: '…' }`.
6. **Kommentarer skrives på norsk, og enkelt.** Ingen nye avhengigheter eller byggeverktøy uten god grunn.
7. **Lagring** går gjennom `save`/`persist()` i `game.js` (localStorage, nøkkel `krusning.save.v2`; v1 hentes inn automatisk). Endrer du formatet, må du øke versjonen og ta vare på gammel fremgang (se `upgrade()`).

## Ny bane

1. Legg et objekt i riktig verden i `js/levels.js`. Dammen er 360 × 600 enheter, med (0,0) øverst til venstre. Båtradius er 13, havneradius 24.
2. Hold minst ca. 50 enheters avstand mellom en båt og en havn ved start, ellers trekker havna båten inn med en gang. Båter skal heller ikke starte i strøm, i vind eller innenfor rekkevidden til en regndråpe (de flytter seg før spilleren gjør noe). Med tømmer i elva viser løseren også hvor lange åpningene mellom stokkene er.
3. `node tools/solve.js <id> --map` viser hvor ett trykk løser banen (`*`). Sett `pearl` til det minste antallet løseren finner, og `par` vanligvis én høyere.
4. Perla bør ha et vindu på minst ca. 15 trykkpunkter. Under 6 regnes som flaks, og løseren varsler da.
5. Kjør `node tools/playtest.js <id>`.

## Ny verden (blanding av mekanikker)

Spillet har ingen siste verden: nye verdener blander mekanikkene som finnes (se DESIGN.md kap. 7).
1. Legg til en oppskrift i `RECIPES` i `tools/worldgen.js` (hvilke grupper verdenen bruker).
2. `node tools/worldgen.js make <verden> 35` lager 35 testede forslag (tar 5–15 min). Hvert forslag er sjekket med løseren, og løsningen må bruke alle gruppene.
3. `node tools/worldgen.js pick <verden>` velger 15 baner fra lett til vanskelig og skriver dem ut som tekst til `levels.js`. Gi dem navn, og et tips på første bane.
4. Kjør `node tools/solve.js <verden>` og `node tools/playtest.js` på de nye banene. Bytt ut baner der hintet ikke klarer seg.
Forslagene lagres i `tools/out/` (ikke i git).

## Flere brett i Rask runde / Dagens dam

`node tools/gen.js quick medium 40` legger til 40 brett, `node tools/gen.js daily 60` legger til 60 dager. Verktøyet fortsetter der det slapp. `node tools/gen.js show M12` viser et brett som tekst. Dagens dam #1 er 20. november 2026; når lista er brukt opp, starter den forfra.

## Stryket (elvestryk)

Egen spillmodus, ikke koblet til Stien eller stjernene der. Elva ruller av seg selv, båten ligger fast nede på skjermen, og spilleren styrer sidelengs med krusninger. Baner, fysikk og konstanter ligger i `js/stryket.js` (`LEVELS`), tegningen i `R.drawStryk` i `render.js`, og skjerm/meny/lagring (`save.stryk`) i Stryket-delen av `game.js`.
- Alt i elva har en avstand `d` fra start og en `x`. Steiner, stokker og virvler gir krasj; elvebredden spretter bare. Etter krasj starter båten ved siste bøye (`checkpoints`).
- Stjerner: ingen krasj = 3, 1–2 krasj = 2, ellers 1. Perlene i elva er ekstra.
- Etter endringer: `node tools/stryk.js` (må gi ✔), `node tools/stryk.js --pearls` (alle perler skal kunne fanges) og `node tools/stryk.js --slow --se=1.4` (en treg robot som ser kort; S-1 bør klares, S-2 er ment å være vanskeligere).

## Midlertidig testknapp

`DEV_JUMP` i `js/game.js` viser «Test: velg bane» på tittelskjermen, så man kan hoppe til hvilken som helst bane. Den åpner også alle baner i Stryket. Sett den til `false` før lansering.

## Ny mekanikk

Legg simuleringen i `engine.js` (data inn via `createWorld`, oppførsel i `step`), tegningen i `render.js` og eventuell lyd i `audio.js`. Lag en innføringsbane med `tip`. Strøm (`currents`) er et godt eksempel på hele kjeden. Nye ting må ikke endre gamle baner: kjør gjerne en fast trykkrekke på alle baner før og etter, og sjekk at posisjonene blir helt like.

## Git

Repo: https://github.com/Chrysoft-AS/krusning (standardgren `main`). Kjør banetesten og gjennomspillingen før du committer endringer i baner eller fysikk. Bygg `dist/krusning.html` på nytt når spillet er endret, slik at demoen i repoet er oppdatert.

## Publisere demoen

```
node tools/build-artifact.js
```
Publiser deretter `dist/krusning.html` med Artifact-verktøyet til den samme lenken:
https://claude.ai/artifact/VjdAsuYzoDAdbjBLxqtv1q
(Fra en ny samtale: send lenken som `url`, og les artefakten først.)

## Til iPhone (Capacitor) – når brukeren er klar

Krever en Mac med Xcode og Apple Developer Program (99 USD/år).
1. `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/haptics @capacitor/preferences`
2. Lag et kopisteg som legger `index.html`, `css/` og `js/` i `www/`, og pakk inn Fredoka-fonten lokalt.
3. `npx cap init Krusning <app-id> --web-dir www`, deretter `npx cap add ios`, `npx cap sync`, `npx cap open ios`.
4. Bytt localStorage mot Preferences-pluginen (sikrere lagring), og legg til haptikk på trykk, i havn og ved stjerner.
5. Brukeren velger «Team» under Signing i Xcode og kjører på telefonen. Videre går det via TestFlight til App Store.
