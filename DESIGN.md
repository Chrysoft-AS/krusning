# Krusning – spilldesign

> Du trykker på vannet. Krusningen dytter små papirbåter bort fra der du trykket.
> Få alle båtene i havn med så få krusninger som mulig.

Spill demoen: https://claude.ai/artifact/VjdAsuYzoDAdbjBLxqtv1q

**Innhold:** 1 Hvorfor · 2 Mestringsløkken · 3 Kontroll · 4 Reglene · 5 Progresjon · 6 Spillmoduser · 7 Verdener og mekanikker · 8 Banedesign · 9 Båthuset (samling) · 10 Inntekt · 11 Grunner til å komme tilbake · 12 Verktøyene · 13 Grafikk og lyd · 14 Tilgjengelighet · 15 Hva som ikke er kopiert · 16 Spilltest · 17 Veikart · 18 Åpne valg

---

## 1. Hvorfor dette spillet

Målet er at flest mulig skal ville spille det. Derfor:

- **Én handling: trykk.** Forstås på noen sekunder uten tekst. Funker for barn og besteforeldre.
- **Rolig og koselig.** Ingen tidspress, ingen vold og ingen «game over». Avslappende puslespill er blant de største sjangrene på mobil.
- **Korte baner (10–40 sekunder).** Passer i en kø eller på bussen.
- **Helt lokalt.** Ingen konto, ingen server, virker i flymodus.
- **Ekte fysikk gir mange løsninger.** Starten er lett, men det er alltid en smartere løsning å finne.
- **Ingen bildefiler eller lydfiler.** Alt tegnes og lages med kode, så alt kan endres ved å beskrive det for en AI.

Lignende spill finnes (Tap The Water, Ripple Runner). Det som skiller Krusning ut er stjerner og perler, Dagens dam, båter med ansikt og papirstilen. Det skal vi bygge videre på.

## 2. Mestringsløkken

Dette er hjertet i spillet: rask mestring, og så lyst til å bli bedre.

| Lag | Hva spilleren opplever | Hvorfor |
|---|---|---|
| **Fullfør** | Alle baner kan fullføres, uansett antall trykk. «I havn!» | Ingen står fast, alle får mestring |
| **★★★ (par)** | Klar banen på par-antall krusninger | Et tydelig mål som de fleste når |
| **Live-stjerner** | Stjernene i toppmenyen viser hva som fortsatt er mulig. Mister du en, rister den og «start på nytt»-knappen vipper | Gjør det fristende å prøve igjen *nå* |
| **Perle ◉** | Beste kjente løsning, ofte 1 færre enn par. Vises etter at du har klart banen: «Perle: klar det med 1 krusning. Det går an.» | «Dette mestret jeg, men jeg kan bli enda bedre» |
| **Stjerneport** | Neste verden åpnes med ca. 60 % av stjernene så langt (se kap. 5) | Noen må tilbake og forbedre seg, og det gir mening |
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

---

## 5. Progresjon: nok til mange dager

### Målet

En vanlig spiller spiller 10–20 minutter om gangen, gjerne én eller to ganger om dagen. Spillet skal vare **minst to uker** for en slik spiller, og mye lenger for dem som jakter perler. Det får vi med tre lag som virker sammen:

| Lag | Hva | Hvor lenge det varer |
|---|---|---|
| **Stien** (hovedløpet) | 7 verdener × 15 baner = **105 baner** ved lansering, pluss **Perlebukta** (12 mesterbaner) | Første gjennomgang ca. 2 timer. Med stjerner og perler 4–6 timer |
| **Dagens dam** | Én ny bane hver dag, lik for alle | 3–5 minutter hver dag, uten slutt |
| **Rask runde** | Tilfeldige, testede brett i tre vanskelighetsgrader | Uten slutt |

Tallene for spilletid er anslag (ca. 1 minutt per bane første gang, med omstarter). De må sjekkes i spilltesten (kap. 16).

### Slik åpnes innholdet

- **Banene i en verden** åpnes én etter én når du klarer forrige. Fullført er nok, stjerner trengs ikke.
- **Neste verden** krever at finalen i verdenen før er klart, *og* et antall stjerner. Grensen er ca. 60 % av alle stjernene så langt. Med 15 baner (45 ★) per verden blir det:

| Verden | Stjerner som trengs | Av mulige |
|---|---|---|
| 2 | 27 | 45 |
| 3 | 54 | 90 |
| 4 | 81 | 135 |
| 5 | 108 | 180 |
| 6 | 135 | 225 |
| 7 | 162 | 270 |
| ◉ Perlebukta | 30 perler | 105 |

  Hvorfor 60 %: det er nok til at du *må* hente noen ekstra stjerner, men aldri så mye at du sitter fast. Hintet hjelper deg alltid til minst én stjerne.
- **Ingen energi, ingen ventetid, ingen liv.** Det passer ikke med et rolig spill, og det gir dårlige anmeldelser. Fart i progresjonen styres bare av stjerneportene og av at Dagens dam kommer én gang om dagen.

### Kurven inne i hver verden (15 baner)

| Bane | Rolle |
|---|---|
| 1–3 | **Lær** den nye mekanikken, med tipsboble. Første trykk skal lykkes |
| 4–9 | **Test** den. Litt vanskeligere for hver bane, men med «pustebaner» innimellom |
| 10–13 | **Kombiner** med mekanikker fra tidligere verdener |
| 14 | **Pustebane**: lett og morsom, gjerne med mange båter |
| 15 | **Finale** som bruker alt i verdenen |

### Stien som kart

Verdenene vises som en svingete sti langs en bekk fra dammen til fjorden, med en liten båt som markerer hvor du er. Det gir følelsen av en reise, og du ser hvor langt du har igjen. (I dag er det en side per verden. Den kan bli stående til stien er tegnet.)

---

## 6. Spillmoduser

| Modus | Hva | Gratis? | Prioritet |
|---|---|---|---|
| **Stien** | Hovedløpet med verdener, stjerner og perler | Verden 1–2 | Finnes (17 baner) |
| **Dagens dam** | Én bane per dag, lik for alle, delbart resultat | Ja | **Laget** (fase 1) |
| **Rask runde** | Tilfeldig testet brett, velg Lett / Middels / Vrien | Lett er gratis | **Laget** (fase 1) |
| **Bare vann** | Ingen mål. Trykk og lag musikk mens båtene flyter. For barn og for å slappe av | Ja | Liten, når det passer |
| **Perlebukta** | Mesterbaner for perlejegere | Fullversjon | Fase 4 |
| **Baneverkstedet** | Lag egne baner med dra og slipp, del dem som en kort kode | Fullversjon | Senere |

Vi lager **ikke** tidsløp eller modus med «game over». Det bryter med roen som er hele poenget.

### Rask runde – hvordan tilfeldige brett blir gode

Helt tilfeldige brett blir ofte enten umulige eller kjedelige. Derfor:

1. En **brettgenerator** (`js/gen.js`) lager et brett fra et tall («frø»). Samme frø gir alltid samme brett. Den bruker bare mekanikker spilleren allerede har møtt på Stien.
2. Et verktøy (`tools/gen.js`) lager tusenvis av brett **på forhånd** og kjører løseren på hvert av dem. Bare brett som kan løses, som har et rettferdig perlevindu og som ikke kan løses «ved et uhell», blir med.
3. De gode frøene lagres i en liten liste (`js/pool.js`) med par og perle. 3000 brett tar bare ca. 50 kB.
4. Spillet trekker neste brett fra lista. Hintet virker som før, fordi det regnes ut fra situasjonen.

Hvorfor ikke lage brett mens man spiller: løseren bruker 2–3 sekunder per bane på en kraftig maskin, og vi vil ikke ha venting eller dårlige brett på telefonen.

**Vanskelighet:** Lett = 1 båt, få hindringer, par 1–2. Middels = 1–2 båter, par 2–3. Vrien = 2–3 båter, flere mekanikker, par 3–4.
**Åpnes:** Lett er åpen fra start. Middels åpnes når bane 1-10 (virvelen) er klart, og Vrien når 2-1 (strømmen) er klart, slik at du har møtt mekanikkene først.
**Belønning:** stjerner og perler teller i en egen «Rask runde»-statistikk og gir «Rekke» (antall ★★★ på rad). De teller ikke mot stjerneportene, ellers kunne man hoppet over Stien.

### Dagens dam

- Hentes fra en egen, håndplukket liste med testede brett. Datoen bestemmer hvilket brett, så alle får samme bane uten server.
- **Uka har en rytme:** mandag lett, søndag vrien (slik som kryssord i aviser).
- Resultatet deles som tekst: `🌊 Krusning #142 · 2 krusninger · ★★★ ◉`
- En **kalender** viser dagene du har spilt med et lite stempel. Glemmer du en dag, skjer det ingenting vondt. Rekker gir nye båter i Båthuset (kap. 9).
- 730 brett holder i to år. Etter det lages flere med samme verktøy i en oppdatering.

---

## 7. Verdener og mekanikker (gradvis vanskeligere)

Hver verden legger til **én hovedmekanikk** og ofte én liten krydder. Rekkefølgen går fra det som er lett å forstå til det som krever planlegging.

| Verden | Ny mekanikk | Hva den gjør vanskeligere | Status |
|---|---|---|---|
| 1 · Dammen | trykk, retning, styrke, stein, stokk, flere båter, biljard, vannliljer, virvel | Sikte og styrke | **15 baner** |
| 2 · Bekken | **strøm** + **fargede havner** (båten må til havna med samme farge og merke) | Planlegge med noe som beveger seg, og sortere båter | **15 baner** |
| 3 · Fossen | **foss nedover** (båten glir ned til en lavere vannhøyde, men kommer aldri opp igjen, og krusninger når bare båter på samme høyde) og **foss ovenfra** (vann som faller ned dytter båter bort, og treffer båten midten, krasjer den) | Tenke i etasjer: hva må skje før båten går utfor? | **15 baner** |
| 4 · Regnværet | **regndråper** som faller på faste steder i fast takt og lager egne krusninger (takten starter på nytt ved hvert trykk), og **tunge båter** (lasteskuter) | Bruk regnet som et ekstra trykk, eller hold deg unna det | **15 baner** |
| 5 · Slusene | **moloer** som stopper båter og krusninger (skygge bak), **brytere** som åpner en **sluseport** når en båt (eller vannlilje) kjører over dem | Rekkefølge: gjør ting i riktig rekkefølge | **15 baner** |
| 6 · Natten | **frosker** som hopper når krusningen treffer dem og lager en ny krusning der de lander, og **mørke** (du ser bare nær lykter, båter og havner, og krusningene lyser opp vannet) | Kjedereaksjoner og å huske banen | **15 baner** |
| 7 · Isen | **glatt is** (båtene glir nesten uten å stoppe) og **vind** som blåser jevnt i faste felt | Små trykk og fin kontroll | **15 baner** |
| ◉ Perlebukta | ingen ny regel, alt kombinert | Perfekte løsninger | Ny |
| Senere: Fjorden | tidevann (steiner kommer og går), bølger | | Idé |

**Krydder som kan brukes overalt:**
- **Trykkesoner:** du kan bare trykke i solflekker eller utenfor sivet. Krever ingen ny fysikk, men gjør baner mye smartere. Innføres i verden 2.
- **Drivende stokker** som flyter med strømmen.
- **Ender** som svømmer i en fast rute (hindring i bevegelse), fra verden 3.

**Andre måter å skru opp vanskeligheten på** (uten ny mekanikk): flere båter, mindre plass rundt havna, strammere par, perle som krever biljard, færre trykkesoner.

**Hvorfor frosker og ikke noe annet i verden 6:** kjedereaksjoner gir de største «aha»-øyeblikkene i fysikkspill, og en frosk som hopper fra blad til blad er lett å forstå uten tekst.

Alle nye mekanikker må være deterministiske (fast mønster, ingen tilfeldighet), slik at løseren og hintet virker.

**To valg som ble tatt underveis (verden 4–7):**
- **Regnet går i takt med trykkene dine.** Første dråpe faller litt etter hvert trykk, og så i fast takt. Da blir resultatet det samme uansett hvor lenge du venter før du trykker, og hint-knappen treffer. Det passer også med at spillet ikke skal ha tidspress.
- **Vinden blåser jevnt i faste felt** (vist med striper), ikke i kast. Kast som kommer av seg selv ville flyttet båtene mens du tenker, og da kan verken løseren eller hintet regne riktig.
- Natten har innstillingen «Mer lys om natten».

---

## 8. Prinsipper for banedesign

1. **Én ny idé per bane.** Lær den (tipsboble), test den, og kombiner til slutt.
2. **Første trykk i hver verden skal lykkes.** Ny mekanikk skal gi mestring før den gir motstand.
3. **Par skal nås med vanlig god spilling. Perla skal kreve innsikt, ikke flaks.** Banetesteren viser hvor stort «vinduet» for perla er. Under ca. 15 trykkpunkter blir det for mye flaks.
4. **Rytme:** vanskelig bane, så en lettere, så vanskelig igjen.
5. **Hver verden slutter med en finale** som kombinerer alt.
6. **Par stiger sakte:** verden 1 har par 1–3, verden 6 har par 2–5. Over 5 krusninger blir det slitsomt å prøve igjen.

## 9. Båthuset (samling)

Et lite rom der båtene du har samlet ligger fortøyd. Du velger hvilken båt som er «din» i spillet. Alle har ansikt og egen personlighet (måten de blunker og smiler på).

| Båt | Får du ved |
|---|---|
| Papirbåt (start) | – |
| Avisbåt, kartbåt, notearkbåt … | å fullføre hver verden |
| Gullbåt | 30 perler |
| Lanterneskute | 7 dager med Dagens dam |
| Svanebåt | 30 dager med Dagens dam |
| Pakker med ekstra båter | kjøp (kap. 10), valgfritt |

Hvorfor: det gir et synlig mål utenom stjernene, og det gir en naturlig ting å selge senere uten å gjøre spillet dårligere for dem som ikke betaler. Båtene er bare utseende. De endrer ikke fysikken.

---

## 10. Inntekt

### Alternativene

| Modell | Fordel | Ulempe | Passer for Krusning? |
|---|---|---|---|
| **A. Gratis prøve + ett engangskjøp** («Hele dammen») | Ærlig, ingen reklame, gode anmeldelser. Kjøpet går via Apple, så ingen server | Bare noen få prosent kjøper | **Ja – anbefalt** |
| B. Reklame (bannere, videoer mellom baner) | Alle spillere gir litt inntekt | Ødelegger roen. Reklame-SDK sender data over nett og gir Apples sporingsspørsmål. Bryter regelen om at alt er lokalt | Nei |
| C. Betalt app (koster før nedlasting) | Enkelt | Langt færre laster ned. Vanskelig for et ukjent spill | Nei |
| D. Abonnement | Jevn inntekt | Folk vil ikke abonnere på et lite puslespill | Nei |
| E. Kjøp av hint eller «liv» | Vanlig i sjangeren | Gjør spillet gnient og frustrerende | Nei |
| F. Kosmetikk (båtpakker, dammfarger, musikk) | Ingen påvirkning på spillet | Lite inntekt alene | **Ja, som tillegg senere** |
| G. Apple Arcade | Apple betaler for spillet | Apple velger få spill, krever ferdig og polert spill | Kanskje, etter lansering |

### Anbefaling

**Gratis å laste ned. Ett engangskjøp «Hele dammen» til 49 kr.**

| Gratis | Med «Hele dammen» |
|---|---|
| Verden 1 og 2 (30 baner) | Verden 3–6 og alle nye verdener som kommer |
| Dagens dam, hver dag | Perlebukta |
| Rask runde: Lett | Rask runde: Middels og Vrien |
| Bare vann | Baneverkstedet (når det kommer) |
| Båthuset (båtene du tjener) | |

Hvorfor: Dagens dam er gratis, så folk har en grunn til å åpne spillet hver dag. Etter et par uker har de lyst på mer, og da er kjøpet lite og engangs. Familiedeling slås på, så hele familien får det.

Senere kan vi legge til **båtpakker (ca. 15–25 kr)** og en **«spander en kaffe»**-knapp. De skal aldri være nødvendige.

### Ærlige tall

Apple tar 15 % (småbedriftsprogrammet). Hvis 10 000 laster ned og 3 % kjøper, blir det ca. 12 500 kr. Med 100 000 nedlastinger ca. 125 000 kr. Apple Developer Program koster ca. 1 100 kr per år. Det meste avhenger av om spillet blir funnet: gode skjermbilder og video i App Store, en kort video for TikTok/Reels av en tilfredsstillende biljard-løsning, og Dagens dam-resultater som folk deler.

## 11. Grunner til å komme tilbake, uten server

- **Dagens dam** med kalender og delbart resultat (kap. 6).
- **Båthuset:** nye båter for rekker og perler (kap. 9).
- **Lokale varsler** (valgfritt, av som standard): «Dagens dam er klar.» Høyst én om dagen.
- **Game Center (valgfritt):** toppliste for antall perler. Bruker Apple-ID-en, så det trengs verken egen server eller innlogging.
- **iCloud-synk (valgfritt):** fremgang på tvers av iPhone og iPad.
- **Oppdateringer med ny verden** hver 1–2 måned etter lansering.

---

## 12. Verktøyene (hvorfor dette passer for en ikke-koder med AI)

- **Banene er bare data** i `js/levels.js` (posisjoner, par og perle).
- `node tools/solve.js` prøver tusenvis av trykk med den ekte fysikken. Den sier om banen kan løses, med hvor få trykk, og hvor lett perla er. `--map` tegner banen som tekst.
- `node tools/playtest.js` spiller alle banene i en ekte nettleser ved å følge hint-knappen.
- `node tools/shots.js` tar skjermbilder slik at AI kan se hvordan det ser ut.
- **Nytt:** `node tools/gen.js` lager og tester brett for Rask runde og Dagens dam.

Du kan altså be om «en ny bane der …», og AI-en kan bevise at banen virker før du ser den.

## 13. Grafikk og lyd

- **Papir på vann:** origamibåter i pastellfarger med ansikt (øynene følger krusningen og blir glade i havn), lysmønster i vannet, fisk som skvetter unna, blader som driver.
- **Hver verden har egen stemning:** sommerdam, bekk i skogen, grått regn, mørk natt med lykter, blå is.
- **Lyd:** hvert trykk er en vanndråpe i en pentatonisk skala, så å trykke blir som å spille musikk. Klokkespill når båter kommer i havn, og stigende toner for hver båt. Rolig generert bakgrunnsmusikk, med egen toneart per verden.
- **Saftig respons:** sprut, kjølvann, gnister, konfetti og stjerner som spretter fram én etter én.

## 14. Tilgjengelighet

Ingen tidspress og ingen lesing nødvendig, og spillet kan spilles med én hånd. Innstillingen «redusert bevegelse» respekteres. Fargede havner skilles også med mønster (prikker, striper, ruter), ikke bare farge. Natten har en innstilling for litt mer lys.

## 15. Hva som ikke er kopiert

Strukturen (korte baner, tre stjerner, verdener, dagens oppgave) er vanlig i sjangeren. Kjernen er egen: du styrer ting indirekte med krusninger, og kraft og retning kommer av hvor du trykker. Spillet bruker ingen figurer, navn eller grafikk fra andre spill. Navnet er «Krusning» også internasjonalt, aldri «Ripple».

## 16. Spilltest

Gi telefonen til 5–10 personer uten å forklare noe, og se:

1. Skjønner de hva de skal gjøre innen 10 sekunder?
2. Hvilken bane gav «aha»? Hvilken var frustrerende?
3. Går de tilbake for å få flere stjerner eller perler? Spør hvorfor.
4. Hvor lenge spiller de før de vil slutte? (Sjekker anslaget i kap. 5.)
5. Spør: «Ville du betalt 49 kr for resten?»
6. Etter en uke: åpnet de Dagens dam igjen uten å bli minnet på det?

Et sunt tegn er 1–3 omstarter per bane og at folk *selv* prøver igjen for å få perla.

## 17. Veikart

Hver fase gir noe som kan spilles og testes med en gang.

1. **Fase 1 – Daglig innhold:** brettgenerator, `tools/gen.js`, Dagens dam (med kalender og deling) og Rask runde (Lett/Middels/Vrien). Ny lagring (versjon 2) som tar vare på gammel fremgang. *Spilltest demoen med 5–10 personer etterpå.*
2. **Fase 2 – Stien:** verden 1 og 2 opp til 15 baner hver, fargede havner, ny verden 3 «Fossen», nye stjerneporter og finale-krav. **Laget.** Gjenstår: trykkesoner og stikart.
3. **Fase 3 – Nye mekanikker:** Regnværet, Slusene, Natten og Isen med 15 baner hver. **Laget.** (Midlertidig knapp «Test: velg bane» på tittelskjermen; `DEV_JUMP` i `game.js` settes til `false` før lansering.)
4. **Fase 4 – Dybde:** Perlebukta og Båthuset.
5. **Fase 5 – App:** iOS-app med Capacitor, engangskjøp via Apple, haptikk, app-ikon, TestFlight med venner.
6. **Lansering** i App Store. Etterpå: ny verden hver 1–2 måned, Baneverkstedet, Android.

## 18. Valg som er tatt

Jonathan godkjente 20. november 2026: engangskjøp 49 kr med verden 1–2 gratis, ferdig testede brett i Rask runde, Dagens dam og Rask runde først, og rekkefølgen på mekanikkene. Samme dag kom fossen inn som verden 3 (Jonathans idé), og de andre verdenene ble flyttet ett hakk.
