# Krusning

Et rolig fysikk-puslespill for iPhone. Du trykker på vannet, og krusningen dytter små papirbåter hjem til havna. Klar banen med så få krusninger som mulig: stjerner for par, perle for den smarteste løsningen.

**Spill demoen:** https://claude.ai/artifact/VjdAsuYzoDAdbjBLxqtv1q
**Kildekode:** https://github.com/Chrysoft-AS/krusning
Åpne lenken på iPhonen (logget inn på claude.ai). Slå av lydløs-bryteren for å få lyd. Fremgangen lagres bare på den enheten du spiller på.

## Hva som er med i demoen

- 17 baner fordelt på to verdener: **Dammen** (12) og **Bekken** (5). Bekken åpnes med 24 stjerner.
- Stjerner, perler, rekorder og banekart. Alt lagres lokalt.
- Siktehjelp (hold fingeren på vannet), hint-knapp, norsk og engelsk.
- Rolig musikk og lydeffekter laget i sanntid, uten lydfiler.

## Mappene

| Fil | Hva den gjør |
|---|---|
| `index.html` | Selve spillet. Kan åpnes direkte i en nettleser. |
| `js/levels.js` | Alle banene, som enkle tall. |
| `js/engine.js` | Fysikken. |
| `js/render.js`, `css/style.css` | Hvordan spillet ser ut. |
| `js/audio.js` | Lyd og musikk. |
| `js/strings.js` | All tekst (norsk og engelsk). |
| `js/game.js` | Menyer, stjerner, perler, lagring og hint. |
| `tools/` | Verktøy som tester banene automatisk og tar skjermbilder. |
| `DESIGN.md` | Spilldesignet: hvorfor spillet er laget slik, og veien videre. |
| `CLAUDE.md` | Instruksjoner som Claude Code leser automatisk. |

## Jobbe videre med Claude Code

Åpne mappen i Claude Code og beskriv hva du vil ha. Eksempler:

- «Lag bane 1-13: to båter må gjennom en smal åpning mellom to steiner. Par 2, perle 1. Test den.»
- «Bane 1-8 er for lett. Gjør perla vanskeligere, men ikke umulig.»
- «Lag verden 3 Regnværet: regndråper som lager små krusninger i et fast mønster.»
- «Lag en baneeditor der jeg kan dra båter, steiner og havner rundt og prøve banen.»
- «Legg til Dagens dam: en ny bane hver dag og en knapp for å dele resultatet.»
- «Publiser en ny versjon av demoen til samme lenke.»

Claude tester banene selv med `tools/solve.js` og `tools/playtest.js`, og ser på skjermbilder med `tools/shots.js`. Du får beskjed om noe ikke stemmer.

## Til App Store

Spillet er skrevet med vanlig nettteknologi og pakkes som iOS-app med **Capacitor** til slutt. Du trenger:

1. En Mac med Xcode (gratis).
2. Apple Developer Program (99 USD per år) for å legge ut appen.
3. Be Claude Code: «Gjør klar Krusning for iPhone med Capacitor.» Det eneste du gjør selv er å velge konto («Team») i Xcode og trykke ▶ med telefonen koblet til.

Samme kode kan senere bli Android-app og nettspill, slik at flere kan spille.

## Kommandoer (for den som vil)

```bash
node tools/solve.js            # test alle baner
node tools/solve.js 1-4 --map  # test én bane og tegn den
node tools/playtest.js         # spill gjennom alt i en nettleser (krever Playwright)
node tools/shots.js shots      # skjermbilder til mappen shots/
node tools/build-artifact.js   # bygg dist/krusning.html (én fil)
```
