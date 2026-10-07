# RETRO SNAKE

Minimalna Snake igra sa 20 × 20 mrežom, retro izgledom, TypeScript browser klijentom i autoritativnim TypeScript serverom.

## Lokalni razvoj

Potrebno je Node.js 22 ili noviji.

U prvom terminalu instaliraj zavisnosti i pokreni Vite klijent:

```bash
npm install
npm run dev
```

U drugom terminalu pokreni TypeScript backend:

```bash
npm run dev:server
```

Otvori adresu koju Vite ispiše (podrazumevano `http://localhost:5173`).

## Build i pokretanje iz build-a

Napravi produkcioni build klijenta:

```bash
npm run build
```

Build proverava TypeScript i pravi frontend fajlove u `dist/`. Za lokalno pokretanje build-a, ostavi backend aktivan u jednom terminalu:

```bash
npm start
```

Zatim u drugom terminalu pokreni Vite preview:

```bash
npm run preview
```

Otvori adresu koju preview ispiše (podrazumevano `http://localhost:4173`). Preview prosleđuje `/api` HTTP i WebSocket saobraćaj backend-u.

Pritisni strelicu da započneš partiju. Strelice menjaju smer, `P` ili `Space` pauziraju, a `R` ili dugme `NEW GAME` vraćaju igru u početno stanje. Server poseduje stanje igre i više nezavisnih single-player game containera; svaki container trenutno ima jednog igrača. Rekord se čuva lokalno u browseru. Otvori `SHOP` da pauziraš i vidiš perkove; `ASK SHOP AI` predlaže kupovinu Extra XP, Luck, +1 Life ili čekanje. Savet nikad ne kupuje perk — kupovina ostaje poseban klik.

Shop advisor koristi jedan pokušaj Gemini 3.8 Flash, do dva pokušaja Gemini 3.5 Flash-Lite, pa do tri pokušaja Gemma 4 26B A4B IT kada je fallback dozvoljen. Backend čita `GEMINI_API_KEY` samo iz svog runtime okruženja. Ključ unesi samo u terminal iz kog pokrećeš backend; ovo ga drži van repozitorijuma, Vite konfiguracije i browser build-a, da ne bi bio slučajno commit-ovan ili poslat korisnicima.

Na Linux/macOS-u, u drugom terminalu unesi ključ bez prikaza i pokreni backend:

```bash
read -s -p "Gemini API key: " GEMINI_API_KEY
printf '\n'
export GEMINI_API_KEY
npm run dev:server
```

Posle zaustavljanja servera (`Ctrl+C`) ukloni ga iz terminal okruženja:

```bash
unset GEMINI_API_KEY
```

Na Windows PowerShell-u koristi skriveni unos:

```powershell
$secureKey = Read-Host "Gemini API key" -AsSecureString
$env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new("", $secureKey).Password
npm run dev:server
```

Posle zaustavljanja servera (`Ctrl+C`) očisti promenljivu:

```powershell
Remove-Item Env:GEMINI_API_KEY
$secureKey = $null
```

Pokreni Vite u posebnom terminalu kao gore opisano; nemoj postavljati `VITE_GEMINI_API_KEY` niti dodavati ključ u `.env`, source code, komandu koja sadrži njegovu vrednost, ili commit. Bez konfigurisanog ključa shop prikazuje bezbednu poruku da savet nije dostupan. Stvarni limiti za sva tri modela zavise od Google AI Studio projekta.

Backend za svaki provider pokušaj ispisuje jedan JSON telemetry red sa modelom, rednim brojem pokušaja, bezbednom klasom ishoda, trajanjem, fallback statusom i token usage podacima kada ih Google vrati. Log namerno ne sadrži ključ, prompt, odgovor modela, game/session ID ni privatne shop vrednosti.

## Provera

```bash
npm run typecheck
npm test
npm run build
npm run security:scan
```

Browser E2E za ASK SHOP AI (fake provider, bez ključa i bez poziva ka Google-u; jednom pokreni `npx playwright install chromium`):

```bash
npm run test:e2e
```

Pokreće backend sa lažnim providerom (Flash vraća 503, Flash-Lite odgovara) i Vite klijent na slobodnim portovima (bez `npx`, radi i na Windows-u), pa u headless Chromium-u proverava savet, fallback, da savet ne kupuje, kupovinu dok savet čeka, zatvaranje prodavnice tokom zahteva i poruku bez ključa. Rezultati: [Evidence 013](docs/tracking/evidence/EVIDENCE_013.md).

## Week 3 baseline i Week 4 proširenje

| | Week 3 (baseline) | Week 4 (proširenje) |
|---|---|---|
| Igra | Snake engine, validacija konfiguracije, CRT polish | Server drži stanje igre; XP, perkovi, Lucky pickup, prodavnica |
| AI | Lokalni read-only Hint (bez pravog AI-ja) | ASK SHOP AI: Gemini savet u pauziranoj prodavnici, ne menja stanje |
| Pouzdanost | — | Flash ×1 → Flash-Lite ×2 → Gemma ×3, rok 85 s, Retry-After, terminalne greške bez fallback-a |
| Izveštaj | [WEEKLY_REPORT_week03](docs/tracking/reports/WEEKLY_REPORT_week03.md) | [WEEKLY_REPORT_week04](docs/tracking/reports/WEEKLY_REPORT_week04.md) |

Dokazni lanac za Week 4 (redom):

1. Spec: [`specs/002-shop-advisor/spec.md`](specs/002-shop-advisor/spec.md) i [plan](specs/002-shop-advisor/plan.md)
2. Ugovor: [`contracts/shop-advice-api.md`](specs/002-shop-advisor/contracts/shop-advice-api.md) i [`docs/specs/TOOL_CONTRACT.md`](docs/specs/TOOL_CONTRACT.md)
3. Politika pouzdanosti: [Reliability V2](specs/002-shop-advisor/research.md) i [GEMINI_HINT_CHANGES_V2](docs/specs/GEMINI_HINT_CHANGES_V2.md)
4. Testovi: `tests/shopAdvice.test.ts`, `tests/httpServer.test.ts`, browser E2E `scripts/e2e/shopAdvisor.e2e.ts`
5. Evidence: [009](docs/tracking/evidence/EVIDENCE_009.md), [010](docs/tracking/evidence/EVIDENCE_010.md), [011](docs/tracking/evidence/EVIDENCE_011.md), [012](docs/tracking/evidence/EVIDENCE_012.md), [013 — HTTP smoke i browser E2E](docs/tracking/evidence/EVIDENCE_013.md)
6. Ko je šta radio: [CONTRIBUTIONS_WEEK04](docs/tracking/CONTRIBUTIONS_WEEK04.md)

## Dokumentacija

- `AGENTS.md` — kratak, uvek važeći projektni ugovor.
- `docs/INSTRUCTIONS.md` — indeks detaljnih instrukcija, specifikacija i evidencija.
- `docs/instructions/` — pravila po temi: arhitektura, kod, AI/security, provere i workflow.
- `docs/specs/` — autoritativni opis igre, refactor plan i read-only shop context contract.
- `specs/002-shop-advisor/` — Spec Kit specifikacija, plan, API ugovor, zadaci i quickstart za shop savet.
- `docs/specs/REFACTOR_PLAN.md` — refactor odluke, Definition of Done, out-of-scope i ček-lista provera.
- `docs/prompts/` — build promptovi, uključujući server refactor.
- `docs/tracking/` — work log, [Week 4 contribution record](docs/tracking/CONTRIBUTIONS_WEEK04.md), AI usage log, task-specific evidence, Week 3/4 checklists and guides, i weekly reports.

Za promene prati obavezni workflow u `docs/instructions/05-workflow-tracking-and-reporting.md`. Njegov cilj je da stvarni rad i rezultati ostanu zabeleženi i da nedeljni izveštaj može da se sastavi iz tih zapisa.

## Shop Strategist (Week 5)

U pauziranom shopu dugme **PLAN WITH AI** pokreće ograničen agentic run: model samo predlaže read-only alate (`get_shop_state`, `evaluate_perk_plan`, `get_recent_runs`), backend validira svaki predlog i rezultat, drži limite (5 koraka, 4 alata, 8 provider pokušaja, 45 s) i nikad ništa ne kupuje. Isti `GEMINI_API_KEY` iz runtime okruženja kao za shop advisor (vidi gore). Specifikacija, tokovi i ugovori: [specs/003-shop-agent](specs/003-shop-agent/spec.md). Brza provera bez ključa: `npm test`. Jedan live run: `AGENT_LIVE=1 npm run agent:live`.

## Canvas izgled i klijentske opcije (Faza 1)

Tabla se crta na Canvasu (neon tema, čestice, tween kretanja) iz server snapshota; server i dalje drži sva pravila. Tasteri: strelice smer · P/Space pauza · R nova igra · S shop · M zvuk · C colorblind režim; swipe radi na telefonu. Pri startu i nastavku igre ide odbrojavanje 3-2-1. Težine EASY/NORMAL/HARD menjaju brzinu i pokreću novu igru. Rekordi (top 10) i statistika čuvaju se lokalno u browseru. Specifikacija: [specs/004-best-game-phase1](specs/004-best-game-phase1/spec.md).
