# Nedeljni izveštaj - W08

Secure the Arcade | RETRO SNAKE | Individualni rad

## 1. Osnovne informacije

| Polje | Odgovor |
| --- | --- |
| Ime i prezime | Uroš Milutinović |
| Adresa e-pošte | umilutinovic25@gmail.com |
| Discord | urke04 |
| Nedelja / zadatak | Nedelja 8 - Secure the Arcade |
| Način rada | Individualno, uz AI pomoć; nisam radio u timu |
| Moja uloga | Samostalni autor W08 rada: rešenje, implementacija, zaštite, testovi i dokumentacija, uz AI kao pomoćni alat |
| Datum pripreme | 27.10.2026. |
| Kodni checkpoint | cbc273c; potpuni SHA i dokumentacioni checkpoint u manifestu predajnog paketa |

## 2. Moj status

**Tehnički završeno i pripremljeno za individualnu predaju.** Ojačan je postojeći W05 Shop Strategist i njegove browser/API granice. Igra i legitiman agentski tok rade; model predlaže, a backend proverava i izvršava samo dozvoljene read-only alate.

Ja sam autor W08 rada i radio sam samostalno. Claude Code i Codex koristio sam kao pomoćne alate tokom izrade i provere rešenja. Ne prijavljujem doprinos drugog člana ni zamenu uloga u paru. Zadatak predviđa rad u paru, pa individualni način rada prijavljujem kao odstupanje od tog formata; ne tvrdim da je izuzetak unapred odobren.

## 3. Šta sam uradio

U okviru individualnog rada definisao sam model pretnji, prioritete i invarijante I1-I8. Zadržao sam postojeći TypeScript/Vite frontend i Node backend. Shop Strategist koristi samo get_shop_state, evaluate_perk_plan i get_recent_runs, bez kupovine perkova ili izmene kanonskog stanja igre. Normalna proba završava tri model koraka i dva stvarna izvršenja alata.

Ojačao sam HTTP ulaz, Host/Origin provere, rano ograničenje tela, runtime ugovore i serverske budžete. Dodati su globalni rate/concurrency limiti, bezbedni security događaji i produkcioni server sa aktivnom CSP, nosniff i no-referrer zaglavljima. Lokalni rekordi su označeni kao nepotvrđeni serverskim proverama.

Iterativni pregled je otkrio i zatvorio probleme sa zakašnjelim finalom, otkazivanjem i retry pozivima preko nezavršenog provider posla. U probi je broj aktivnih poslova smanjen sa 12 na dozvoljena 2. Popravljeni su malformed WebSocket zahtevi koji su obarali proces, coach timeout/cache oporavak i statički symlink izlazak iz build direktorijuma.

Pored osnovnog dela, pripremio sam seeded property-based proveru sa 300 generisanih sekvenci, ponovljiv pre/posle runner i demo runbook. Završni pregled uključuje stvarni browser DOM, Canvas i Web Audio signal pod produkcionom CSP.

<!-- PAGEBREAK -->

## 4. Provere i dokazi

Rezultati su dobijeni lokalno na macOS-u, Node 24.20.0, uz fake provider i Chromium. W08 provere ne koriste pravi provider ključ.

| Provera | Stvarni rezultat |
| --- | --- |
| npm test | 225/225 prošlo, 0 fail/skipped; uključuje 50 security testova |
| npm run test:security | 50/50 security testova, production build i 9/9 produkcionih browser provera |
| npm run test:e2e | 18/18 W05 browser provera |
| Typecheck, build, security scan | Sve komande uspešne |
| Dependency audit | 0 nalaza, runtime i dev |
| Sintetička tajna | Nema je u testiranim model context/response/log putanjama ni u dist artefaktima |
| Read-only i XSS | Stanje pre/posle isto; bez izvršenog markera i bez opasnog DOM-a |
| Lična provera | Lično sam proverio igranje, kontrole, zvuk, prodavnicu i prikaz AI plana; sve radi |
| Dodatni izazov | 300 generisanih sekvenci, seed 20261027; allowlist/args/state invarijante prolaze |

Isti pre/posle ulazi: Origin 201 -> 403, text/plain 201 -> 415, provider pozivi 8 -> 5 uz tri rate-limit odbijanja. Postojeće zaštite velikog tela i maxSteps polja ostaju potvrđene. Početni source 05456e3 prolazi 175/175 i build sa sadašnjim zavisnostima; istorijsko okruženje nije rekonstruisano.

Detaljni payload-i, brojači, test lokacije, poređenja i završna matrica svih zahteva nalaze se u [EVIDENCE_W08.md](../../../EVIDENCE_W08.md). Spec/plan/tasks su u [specs/005-secure-arcade](../../../specs/005-secure-arcade/spec.md). [Work log](../WORK_LOG.md) i [AI usage log](../AI_USAGE_LOG.md) čuvaju sled rada i AI pomoć. U paketu su izvorni kod i lokalni Git checkpoint za ponavljanje provera.

## 5. Moje autorstvo i AI pomoć

**Autor i nosilac ovog rada sam ja, Uroš Milutinović.** Samostalno sam odredio obim i zahteve, vodio izradu rešenja i odlučivao koje izmene prihvatam. Igru i njene funkcije sam lično proverio.

Claude Code i Codex koristio sam kao pomoćne alate u radu na kodu, testovima i dokumentaciji. Pomoć je uključivala predloge koda i testova, pronalaženje grešaka, pregled rešenja i automatizovane provere. Izlazi alata provereni su testovima, poređenjem stanja, browser DOM/CSP proverama i mojim isprobavanjem igre. AI pomoć je deo procesa rada; autorstvo, odluke i odgovornost za predato rešenje ostaju moji.

## 6. Opseg i završni status

**Lična provera je potvrđena:** na pitanje o igranju, kontrolama, zvuku, prodavnici i AI planu odgovorio sam „da sve radi“. Zasebna vođena browser provera i screenshot dodatno potvrđuju prikaz validnog plana.

Po mojoj odluci ostajemo na W08 fake-provider profilu. Windows i live pozivi nisu obavezni za zadatak. Lokalni/demo opseg, granice udaljene naplate i istorijske SDD proverljivosti detaljno su opisani u EVIDENCE_W08.

Rad je individualan uz AI pomoć, bez timske zamene uloga. Nastavnik procenjuje format i odbranu.

Spreman je osvežen paket: izveštaj, dokazi, kod/testovi, specifikacija, Git checkpoint, uputstvo, screenshot i tekst poruke. Ova priprema obuhvata samo paket za predaju.
