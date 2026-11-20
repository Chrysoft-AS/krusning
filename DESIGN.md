# Krusning – spilldesign

> Du trykker på vannet. Krusningen dytter små papirbåter bort fra der du trykket.
> Få alle båtene i havn med så få krusninger som mulig.

Spill demoen: https://claude.ai/artifact/VjdAsuYzoDAdbjBLxqtv1q

---

## 1. Hvorfor dette spillet

Målet er at flest mulig skal ville spille det. Derfor:

- **Én handling: trykk.** Forstås på noen sekunder uten tekst. Funker for barn og besteforeldre.
- **Rolig og koselig.** Ingen tidspress, ingen vold og ingen «game over». Avslappende puslespill er blant de største sjangrene på mobil.
- **Korte baner (10–40 sekunder).** Passer i en kø eller på bussen.
- **Helt lokalt.** Ingen konto, ingen server, virker i flymodus.
- **Ekte fysikk gir mange løsninger.** Starten er lett, men det er alltid en smartere løsning å finne.
- **Ingen bildefiler eller lydfiler.** Alt tegnes og lages med kode, så alt kan endres ved å beskrive det for en AI.

## 2. Mestringsløkken

Dette er hjertet i spillet: rask mestring, og så lyst til å bli bedre.

| Lag | Hva spilleren opplever | Hvorfor |
|---|---|---|
| **Fullfør** | Alle baner kan fullføres, uansett antall trykk. «I havn!» | Ingen står fast, alle får mestring |
| **★★★ (par)** | Klar banen på par-antall krusninger | Et tydelig mål som de fleste når |
| **Live-stjerner** | Stjernene i toppmenyen viser hva som fortsatt er mulig. Mister du en, rister den og «start på nytt»-knappen vipper | Gjør det fristende å prøve igjen *nå* |
| **Perle ◉** | Beste kjente løsning, ofte 1 færre enn par. Vises etter at du har klart banen: «Perle: klar det med 1 krusning. Det går an.» | «Dette mestret jeg, men jeg kan bli enda bedre» |
| **Stjerneport** | Verden 2 åpnes med 24 ★ av 36 | Noen må tilbake og forbedre seg, og det gir mening |
| **Perleport** | Perlebukta (hemmelig verden) åpnes med perler | Langsiktig mål for de ivrigste |
| **Hint** | Lyspæra viser et godt trykk regnet ut fra situasjonen akkurat nå | Ingen gir opp. Men perla kan bare tas uten hint |

Stjernegrenser: ★★★ ≤ par, ★★ ≤ par + halvparten av par (minst +1), ★ ellers.

## 3. Kontroll

**Hold fingeren på vannet** → piler på båtene viser retning og styrke.
**Slipp** → krusningen lages. Dra fingeren utenfor vannet for å avbryte. Raske trykk virker også.

Hvorfor: fingeren dekker det du trykker på. Pilene gjør presise trykk mulig på en liten skjerm, uten å vise hele banen båten vil ta.

## 4. Reglene (fysikken)

1. En krusning dytter alt den når rett bort fra der du trykket.
2. Jo nærmere, jo kraftigere. Ringen blekner i takt med kraften, så du ser hvor sterkt den treffer.
3. Båter spretter på bredden, steiner, stokker og på hverandre (biljard).
4. Havna drar litt i båter som kommer nær (tilgivende).
5. Alt er **deterministisk**: samme trykk gir alltid samme resultat. Det er rettferdig, og det gjør automatisk testing av banene mulig.

## 5. Verdener

| Verden | Ny mekanikk | Status |
|---|---|---|
| 1 · Dammen | trykk, retning, styrke, stein, flere båter, biljard, vannliljer, virvel | **12 baner i demoen** |
| 2 · Bekken | strøm som både hjelper og ødelegger | **5 baner i demoen** |
| 3 · Regnværet | regndråper lager egne krusninger i et fast mønster du kan lære og utnytte | idé |
| 4 · Natten | mørke vann: båtene har lykter, du ser bare det som er nær lys | idé |
| 5 · Isen | islagte felt uten friksjon, båtene glir langt | idé |
| 6 · Fjorden | tidevann og vind som skifter | idé |
| ◉ Perlebukta | hemmelige mesterbaner, åpnes med perler | idé |

Ekstra krydder som kan brukes i alle verdener: **fargede havner** (båten må til havna med samme farge), molo som stopper krusninger, bryter som åpner en sluse.

## 6. Prinsipper for banedesign

1. **Én ny idé per bane.** Lær den (tipsboble), test den, og kombiner til slutt.
2. **Første trykk i hver verden skal lykkes.** Ny mekanikk skal gi mestring før den gir motstand.
3. **Par skal nås med vanlig god spilling. Perla skal kreve innsikt, ikke flaks.** Banetesteren viser hvor stort «vinduet» for perla er. Under ca. 15 trykkpunkter blir det for mye flaks.
4. **Rytme:** vanskelig bane, så en lettere, så vanskelig igjen.
5. **Hver verden slutter med en finale** som kombinerer alt.

## 7. Verktøyene (hvorfor dette passer for en ikke-koder med AI)

- **Banene er bare data** i `js/levels.js` (posisjoner, par og perle).
- `node tools/solve.js` prøver tusenvis av trykk med den ekte fysikken. Den sier om banen kan løses, med hvor få trykk, og hvor lett perla er. `--map` tegner banen som tekst.
- `node tools/playtest.js` spiller alle banene i en ekte nettleser ved å følge hint-knappen.
- `node tools/shots.js` tar skjermbilder slik at AI kan se hvordan det ser ut.

Du kan altså be om «en ny bane der …», og AI-en kan bevise at banen virker før du ser den.

## 8. Grafikk og lyd

- **Papir på vann:** origamibåter i pastellfarger med ansikt (øynene følger krusningen og blir glade i havn), lysmønster i vannet, fisk som skvetter unna, blader som driver.
- **Lyd:** hvert trykk er en vanndråpe i en pentatonisk skala, så å trykke blir som å spille musikk. Klokkespill når båter kommer i havn, og stigende toner for hver båt. Rolig generert bakgrunnsmusikk.
- **Saftig respons:** sprut, kjølvann, gnister, konfetti og stjerner som spretter fram én etter én.

## 9. Grunner til å komme tilbake, uten server

- **Dagens dam:** en ny bane hver dag, laget med datoen som «frø», slik at alle får samme bane uten server. Resultatet deles som tekst, slik Wordle gjør: `🌊 Krusning #142 · 2 krusninger · ★★★ ◉`. Banen kontrolleres med samme løser som i `tools/`.
- **Game Center (valgfritt):** toppliste for antall perler. Bruker Apple-ID-en, så det trengs verken egen server eller innlogging.
- **iCloud-synk (valgfritt):** fremgang på tvers av iPhone og iPad.
- **Lokale varsler:** «Dagens dam er klar.»

## 10. Inntekt (forslag)

Gratis nedlasting med verden 1–2, og ett engangskjøp («Hele dammen», ca. 49 kr) for resten. Ingen reklame. Det gir gode anmeldelser og passer med at alt kjører lokalt (kjøpet går via Apple). Alternativ: helt gratis med frivillig «spander en kaffe».

## 11. Tilgjengelighet

Ingen tidspress og ingen lesing nødvendig, og spillet kan spilles med én hånd. Innstillingen «redusert bevegelse» respekteres. Kommer det fargede havner, skilles båtene også med mønster, ikke bare farge.

## 12. Hva som ikke er kopiert

Strukturen (korte baner, tre stjerner, verdener) er vanlig i sjangeren. Kjernen er egen: du styrer ting indirekte med krusninger, og kraft og retning kommer av hvor du trykker. Spillet bruker ingen figurer, navn eller grafikk fra andre spill.

## 13. Test demoen med andre

Gi telefonen til 5–10 personer uten å forklare noe, og se:

1. Skjønner de hva de skal gjøre innen 10 sekunder?
2. Hvilken bane gav «aha»? Hvilken var frustrerende?
3. Går de tilbake for å få flere stjerner eller perler? Spør hvorfor.
4. Hvor lenge spiller de før de vil slutte?
5. Spør: «Ville du lastet ned resten?»

Et sunt tegn er 1–3 omstarter per bane og at folk *selv* prøver igjen for å få perla.

## 14. Veikart

1. **Uke 1–2:** spilltest demoen og juster banene.
2. **Uke 3–6:** baneeditor i spillet (dra og slipp), så du kan lage baner uten kode. Gjør verden 2 og 3 ferdige (ca. 15 baner hver).
3. **Uke 7–8:** Dagens dam og deling, vibrasjon (haptikk), app-ikon.
4. **Uke 9–10:** pakk som iOS-app (Capacitor) og test med venner via TestFlight.
5. **Lansering:** App Store. Den samme koden kan senere bli Android- og nettversjon.
