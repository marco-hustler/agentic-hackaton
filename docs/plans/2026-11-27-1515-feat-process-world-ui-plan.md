---
title: Process World UI - Plan
type: feat
date: 2026-11-27
origin: docs/flows-process-ux.md
execution: code
---

# Process World UI - Plan

**Fonte:** `docs/flows-process-ux.md` (flussi e metafora "mondo") e `docs/stack.md` (Vite + React + TS + Tailwind).
**Vincolo di tempo:** consegna alle 19:45 CET. Il piano è a fasi: alla fine di ogni fase c'è qualcosa di dimostrabile.
**Idee di design:** in arrivo; entrano nella sezione "Design (da completare)" senza cambiare le unità.

---

## Obiettivo

Chi apre CleanBreak atterra in un mondo dove ogni casa è uno split. Può creare il primo processo con un wizard, entrare nella casa e vedere chi tiene cosa (stanze = persone), con prezzi idealo, la lista completa e l'export Excel. Tutto questo senza perdere la demo funzionante di oggi e senza spendere chiamate idealo inutili.

---

## Decisioni chiave (da confermare)

- D1. **N partecipanti per processo (da 2 a 8).** Ogni partecipante ha una stanza, i suoi punti priorità e la sua quota di proprietà. Serve un nuovo solver a N persone (U1b), usato solo dai processi. Il vecchio solver a 2 persone e la demo attuale restano invariati come piano B. Il tetto di 8 serve a tenere leggibile la pianta e veloce il calcolo.
- D7. **Mediatore: solo predisposizione nel modello dati, nessuna interfaccia ora.** In futuro un intermediario potrà confermare o rifiutare la divisione. Già da ora il processo ha un campo `review` (`none` | `pending` | `approved` | `rejected`, con chi e una nota) e i partecipanti hanno un ruolo (`member` | `mediator`). Un mediatore non riceve una stanza né oggetti. L'MVP lascia `review = none` e non mostra nulla.
- D2. **I processi vivono sul backend in un file JSON** (`data/processes.json`, gitignored), dietro nuove API `/api/processes`. Il processo demo "Neukölln WG" viene creato dai dati di `data/demo_berlin_wg.json` al primo avvio, così il mondo non è mai vuoto durante il pitch (a meno che non lo si azzeri apposta).
- D3. **Il nuovo frontend nasce in `web/`, accanto a `frontend/`.** Il vecchio resta su `/` finché il nuovo non arriva alla stessa funzionalità. Poi FastAPI serve `web/dist` su `/` e il vecchio passa a `/legacy`. Il passaggio è un solo commit, ed è anche il piano B per il pitch.
- D4. **Gli inviti sono finti:** le email diventano partecipanti salvati, senza invio reale (come da scope del documento).
- D5. **Il flag "onboarding già visto" sta in `localStorage`**, e la modale si salta se l'accesso fallisce.
- D6. **Nessun nuovo costo idealo.** Il nuovo frontend usa le stesse API di valutazione, con cache prima di tutto e la modalità live che resta un interruttore lato server. La valutazione si avvia solo quando si aggiungono oggetti o si preme "Aggiorna da idealo", mai solo aprendo una casa.

---

## Requisiti

**Mondo**
- R1. All'apertura si vede sempre il mondo. Header e modali stanno sopra, e il mondo resta visibile sotto.
- R2. Senza processi: un `+` grande con la scritta "Crea il tuo primo processo". Con processi: una casa per processo, con titolo, partecipanti e stato al passaggio del mouse, e un lotto `+` libero.
- R3. Al primo accesso parte una modale di onboarding in 3 step che termina mettendo in evidenza il `+`.

**Wizard**
- R4. Modale in 3 step: tipo di processo (separazione, eredità, altro), invito via email con validazione (almeno 2 partecipanti in tutto, chi crea compreso, al massimo 8, D1) con un nome visualizzato per ciascuno, riepilogo e "Crea processo". Dopo la creazione la casa appare nel mondo e si entra direttamente.

**Dentro la casa**
- R5. In alto: titolo, tipo, partecipanti, stato, "Torna al quartiere", e le tab Inventario e Separazione.
- R6. Inventario: lista sopra la pianta con titolo, immagine, prezzo idealo, valore stimato, condizione e anno, chi ha pagato (una persona oppure "condiviso in parti uguali") e i punti priorità di ogni partecipante (100 punti a testa). Si possono aggiungere oggetti incollando testo grezzo, come oggi, modificarli e rimuoverli.
- R7. Separazione: una stanza per ogni partecipante con gli oggetti assegnati, più una zona neutra per oggetti da vendere o da ricomprare nuovi. Al passaggio del mouse un tooltip (titolo, valore, motivo), al clic la modale di dettaglio con le prove idealo e la possibilità di spostare l'oggetto in un'altra stanza. In alto il banner con i conguagli in denaro, cioè la lista minima di pagamenti "X paga Y €" che pareggia tutti.
- R8. "Vista lista" apre una modale sopra la casa: una colonna per persona, totali in € e punti, pagamenti di conguaglio ed export Excel (un foglio per persona più un riepilogo).
- R11. Il modello dati ammette un mediatore futuro (D7) senza modifiche incompatibili: `review` sul processo e `role` sui partecipanti esistono già, ma l'MVP non li usa.

**Stato e dati**
- R9. Stato del processo: `draft` alla creazione, `collecting` con almeno un oggetto, `resolved` dopo il calcolo. L'aspetto della casa cambia di conseguenza.
- R10. Funzionano senza modifiche le regole già in vigore: modalità live spenta di default, segnaposti etichettati, gestione degli errori nell'interfaccia.

---

## Fuori scope

- Interfaccia e flusso del mediatore (conferma o rifiuto della divisione): solo predisposizione dati (D7). Autenticazione vera, email reali, multiplayer in tempo reale (come dal documento).
- Più di 8 partecipanti per processo.
- Pan/zoom libero del mondo: il quartiere ha dimensione fissa e scorre se ci sono molte case.

---

## Decisioni tecniche

- KTD1. **API processi minime** in `src/cleanbreak/api/processes.py`, montate in `app.py`:
  - `GET/POST /api/processes`
  - `GET/PATCH/DELETE /api/processes/{id}`
  - `POST /api/processes/{id}/items` (testo grezzo → parse → valutazione → salvataggio)
  - `PATCH/DELETE /api/processes/{id}/items/{item_id}`
  - `POST /api/processes/{id}/solve` (salva lo split e porta lo stato a `resolved`)

  Riusano `_value_items`, `solve_split` e `parse_messy_inventory` senza duplicare logica. Lo store è un modulo con lock su un file JSON; le scritture sono atomiche (scrittura su file temporaneo, poi `os.replace`).
- KTD2. **Modelli Pydantic nuovi** in `src/cleanbreak/process_models.py`, separati dai modelli a 2 persone che restano per la demo attuale:
  - `Participant`: id, nome, email, `role: member | mediator`.
  - `ProcessItem`: i campi oggetto di oggi, ma con `owner: "shared" | <participant_id>`, `points: {participant_id: int}` e `forced_to: participant_id | null`.
  - `Process`: id, title, kind, status, participants, items con valutazione, split, `review` (D7) e created_at.
  - `MultiSplitResult`: per ogni oggetto destinazione e motivazione, per ogni persona quota spettante, beni ricevuti e punti ottenuti, più la lista dei pagamenti `{from, to, eur}`.

  La valutazione idealo resta `ItemValuation` invariata. I tipi TypeScript in `web/src/types.ts` ricalcano questi modelli a mano.
- KTD7. **Solver a N persone** in `src/cleanbreak/solver/multi.py`, deterministico come quello di oggi:
  - Ogni oggetto ha come destinazioni possibili ciascun membro, più "vendi e dividi" se è conteso e vendibile.
  - Il punteggio massimizza la soddisfazione del membro meno soddisfatto (punti ottenuti / punti assegnati) e penalizza i conguagli grandi. È la stessa idea della modalità "balanced", estesa a N persone.
  - Se le combinazioni sono al massimo 50.000 la ricerca è esatta. Oltre, si parte da un'assegnazione greedy migliorata con mosse e scambi di un oggetto alla volta (con 8 persone e 15 oggetti: meno di 1 secondo).
  - Il conguaglio è esatto: quota spettante = somma di quota di proprietà × valore. Il saldo è beni ricevuti meno quota spettante. I pagamenti si ricavano con l'abbinamento greedy debitore/creditore, che dà al più N−1 pagamenti.
  - L'"arbitraggio compra nuovo" per N persone non è nell'MVP: se un oggetto conteso è in offerta, la modale di dettaglio mostra solo il link idealo.
- KTD3. **Il mondo è un componente React con griglia isometrica CSS** (lotti in `transform: rotateX(60deg) rotateZ(-45deg)`, case come div con facce). Nessun canvas o motore grafico, come da `stack.md`. Dentro la casa la pianta è una griglia CSS di stanze.
- KTD4. **Routing solo con lo stato:** `view = world | house(id)`, e le modali come stato sovrapposto. Niente router: l'URL diventa `#/house/<id>` solo per il ricaricamento della pagina.
- KTD5. **In sviluppo** Vite gira su `:5173` con proxy `/api` → `:8000`. FastAPI aggiunge CORS solo per `localhost:5173`.
- KTD6. **L'export Excel usa SheetJS caricato al primo clic** (`import()` dinamico), così il bundle iniziale non cresce.

---

## Unità di implementazione

Ordine pensato per avere una demo a ogni fase. Le unità con la stessa lettera di fase possono andare in parallelo tra persone diverse.

### U1. API processi e store (Fase A, backend)
- **Goal:** CRUD dei processi, aggiunta e valutazione degli oggetti, calcolo dello split per processo, con il processo demo creato al primo avvio.
- **Requisiti:** R4, R6, R9, R10; KTD1, KTD2; D2, D4, D6.
- **File:** `src/cleanbreak/api/processes.py` (nuovo), `src/cleanbreak/models.py`, `src/cleanbreak/api/app.py`, `.gitignore`, `tests/test_processes.py` (nuovo).
- **Dipende da:** U1b per il calcolo.
- **Test:**
  - Creare un processo con 3 invitati porta lo stato a `draft` con 4 partecipanti `member` e `review.status = none`.
  - Creare un processo senza invitati, o con più di 8 partecipanti, restituisce un errore 422.
  - L'aggiunta di testo grezzo produce oggetti valutati con la modalità live spenta: segnaposto con nota, 0 chiamate (usare il fixture `conftest`), stato `collecting`.
  - Il calcolo salva lo split e porta lo stato a `resolved`. Ricaricare il processo restituisce lo stesso split.
  - Al primo avvio, con lo store vuoto, il processo demo esiste e i suoi 7 oggetti vengono dalla cache (0 chiamate).
  - Le operazioni su un id inesistente restituiscono 404.
- **Verifica:** `pytest` verde, e `curl /api/processes` mostra il processo demo.

### U1b. Solver a N persone (Fase A, backend)
- **Goal:** assegnazione equa e conguagli per 2–8 persone (KTD7), con lo stesso stile di motivazioni per oggetto della versione a 2 persone.
- **Requisiti:** R7, R8; KTD2, KTD7; D1.
- **File:** `src/cleanbreak/process_models.py` (nuovo), `src/cleanbreak/solver/multi.py` (nuovo), `tests/test_multi_solver.py` (nuovo).
- **Test:**
  - Con 2 persone e i 7 oggetti demo, il risultato è equo: ognuno riceve beni più conguaglio pari alla propria quota, al centesimo.
  - Con 3 persone e un oggetto che solo una persona vuole (100 punti), l'oggetto va a lei.
  - Con 4 persone e oggetti tutti condivisi, la somma dei pagamenti in uscita è uguale alla somma di quelli in entrata, e i pagamenti sono al massimo 3.
  - Un oggetto "pagato da X" conta per intero nella quota spettante di X.
  - Un `forced_to` viene sempre rispettato.
  - Con 8 persone e 15 oggetti (ramo greedy) il calcolo finisce in meno di 1 secondo e i conguagli tornano a zero.
- **Verifica:** `pytest` verde, e i test esistenti del solver a 2 persone restano invariati.

### U2. Scaffold `web/` (Fase A, frontend)
- **Goal:** Vite + React + TS + Tailwind in `web/`, proxy `/api`, layout a due livelli (mondo sotto, interfaccia sopra), helper `api()` che porta con sé la gestione errori di oggi.
- **Requisiti:** R1, R10; KTD4, KTD5; D3.
- **File:** `web/` (nuovo), `src/cleanbreak/api/app.py` (CORS in sviluppo).
- **Test:** smoke test manuale (non c'è ancora un sistema di test per il frontend): `npm run dev` mostra il livello del mondo con un header sopra, e una chiamata a un'API rotta mostra il banner d'errore.

### U3. Mondo, `+` e onboarding (Fase B)
- **Goal:** quartiere isometrico, case dal backend, lotto `+`, stato vuoto con il `+` grande, modale di onboarding al primo accesso.
- **Requisiti:** R1, R2, R3, R9; KTD3; D5.
- **File:** `web/src/world/*`, `web/src/overlays/Onboarding.tsx`.
- **Verifica manuale:** con lo store vuoto compare il `+` grande. Con la demo compare una casa con etichetta al passaggio del mouse. L'onboarding appare una sola volta.

### U4. Wizard di creazione (Fase B)
- **Goal:** modale in 3 step; alla creazione appare la casa e si entra.
- **Requisiti:** R4; D1, D4.
- **File:** `web/src/overlays/CreateWizard.tsx`.
- **Verifica manuale:** un'email non valida viene bloccata, servono almeno 2 partecipanti, e dopo "Crea" la casa è nel mondo e si è dentro.

### U5. Dentro la casa: intestazione e Inventario (Fase C)
- **Goal:** intestazione sopra la pianta, tab Inventario con aggiunta da testo, modifica di condizione/anno/chi ha pagato/punti, rimozione, e "Aggiorna da idealo".
- **Requisiti:** R5, R6, R10.
- **File:** `web/src/house/HouseView.tsx`, `web/src/house/Inventory.tsx`.
- **Pattern:** riusa la logica di `frontend/app.js` (budget dei punti, etichette dei segnaposto, stato live).

### U6. Separazione a stanze e dettaglio oggetto (Fase C)
- **Goal:** stanze per persona più zona neutra, tooltip, modale di dettaglio con le prove idealo e lo scambio tra stanze, banner del conguaglio, ricalcolo.
- **Requisiti:** R7, R9.
- **File:** `web/src/house/Separation.tsx`, `web/src/overlays/ItemDetail.tsx`.

### U7. Vista lista ed export Excel (Fase D)
- **Goal:** modale con le colonne per persona, i totali e il conguaglio; export con SheetJS.
- **Requisiti:** R8; KTD6.
- **File:** `web/src/overlays/ListView.tsx`, `web/src/lib/exportXlsx.ts`.
- **Verifica:** il file `.xlsx` si apre con un foglio per persona più un riepilogo, e i totali coincidono con lo split.

### U8. Passaggio al nuovo frontend (Fase D)
- **Goal:** FastAPI serve `web/dist` su `/` e il vecchio frontend su `/legacy`. README e `stack.md` vengono aggiornati con i comandi di build.
- **Requisiti:** D3.
- **Condizione:** si fa solo quando U3–U6 funzionano sul processo demo. Altrimenti il pitch usa `/legacy`.

---

## Fasi e tempi indicativi

| Fase | Unità | Risultato dimostrabile |
|---|---|---|
| A | U1b → U1 ∥ U2 | Solver a N persone e API processi verdi; app vuota sopra il mondo |
| B | U3 ∥ U4 | Mondo con casa demo, onboarding, creazione di un processo |
| C | U5 ∥ U6 | Dentro la casa: inventario e stanze con prezzi idealo |
| D | U7, U8 | Lista ed export, nuovo frontend su `/` |

---

## Sviluppi futuri: mediatore

Un intermediario (avvocato, notaio, perito) potrà confermare o rifiutare la divisione. Il modello dati è già pronto (D7, R11). Quando si farà:

- Il mediatore viene invitato con `role = mediator`. Vede la casa ma non ha una stanza.
- Dopo il calcolo, `review.status` passa a `pending`. Il mediatore approva (`approved`, e la casa mostra un sigillo) oppure rifiuta con una nota (`rejected`, e il processo torna a `collecting`).
- Nuovo endpoint `POST /api/processes/{id}/review`, più un pannello "Revisione" nell'intestazione della casa.
- Nuovo stato visivo della casa per "in revisione" e "approvata".

---

## Design (da completare)

Questa sezione si riempie con le tue idee di design. Le unità che dipendono dall'estetica sono U3 (mondo e case), U6 (stanze) e gli stati visivi della casa (R9). La struttura non cambia.

- Estetica del mondo (terra stilizzata, quartiere, isola): _da definire_
- Stile delle case e varianti per tipo di processo e stato: _da definire_
- Stanze e oggetti (icone, miniature idealo): _da definire_

---

## Rischi

- **Tempo:** se la Fase C non è pronta entro le 18:30, si fa il pitch su `/legacy` (la demo attuale) e si mostra il mondo come anteprima.
- **Solver a N persone (U1b):** è codice nuovo sul percorso critico. Se si blocca, il ripiego è usare il solver a 2 persone per i processi con 2 partecipanti e mostrare "calcolo in arrivo" oltre i 2. Le stanze per N persone funzionano lo stesso.
- **Mediatore futuro (D7):** i campi `review` e `role` vanno solo salvati e restituiti, senza logica, così non costano tempo adesso.
- **Budget idealo:** il processo demo e i test non spendono chiamate (cache e fixture). Gli oggetti nuovi seguono le regole live di sempre.

---

## Verifica e definizione di fatto

- `pytest` verde (test esistenti più `tests/test_processes.py`).
- `npm run build` in `web/` senza errori TypeScript.
- Prova manuale: primo accesso → onboarding → `+` → wizard → casa → aggiunta oggetti → Separazione → dettaglio → Vista lista → export Excel. Con la modalità live spenta, il contatore delle chiamate idealo non si muove.
- Il vecchio frontend resta raggiungibile (`/` o `/legacy`).
