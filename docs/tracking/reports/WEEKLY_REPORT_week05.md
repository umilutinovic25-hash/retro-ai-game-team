# Nedeljni izveštaj

## 1. Osnovne informacije

| Polje | Odgovor |
| --- | --- |
| Ime i prezime | Uroš Milutinović |
| Adresa e-pošte | umilutinovic25@gmail.com |
| Discord korisničko ime | urke04 |
| Nedelja | Nedelja 5 |
| Par / tim | Zvanično prijavljen sa Matijom (tim_1); rad na samostalnoj verziji zadatka. |
| Moj konkretan doprinos / uloga | Izabrao sam Shop Strategist kao W05 scenario, odobrio ograničen obim i specifikaciju, pokrenuo live proveru sa svojim ključem i ručno proverio prikaz plana u igri. |
| Datum predaje | 2026-10-07 |
| Reference na rad i dokaze | [Zvanični team repo — W05 commit 7e92b6f](https://github.com/MatijaRadulovic/retro-ai-game/tree/main), [W05 commit](https://github.com/MatijaRadulovic/retro-ai-game/commit/7e92b6f7a04ee89e179e5a9181c1fea9b010539b), [W05 specifikacija](../../../specs/003-shop-agent/spec.md), [Evidence 014](../evidence/EVIDENCE_014.md), [W05 doprinosi](../CONTRIBUTIONS_WEEK05.md), [Evidence 017](../evidence/EVIDENCE_017.md), [Work log](../WORK_LOG.md), [AI usage log](../AI_USAGE_LOG.md). |

## 2. Moj status

**Status:** Završeno

Week 5 bounded agentic feature implementiran je kao Shop Strategist. Agent analizira pauziranu prodavnicu i predlaže validan plan kupovine perkova koristeći ograničene read-only alate. Automatizovane provere, live Gemini poziv i ručna provera u browseru su završeni.

## 3. Rad ove nedelje

W05 je tražio da se W04 jednokratni AI savetnik proširi u ograničeni agentic tok. U Shop Strategist funkciji model predlaže pozive alata, a backend proverava svaki predlog, izvršava samo dozvoljene alate i proverava završni plan. Dozvoljeni alati čitaju stanje prodavnice, proveravaju plan perkova i po potrebi čitaju skorašnje partije. Agent nema alat za kupovinu i ne menja stanje igre; kupovinu potvrđuje igrač.

Izabrao sam Shop Strategist scenario i odobrio slojeviti obim: osnovni plan, uvid u skorašnje partije i jedno ispravljanje odbijenog plana. AI coding agent je pomogao u specifikaciji, implementaciji, testovima i dokumentaciji. Pregledao sam rezultate i pokrenuo live proveru sa svojim Gemini ključem kroz skriveni unos u Terminalu.

Live proba je završena uspešno: model je predložio plan `EXTRA XP → EXTRA XP`, koji je deterministički evaluator potvrdio u okviru dostupnih perk poena. Primarni model je dva puta istekao; agent je prešao na `gemini-3.5-flash-lite` i završio plan. Zatim sam ručno proverio Shop Strategist u browseru i potvrdio da plan radi bez automatske kupovine.

## 4. Provere i dokazi

| Provera ili dokaz | Rezultat | Lokacija |
| --- | --- | --- |
| Automatizovani testovi | 119/119 prošlo; 64 nova testa za agent tok i ugovore | [Evidence 014](../evidence/EVIDENCE_014.md) |
| Typecheck, build i security scan | Sve komande završene uspešno | [Evidence 014](../evidence/EVIDENCE_014.md) |
| Zamrznute evaluacije E01–E21 | Prošle sa lažnim providerom; uključuju nepoznate alate, loše argumente, budžete, otkazivanje, odbijanje plana i proveru da igra ostaje nepromenjena | [Evals](../../../specs/003-shop-agent/evals.md), [Evidence 014](../evidence/EVIDENCE_014.md) |
| Live Gemini proba (L01) | Uspešan validiran plan za 4 koraka, 3 poziva alata i 6 pokušaja providera; Flash timeout, Flash-Lite fallback | [Evidence 014](../evidence/EVIDENCE_014.md) |
| Ručna browser provera | Završena ranije; korisnik potvrdio da se plan prikazuje i da perk nije automatski kupljen. Nema sačuvanog screenshota ni zasebne W05 browser E2E automatizacije. | [Evidence 014](../evidence/EVIDENCE_014.md) |

## 5. Upotreba AI-ja

AI coding agent je korišćen za razradu slojevite arhitekture, implementaciju orkestratora i validacije, pisanje testova i sređivanje evidencije. Odabrao sam Shop Strategist scenario i pregledao/odobrio specifikaciju i plan. Rezultat je proveren determinističkim testovima, security scan-om, live Gemini probom i mojom ručnom proverom browser toka. AI model u samoj igri može samo da predloži plan; backend proverava predloge, a ja odlučujem o kupovini.

## 6. Ograničenja i sledeći korak

- Live proba je jedan scenario; `gemini-3.8-flash` je istekao dva puta, a `gemini-3.5-flash-lite` završio je run. To ne garantuje isti odziv ili kvalitet u svakom pokušaju.
- Sve planirane W05 provere su završene; nema preostalih provera koje blokiraju predaju.
- Sledeći korak: poslati ovaj izveštaj Marku uz [Evidence 014](../evidence/EVIDENCE_014.md). Dodatno kodiranje nije potrebno za završetak W05 zadatka.

## 7. Poverljiva napomena za tutora

Nema dodatne napomene.
