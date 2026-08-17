# Oppgraderingsplan for nb-transcribe

Sist oppdatert: 17. august 2026

Denne planen dekker både applikasjonsrepoet `nb-transcribe` og driftsoppsettet i søsterrepoet `infra`. Målet er å modernisere løsningen uten å miste det som er viktigst i faktisk bruk: privat tilgang via Cloudflare Access, stabil GPU-transkribering og støtte for lange lydopptak på minst én time.

Planen er delt i faser som normalt bør passe i én arbeidsøkt eller én pull request per agent. Fasene er store nok til å gi meningsfulle leveranser, men avgrenset slik at en agent kan lese relevante filer, implementere, teste og dokumentere resultatet uten å fylle kontekstvinduet med hele moderniseringen samtidig.

## Premisser og eksplisitte avgrensninger

- Cloudflare Access beskytter løsningen, og bare eieren skal ha tilgang. Denne planen innfører derfor ikke et nytt brukersystem eller applikasjonsautentisering.
- Access-policyene må likevel dokumenteres og verifiseres som en del av driftsoppsettet, siden repoet ikke kan håndheve eller vise policyene som ligger i Cloudflare.
- Opplasting av lange lydfiler er et kjernekrav. En times lyd skal være et normalt testtilfelle, ikke et grensetilfelle som blokkeres av en vilkårlig maksimal filstørrelse.
- Ressursvern skal beskytte mot tom disk, korrupte eller dupliserte chunks og for mange samtidige GPU-jobber. Det skal ikke innføres lave størrelses- eller varighetsgrenser.
- GPU-maskinen har en NVIDIA GeForce RTX 3080 med 10 GB VRAM og driver 591.86. Alle modell- og CUDA-endringer må verifiseres på denne maskinen.
- Hemmeligheter i `infra/.env.desktop` skal aldri kopieres til logger, commits, agentprompter eller dokumentasjon.
- Hver fase bør lande med grønn test/build og en separat commit eller PR. Unngå å blande kosmetiske endringer inn i runtime-, modell- eller infrastrukturarbeid.

## Verifisert utgangspunkt

Gjennomgangen i august 2026 ga dette utgangspunktet:

- Backend består 30 av 30 tester i et rent Python-miljø.
- Frontend består 10 av 10 Jest-tester, lint og produksjonsbuild på dagens versjon når bygget har nettverkstilgang til Google Fonts.
- Begge repoene var rene og synkronisert med `origin/main` ved gjennomgangen.
- Docker Compose-filene kan parses, og alle forventede nøkler finnes i `infra/.env.desktop`.
- Docker-daemonen var ikke tilgjengelig under gjennomgangen. Faktisk containerstart ble derfor ikke verifisert.
- Modellen var ikke cachet lokalt, så en komplett transkripsjon ble ikke kjørt.
- Frontend bruker Next.js 15.4.10 og `node:20-alpine`. Node 20 er EOL.
- `npm audit --omit=dev` rapporterte fire funn med høy alvorlighetsgrad i produksjonstreet. En prøveoppgradering til Next 16.3.1 bygget og ga null produksjonsfunn, men krevde migrering av Jest og ESLint.
- Backendens eksisterende lokale `.venv` var gammel. En fersk resolver ga oppdaterte pakker uten kjente audit-funn, men `requirements.txt` tillater uventede majoroppgraderinger, blant annet fra Transformers 4.x til 5.x.
- `MODEL_ID` fra miljøet styrer ikke modellen. `transcribe.py` bruker hardkodet `NbAiLabBeta/nb-whisper-large`.
- Den stabile modellen `NbAiLab/nb-whisper-large` finnes nå og bør evalueres som erstatning for beta-/RC-modellen.
- `containrrr/watchtower` er arkivert og ikke lenger vedlikeholdt.

## Ønsket måltilstand

Når planen er gjennomført, bør løsningen ha følgende egenskaper:

1. Frontend kjører på en støttet Node LTS og en sikker Next.js-versjon.
2. Frontend og backend bygges deterministisk fra én låsefil per økosystem.
3. Valg av modell, modellrevisjon og ytelsesparametre styres eksplisitt fra konfigurasjon.
4. En times lyd kan lastes opp, gjenopptas ved nettverksfeil og transkriberes uten at hele lydfilen må ligge i minnet.
5. En deploy eller containerrestart mister ikke ferdige resultater, og avbrutte jobber får en forståelig status.
6. Modellcache og arbeidsdata ligger på bevisste volumer med opprydding og diskvern.
7. CI må passere tester, lint, audit og image-build før nye images publiseres.
8. Drift skjer uten utdatert Watchtower og uten ukontrollerte `latest`-oppgraderinger.
9. Dokumentasjonen beskriver den faktiske desktop-arkitekturen, Cloudflare Access og en komplett backup-/restore-/deployrutine.

## Anbefalt rekkefølge

Fase 0 bør gjøres først. Fase 1 og 2 kan gjennomføres uavhengig av hverandre. Fase 3 bygger på fase 2. Fase 4 bør bygge på fase 2 og helst fase 3. CI-fasen bør lande før større infraendringer slik at nye images har en pålitelig kvalitetsport.

```text
Fase 0: baseline og backup
  ├── Fase 1: frontend og Node
  └── Fase 2: backend-låsing og konfigurasjon
        └── Fase 3: modell, PyTorch og CUDA
              └── Fase 4: lange opplastinger og jobbrobusthet

Fase 1 + Fase 2 ──> Fase 5: CI og supply chain
Fase 3 + Fase 4 + Fase 5 ──> Fase 6: produksjonsinfra og deploy
Fase 6 ──> Fase 7: ende-til-ende-verifikasjon og dokumentasjon
```

## Fase 0 – Etabler baseline, testdata og rollback

**Mål:** Opprette et sikkert sammenligningsgrunnlag før avhengigheter, modell eller datalagring endres.

**Passende agentomfang:** Én kort til middels arbeidsøkt, hovedsakelig diagnostikk og dokumentasjon. Ingen funksjonelle endringer.

### Arbeid

- Start Docker på desktop-maskinen og registrer resultatet av:
  - `docker compose -f compose-desktop.yml --env-file .env.desktop ps -a`
  - container-health og relevante logger
  - `nvidia-smi`
  - diskplass på Docker- og modellcache-partisjonene
- Ta en verifisert backup av PostgreSQL-volumet før databaseskjema eller jobbtilstand endres.
- Dokumenter hvordan `transcribe-db-data-desktop` og `portainer-data-desktop` gjenopprettes.
- Lag eller velg tre ikke-sensitive testfiler:
  - 1–2 minutter for rask utvikling
  - 10–15 minutter for normaltest
  - omtrent 60 minutter for langtest
- Kjør dagens løsning ende til ende hvis den starter, og registrer:
  - filformat og filstørrelse
  - opplastingstid
  - tid til første jobbstatus
  - total transkripsjonstid
  - maksimal GPU-minnebruk
  - om resultatet lagres og kan hentes fra `/transcriptions`
- Noter dagens image-digests eller SHA-tags slik at rollback er mulig.

### Akseptansekriterier

- Backupfilen finnes utenfor containerens skrivbare lag og er testet med minst én restore eller integritetskontroll.
- Testfilene er tilgjengelige lokalt, men ikke committed dersom de inneholder privat tale eller er store.
- Baseline-resultatene er dokumentert i `docs/`, gjerne i en egen `baseline-2026.md`.
- Nåværende fungerende image-referanser er registrert for rollback.

### Ikke ta med i denne fasen

- Ikke oppgrader pakker.
- Ikke endre databasevolumer eller modell.
- Ikke skriv `.env.desktop` eller hemmelige verdier inn i rapporten.

## Fase 1 – Moderniser frontend, Node og frontend-container

**Mål:** Flytte frontenden til en støttet runtime med rent audit-resultat og et reproduserbart, mindre og sikrere image.

**Passende agentomfang:** Én middels til stor arbeidsøkt. Begrens oppgaven til `frontend/` og eventuelle frontend-jobber i CI.

### Arbeid

- Oppgrader til Node 24 LTS i Dockerfile og lokal dokumentasjon.
- Migrer fra Next.js 15.4 til Next.js 16.3 eller nyere kompatibel patchversjon.
- Oppgrader React/React DOM til versjonen som støttes av valgt Next-versjon.
- Erstatt `next lint` med ESLint CLI og flat config (`eslint.config.*`).
- Reparer Jest-integrasjonen for Next 16. Alle eksisterende tester skal fortsatt kjøre.
- Behold npm som pakkebehandler, siden Dockerfile og README allerede bruker npm.
- Fjern `pnpm-lock.yaml` når npm-låsefilen er verifisert. Det skal bare være én autoritativ frontend-låsefil.
- Bruk `npm ci` i Docker-build i stedet for `npm install`.
- Gjør Dockerfile til et flertrinnsbygg og kjør runtime som ikke-root-bruker.
- Vurder `output: "standalone"` i Next-konfigurasjonen for et mindre runtime-image.
- Selvhost Orbitron og Roboto på samme måte som de andre lokale fontene. Dette fjerner behovet for å kontakte Google under build.
- Reparer healthchecken. Dagens Compose bruker `curl`, men frontend-imaget installerer ikke curl. Bruk en kommando som faktisk finnes i runtime-imaget, eller en liten Node-basert healthcheck.

### Verifikasjon

Kjør minst:

```bash
npm ci
npm test -- --runInBand
npm run lint
npm run build
npm audit --omit=dev
```

Bygg deretter frontend-imaget og verifiser at det starter, svarer på `/`, kan registrere service worker og rapporteres som `healthy`.

### Akseptansekriterier

- Node-versjonen er en støttet LTS-versjon.
- `npm audit --omit=dev` rapporterer ingen kjente produksjonssårbarheter.
- Alle eksisterende frontendtester passerer.
- ESLint og TypeScript passerer uten ignorerte feil.
- Produksjonsbuild fungerer uten internettilgang etter at npm-pakkene er installert.
- Runtime-containeren kjører som ikke-root og healthchecken blir grønn.
- Bare `package-lock.json` brukes som frontend-låsefil.

### Rollback

- Behold forrige image-SHA til ny versjon er testet gjennom Cloudflare Access.
- Ikke gjør databaseskjemaendringer i denne fasen, slik at frontend-image kan rulles tilbake uavhengig.

## Fase 2 – Gjør backend-avhengigheter og konfigurasjon deterministiske

**Mål:** Sørge for at samme commit alltid bygger det samme Python-miljøet, før selve modellstacken oppgraderes.

**Passende agentomfang:** Én middels arbeidsøkt. Ikke kombiner denne fasen med CUDA-/modelloppgradering.

### Arbeid

- Innfør `pyproject.toml` og en Python-låsefil, fortrinnsvis med `uv`, eller bruk en tydelig generert constraints-fil hvis pip skal beholdes.
- Konfigurer PyTorch-indeksen eksplisitt og sikkert. Unngå at generelle pakker utilsiktet hentes fra feil indeks.
- Lås både produksjons- og testavhengigheter.
- Behold dagens kjente Torch/TorchAudio-versjon i denne fasen. Målet er først å fryse fungerende adferd.
- Flytt `requirements-dev.txt` inn i samme låsestrategi, slik at testmiljøet faktisk representerer produksjonsrammeverket.
- Endre Docker-build til å feile dersom låsefilen og manifestet ikke samsvarer.
- Kjør `pip check` og `pip-audit` mot det låste miljøet. Dokumenter at spesialbygde CUDA-wheels eventuelt må kontrolleres separat dersom audit-verktøyet hopper over dem.
- Gjør `MODEL_ID` til faktisk kilde for modellnavnet. Bruk en full standardverdi, ikke bare `nb-whisper-large`.
- Legg til `MODEL_REVISION` slik at produksjon kan pinne en konkret Hugging Face-revisjon.
- Oppdater `backend/env.example` til å vise variablene applikasjonen faktisk leser:
  - `DATABASE_URL`
  - `MODEL_ID`
  - `MODEL_REVISION`
  - `HF_TOKEN`
  - database-retry og feildetaljer
- Fjern eller dokumenter gamle `POSTGRES_*`-variabler som backenden ikke bruker direkte.

### Verifikasjon

```bash
uv sync --frozen
uv run pytest
uv run pip check
uv run pip-audit
```

Kommandoene må tilpasses hvis en annen låsestrategi velges, men prinsippet er at både lokal installasjon og Docker-build skal bruke låsen uten å resolve nye versjoner.

### Akseptansekriterier

- En ren installasjon gir samme direkte og transitive versjoner hver gang.
- Backendtestene passerer i det låste miljøet.
- Docker-build bruker låsefilen og feiler ved drift mellom manifest og lås.
- `MODEL_ID` og `MODEL_REVISION` blir brukt ved faktisk modellinnlasting og lagres korrekt i metadata.
- Eksempelfilen inneholder ingen ubrukte eller misvisende databasevariabler.

## Fase 3 – Oppgrader og benchmark modell-, PyTorch- og CUDA-stakken

**Mål:** Flytte fra beta-/RC-modell og gammel CUDA-wheel til en støttet, målt kombinasjon som fungerer på RTX 3080 med 10 GB VRAM.

**Passende agentomfang:** Én stor, men fokusert arbeidsøkt. Krever tilgang til GPU-maskinen og tid til å laste ned modellfiler.

### Beslutninger som skal tas eksplisitt

- Sammenlign minst:
  - dagens `NbAiLabBeta/nb-whisper-large`
  - stabile `NbAiLab/nb-whisper-large`
- Velg en støttet PyTorch-versjon og CUDA-variant. PyTorch 2.12 med en støttet CUDA 12.6- eller 13.x-variant er et naturlig utgangspunkt, men valget må baseres på reell test av RTX 3080 og driver 591.86.
- Velg batchstørrelse og beam search ut fra VRAM og ytelse, ikke bare tidligere hardkodede verdier.

### Arbeid

- Oppgrader Torch og TorchAudio som et matchet par.
- Oppdater CUDA-baseimaget slik at det er konsistent med valgt wheel/runtime-strategi.
- Oppgrader Transformers kontrollert til en eksplisitt låst versjon.
- Verifiser om `_fix_cached_config_types()` fortsatt er nødvendig. Fjern workarounds som ikke lenger trengs, men bare etter en reell modelltest.
- Ikke muter en delt Hugging Face-cache dersom vanlig modellinnlasting nå fungerer. Hvis en workaround fortsatt kreves, dokumenter den og test atomisk oppdatering.
- Gjør disse ytelsesverdiene konfigurerbare med konservative standarder:
  - pipeline batchstørrelse
  - antall segmenter per sub-batch
  - `num_beams`
  - segmentlengde
- Legg modellcache på et navngitt Docker-volum, for eksempel gjennom `HF_HOME=/models`, slik at en ny image-deploy ikke laster ned flere gigabyte på nytt.
- Kjør sammenligning med de tre baselinefilene.

### Benchmarkmal

| Modell/revisjon | Torch/CUDA | Fil | VRAM maks | Total tid | Resultatkvalitet | Feil |
|---|---|---|---:|---:|---|---|
| | | 2 min | | | | |
| | | 15 min | | | | |
| | | 60 min | | | | |

### Akseptansekriterier

- Modellen lastes fra det konfigurerte modellnavnet og den pinnede revisjonen.
- En reell kort transkripsjon passerer etter kald og varm oppstart.
- En times testfil fullfører uten CUDA OOM.
- Modellcache overlever container-recreate.
- Valgt kombinasjon og benchmarkresultater dokumenteres.
- Det finnes en enkel rollback til forrige image og modellrevisjon.

## Fase 4 – Gjør lange og ustabile opplastinger robuste

**Mål:** Gjøre en times lyd til et eksplisitt støttet scenario, også ved tregt eller ustabilt nettverk, uten kunstige lave grenser.

**Passende agentomfang:** Én stor arbeidsøkt med både frontend, backend og tester. Hold databaseskjemaendringer begrenset til opplastings-/jobbmetadata.

### Dagens risikopunkter

- Chunk-append er ren fil-append uten offset og er derfor ikke idempotent. Frontenden kan ikke trygt forsøke en chunk på nytt dersom svaret forsvinner.
- Det finnes ingen kontroll av forventet totalstørrelse eller mottatt offset.
- Forlatte opplastinger ryddes bare når en ny init-operasjon skjer.
- `segment_wav()` leser hele WAV-filen inn i minnet før den lager segmenter. Dette skalerer dårligere enn nødvendig for lange opptak.
- Midlertidige filer ligger i containerens vanlige `/tmp` og er ikke synlige for driftsmessig kapasitetsplanlegging.

### Arbeid

- Utvid init-kallet med forventet totalstørrelse og originalt filnavn.
- La serveren returnere gjeldende byte-offset etter hver append.
- Krev at klienten sender forventet offset ved append. Serveren skal:
  - akseptere chunk når offset er korrekt
  - returnere allerede mottatt offset uten å duplisere data ved en trygg retry
  - avvise hull eller konflikt med en tydelig 409-respons
- Oppdater frontenden slik at chunk-retry blir trygg og begrenset.
- Vurder checksum per chunk eller for hele filen dersom det kan gjøres uten å holde filen i minnet.
- Behold små chunks som fungerer gjennom Cloudflare. 5 MB er et fornuftig utgangspunkt; mål før det endres.
- Ikke sett en lav maksimal filstørrelse. Hvis en konfigurerbar absolutt grense innføres som sikkerhetsventil, skal standard være av eller klart over forventet én-timesformat.
- Innfør diskvern basert på ledig plass i stedet for lydvarighet:
  - kontroller ledig plass før init og finalize
  - ta høyde for originalfil, konvertert WAV og segmentfiler samtidig
  - returner en tydelig `507 Insufficient Storage` når maskinen faktisk ikke kan behandle filen sikkert
- Flytt upload-/arbeidsområdet til et eksplisitt volum eller en eksplisitt host-path med dokumentert opprydding.
- Oppdater aktivitetstid ved hver chunk, og kjør periodisk opprydding av forlatte opplastinger uavhengig av nye init-kall.
- Segmenter lyd strømmet, for eksempel via FFmpeg segmentering, slik at hele én-times-WAV-en ikke leses inn i RAM med `soundfile.read()`.
- Sørg for at bare én GPU-jobb kjører samtidig, men vis køstatus slik at lange jobber ikke ser fastlåst ut.

### Tester

- retry av samme chunk uten dupliserte bytes
- feil offset gir 409 og korrekt serveroffset
- manglende chunk/hull kan ikke finaliseres
- forlatt upload ryddes etter TTL
- aktiv upload utløper ikke mens chunks fortsatt kommer
- tom disk simuleres og gir forståelig respons
- 60-minutters fil kan lastes opp i chunks og segmenteres med begrenset RAM
- browser polling fortsetter under en lang jobb uten vilkårlig total timeout

### Akseptansekriterier

- En times testfil kan lastes opp og transkriberes ende til ende.
- Nettverksbrudd under én chunk kan gjenopptas uten å starte hele opplastingen på nytt og uten korrupsjon.
- Minnebruk vokser ikke lineært med hele ukomprimerte lydfilen.
- Forlatte filer ryddes automatisk.
- Ingen standardgrense hindrer legitime timesopptak.

## Fase 5 – Legg kvalitetsporter i CI

**Mål:** Hindre at en grønn image-build skjuler testfeil, usikre avhengigheter eller en brutt applikasjon.

**Passende agentomfang:** Én middels arbeidsøkt begrenset til `.github/`, Docker-build og nødvendige testkommandoer.

### Arbeid

- Opprett egne CI-jobber for:
  - backendinstallasjon fra låsefil og `pytest`
  - frontend `npm ci`, Jest, ESLint og produksjonsbuild
  - frontend produksjonsaudit
  - Python-audit fra låsefil
  - Compose-validering for relevante filer
- La image-build og push avhenge av disse jobbene.
- Behold SHA-tag i tillegg til en bevegelig kanal-tag. Produksjon bør kunne pinne eller rulle tilbake til SHA.
- Oppdater GitHub Actions til støttede majorversjoner.
- Aktiver Dependabot eller Renovate for:
  - npm
  - Python-låsen
  - GitHub Actions
  - Dockerfile-/Compose-images der verktøyet støtter det
- Vurder SBOM og image-scan for publiserte images.
- Test at pull requests bygger images uten å pushe dem.
- Unngå å logge Hugging Face-token, Cloudflare-token eller databaseverdier.

### Akseptansekriterier

- En bevisst feilende frontend- eller backendtest blokkerer image-publisering.
- En ren PR kjører alle kvalitetsporter.
- Images publiseres med commit-SHA.
- Oppdateringsverktøyet lager små, separate PR-er fremfor én stor samleoppgradering.
- CI-dokumentasjonen viser hvilke kontroller som ikke kan gjøres uten fysisk GPU.

## Fase 6 – Moderniser produksjonsinfra og deployflyt

**Mål:** Fjerne utdatert Watchtower, gjøre oppstart og healthchecks pålitelige og få en kontrollert deploy-/rollbackprosess.

**Passende agentomfang:** Én stor arbeidsøkt i `infra`, med små nødvendige endringer i applikasjonsrepoet. Krever Docker på desktop-maskinen.

### Først: velg deploymodell

Anbefalt for denne personlige tjenesten er en kontrollert modell der CI publiserer SHA-tag, og desktop-maskinen oppdateres med et eksplisitt deployscript eller en begrenset systemd-timer. Alternativer:

1. **Manuell godkjenning, anbefalt:** Oppdater image-SHA i Compose, kjør `docker compose pull` og `up -d`, kontroller health og behold forrige SHA for rollback.
2. **Kontrollert automatikk:** En systemd-timer eller CI-trigger kjører et versjonert deployscript etter grønn CI, tar backup ved behov, kontrollerer health og ruller tilbake ved feil.
3. **Kun varsling:** Et vedlikeholdt verktøy varsler om nye images, men foretar ikke restart automatisk.

Ikke bytt ukritisk til en tilfeldig Watchtower-fork. Velg et vedlikeholdt verktøy først etter egen vurdering.

### Arbeid

- Fjern `containrrr/watchtower` og den brede tilgangen til Docker-socketen som fulgte med.
- Pin Cloudflared og Portainer til eksplisitte versjoner eller digests.
- Bruk SHA- eller release-tagger for nb-transcribe-images i produksjon.
- Legg til backend-healthcheck på `/health`.
- Reparer frontend-healthchecken som beskrevet i fase 1.
- Bruk `depends_on` med health-betingelser der Compose-versjonen støtter det:
  - backend venter på frisk database
  - frontend venter på frisk backend
  - Cloudflared starter etter at rutemålene er friske
- Legg til navngitte volumer for:
  - PostgreSQL-data
  - Hugging Face-modellcache
  - eventuelt arbeids-/uploadområde dersom fase 4 krever det
- Sett restart- og stop-grace-perioder som lar en pågående jobb avslutte kontrollert eller markeres som avbrutt.
- Dokumenter at Cloudflare Access-policy beskytter både:
  - `transcribe.jenanos.xyz`
  - `api.transcribe.jenanos.xyz`, dersom API-hostnavnet fortsatt eksponeres
  - Portainer-hostnavnet, dersom det eksponeres
- Behold backend internt for vanlig frontend-proxy. Direkte browser-upload bør bare brukes dersom det er nødvendig og Access/CORS er testet for det aktuelle hostnavnet.
- Oppdater CORS-listen dersom `https://transcribe.jenanos.xyz` skal kunne kontakte backend direkte.
- Valider at `infra/.env.desktop.example` beskriver alle nødvendige, men ingen faktiske, hemmeligheter.
- Legg til en eksplisitt deploy- og rollbackkommando i README.

### Rydd opp i lokal Compose

Rotens `nb-transcribe/docker-compose.yml` blander lokal utvikling med et eksternt `cf_edge`-nettverk. Velg én av disse retningene:

- gjør filen til ekte lokal Compose med host-port 3000, valgfri host-port 8000 og uten eksternt Cloudflare-nettverk, eller
- fjern filen og pek all containerdrift til `infra/compose-desktop.yml`.

Hvis lokal Compose beholdes, må databasepassordet brukes konsekvent i både `POSTGRES_PASSWORD` og backendens `DATABASE_URL`.

### Akseptansekriterier

- Ingen produksjonsservice bruker det arkiverte Watchtower-imaget.
- En deploy bruker en kjent image-versjon og har dokumentert rollback.
- Alle sentrale containere blir `healthy`.
- Modellcache overlever imageoppgradering.
- Databasebackup og restore er dokumentert.
- Cloudflare Access er manuelt verifisert i inkognitovindu: ingen tjeneste er tilgjengelig uten innlogging.
- En stor opplasting gjennom den valgte ruten fungerer etter infraendringene.

## Fase 7 – Jobbdurabilitet, operasjonell polish og sluttdokumentasjon

**Mål:** Redusere datatap ved restart og avslutte moderniseringen med en dokumentert, repeterbar driftsrutine.

**Passende agentomfang:** Én middels til stor arbeidsøkt. Kan deles i to PR-er dersom databaseskjemaet blir omfattende.

### Arbeid

- Opprett en databasepost når jobben køes, ikke bare når den er ferdig eller feiler.
- Lagre statusoverganger: `queued`, `running`, `done`, `error`, `interrupted`.
- Ved oppstart skal gamle `running`-jobber markeres som `interrupted`, eller gjenopptas bare hvis dette er eksplisitt og sikkert implementert.
- Sørg for at temp-/uploadfil ikke slettes før jobbstatus og resultat er konsistent lagret.
- Vurder Alembic før flere skjemaendringer; `create_all()` alene er ikke en migrasjonsstrategi.
- Dokumenter forventet oppførsel når containeren stoppes under:
  - opplasting
  - konvertering
  - GPU-transkribering
  - lagring av resultat
- Legg til strukturert logging med job-ID, men uten rå transkripsjon eller hemmeligheter.
- Dokumenter vanlig drift:
  - start/stopp
  - deploy/rollback
  - kontroll av GPU og disk
  - backup/restore
  - tømming av forlatte uploads
  - modellcache
  - feilsøking av Cloudflare Access
- Fjern omtale av laptop-oppsettet og forklar at gamle IDE-faner for `compose-laptop.yml` og `.env.laptop.example` viser filer som ikke lenger finnes.

### Akseptansekriterier

- Restart under en jobb gir en korrekt og forståelig status etter oppstart.
- Ferdige transkripsjoner forsvinner ikke ved containeroppdatering.
- Databaseskjema kan migreres fremover på en kontrollert måte.
- README og `docs/` stemmer med faktisk produksjonsarkitektur.
- En ny agent eller utvikler kan følge dokumentasjonen uten muntlig kontekst.

## Forslag til agentarbeidsflyt

For hver fase bør agenten få én tydelig oppgave med følgende struktur:

```text
Les docs/oppgraderingsplan-2026.md og gjennomfør bare fase N.

Premisser:
- Bevar støtte for lydfiler på minst én time.
- Cloudflare Access er eksisterende tilgangskontroll.
- Ikke les eller skriv ut hemmeligheter fra infra/.env.desktop.
- Ikke gjør arbeid fra senere faser med mindre det er nødvendig for at denne fasen skal bygge.

Før endringer:
1. Les relevante AGENTS.md-filer dersom de finnes.
2. Kontroller git status i begge repoer som berøres.
3. Oppsummer antakelser og planlagt filomfang.

Leveranse:
- Implementer fasens arbeid.
- Kjør alle relevante tester og builds.
- Oppdater dokumentasjon som direkte påvirkes.
- Rapporter endrede filer, testresultater, gjenværende risiko og manuelle steg.
- Ikke commit eller push med mindre det er eksplisitt bedt om.
```

### Anbefalt størrelse per PR

- Én PR for frontend/Node-migreringen.
- Én PR for Python-manifest og låsefil.
- Én PR for modell/PyTorch/CUDA, inkludert benchmarknotat.
- Én PR for resumable upload og strømmende segmentering.
- Én PR for CI.
- Én PR i `infra` for deploy, healthchecks og volumer.
- Én PR for jobbdurabilitet/migrasjoner dersom dette ikke passer naturlig sammen med uploadfasen.

Hvis en fase begynner å kreve mer enn omtrent 15–20 sentrale filer eller flere uavhengige designvalg, bør agenten stoppe etter analyse og dele fasen i to foreslåtte PR-er før implementering.

## Endelig regresjonssjekkliste

Planen er ikke ferdig før følgende er verifisert på desktop-maskinen:

- [ ] Cloudflare Access avviser en ikke-autentisert bruker på alle eksponerte hostnavn.
- [ ] Innlogging som eier gir tilgang til frontend, historikk og eventuell direkte API-rute.
- [ ] Kort lydfil kan lastes opp og transkriberes.
- [ ] En times lyd kan lastes opp, eventuelt gjenopptas, og transkriberes.
- [ ] GPU-minne holder seg innenfor RTX 3080s 10 GB.
- [ ] Containerrestart gir korrekt jobbstatus og mister ikke ferdige resultater.
- [ ] Modellcache overlever en ny deploy.
- [ ] PostgreSQL-backup kan gjenopprettes.
- [ ] Frontend- og backend-healthchecks er grønne.
- [ ] Frontend produksjonsaudit er ren.
- [ ] Python-audit er ren eller har eksplisitt dokumenterte unntak for CUDA-wheels.
- [ ] CI blokkerer publisering ved feilende test, lint, build eller audit.
- [ ] Deploy kan rulles tilbake til forrige image-SHA.
- [ ] README og miljøeksempler stemmer med faktisk oppsett.

## Prioritert kortversjon

Hvis arbeidet må fordeles over tid, bruk denne prioriteringen:

1. Baseline og backup.
2. Next.js 16, Node 24, Jest/ESLint og rent frontend-audit.
3. Lås Python-avhengigheter og koble `MODEL_ID` til faktisk modellinnlasting.
4. Oppgrader og benchmark stabil NB-Whisper/PyTorch/CUDA på RTX 3080.
5. Gjør chunk-opplasting idempotent og prosesseringen strømmende for én-timesfiler.
6. Legg test/audit/build foran image-publisering i CI.
7. Fjern Watchtower, pin images og innfør health-basert deploy med rollback.
8. Gjør jobbstatus holdbar ved restart og fullfør driftsdokumentasjonen.
