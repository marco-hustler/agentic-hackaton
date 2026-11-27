---
title: it-3d — recap di sessione + piano viste di dettaglio (dall'inventario)
type: feat
date: 2026-11-27
branch: it-3d
execution: code
---

# it-3d: recap + piano viste di dettaglio

## 1. Recap (stato al commit `88e32fc`, branch `it-3d`, pushato)

**Branch:** `it-3` → `it-3d` (dedicato al mondo 3D). `DESIGN.md` (design system "Tactical Diorama") è su `it-3` e quindi anche qui. L'app si chiama **Dividealo** (prima CleanBreak; la chiave `localStorage` è ancora `cleanbreak.onboarding.seen`).

**Stack frontend:** `frontend/` con Vite + React 19 + TS + Tailwind v4 + `three` + `@react-three/fiber` + `@react-three/drei`. Dev: `cd frontend && npx vite` (proxy `/api` → FastAPI `:8000`). Backend: `uvicorn cleanbreak.api.app:app --reload --port 8000`.

**Cosa funziona**
- **Landing = mondo isometrico 3D** (`world/WorldCanvas.tsx`): plastico 3x3 lotti, strade, alberi, camera ortografica. Ogni processo è una casa (`world/House.tsx`): tetto colorato per tipo, una pedina per persona, etichetta con stato. Il "+" fluttuante sul primo lotto libero apre il wizard.
- **Flusso di ingresso:** clic su una casa → `CameraRig` centra e zooma → popup "Enter X?" → "Enter house": il tetto vola via, il guscio si abbassa, sale l'interno senza tetto (`world/HouseInterior.tsx`) con **una stanza per persona** (piante per 2/3/4/5 in `world/rooms.ts`) e le pedine entrano ciascuna nella sua stanza. Esc/"World" tornano indietro.
- **Vista casa** (layout come il mockup, diorama a sinistra): `house/HouseNav.tsx` (tab World/Inventory attivi, Split e List & Export disattivati), `house/BalanceCard.tsx` (percentuali, ago di equilibrio, conguaglio), `house/InventoryPanel.tsx` (ricerca, filtro categorie, card espandibile con valutazione idealo, barre priorità), barra scura sotto il diorama con "Rotate".
- **Dati:** l'inventario viene da `GET /api/demo` (scenario Berlino, 7 oggetti, solver a 2 parti). Il server legge idealo **solo dalla cache**: zero chiamate MCP. Gli oggetti vanno nella stanza 0/1 in base a `assignment.action` (`types/inventory.ts → roomForAction`); `sell_split` non ha stanza.
- **Stato dei processi:** solo in memoria nel frontend (`App.tsx`), si perde al reload. Niente API processi ancora.

**Scelte tecniche da ricordare**
- Le etichette 3D NON usano `drei <Html>`: con React 19 StrictMode non si montava. Le etichette sono DOM normale, spostate ogni frame da `world/labels.ts` (`LabelProjector` + registry di ref). Popup di conferma ed etichette stanze passano di lì.
- Camera: `CameraRig` legge camera/controls da `useFrame(state)` (non dagli hook, per il lint `react(immutability)`); "vola" solo quando cambia lo shot, poi lascia libero orbit/pan/zoom.
- Lo "stage" del mondo è un unico `<Canvas>` che cambia posizione via CSS (`.world-stage[data-mode=house]`, `.house-balance`, `.house-panel` in `index.css`), non due canvas.
- Token di design in `index.css` (`.panel`, `.btn-*`, `.pill-*`, `.field`, `.label-sm`); colori 3D in `world/palette.ts`. Colore persona i = `PAWN_COLORS[i]` (0 terracotta, 1 sage, 2 petrol, 3 amber, 4 marrone).

**Limiti noti / debiti**
- Solver e demo sono a **2 parti**: stanze 3–5 restano vuote ("0 items"). Nomi: si mostrano i partecipanti del processo (You, Marco…) mentre i dati demo sono di Alex/Sam.
- "+" aggiungi oggetto disattivato; Split e List & Export disattivati.
- Layout mobile scritto ma non testato a schermo stretto.
- Bundle ~1,2 MB (330 KB gzip) per three.js: candidato a lazy-load.
- `docs/plans/2026-11-27-1515-feat-process-world-ui-plan.md` è **non tracciato** e in parte superato (proponeva `web/` separato e un solver a N persone): da rileggere prima di decidere la persistenza dei processi.

**Vincoli di progetto (memoria)**
- Chiamate idealo MCP solo per test deliberati; default `cache_only`. Live solo con `IDEALO_LIVE_ENABLED=true`.
- Google Stitch MCP è configurato (`claude mcp list`): usarlo come **ispirazione**, non come fonte definitiva. Va caricato in una sessione nuova.
- dioramas.dev (skill `diorama-worlds`): utile come guida di stile (terreno a ritaglio irregolare, low-poly opaco, ombre di contatto, piccole animazioni), non integrabile direttamente.

---

## 2. Piano: viste di dettaglio, partendo dall'inventario

**Obiettivo:** dall'inventario si arriva al dettaglio di ogni oggetto, lo si può correggere (condizione, anno, priorità, assegnazione) e la divisione si ricalcola subito, con il diorama che riflette ogni cambio. Poi si aprono le tab Split e List & Export.

**Principio:** ogni fase finisce con qualcosa di dimostrabile. Nessuna fase richiede chiamate idealo live.

### Fase 0: stato dell'inventario per processo (prerequisito)
Oggi `demo` è un singolo stato globale e immutabile. Serve uno stato modificabile per casa.
- `frontend/src/house/useHouseInventory.ts` (nuovo): per `processId` tiene `valuedItems`, `split`, `selectedItemId`, `loading/error`. Si inizializza da `/api/demo` (copia per processo).
- Azioni: `updateItem(id, patch)`, `setPoints(id, a, b)`, `forceAction(id, action|null)`, `resolve(mode)` → `POST /api/solve` con `{party_a_name, party_b_name, mode, valued_items}`.
- I nomi delle parti passati al solver sono quelli del processo (`names[0]`, `names[1]`), così spariscono Alex/Sam.
- Debounce ~250 ms sul re-solve; il solver è deterministico e veloce (<5 ms).
- **Fatto quando:** cambiare i punti di un oggetto aggiorna BalanceCard e il numero di oggetti nelle stanze.

### Fase 1: selezione oggetto ↔ diorama (bidirezionale)
- Card in lista → `selectedItemId`; nel 3D la cassa dell'oggetto si solleva/pulsa e la camera fa un piccolo pan verso la stanza.
- Clic su una cassa nel 3D → seleziona l'oggetto, scrolla la lista alla card e la apre.
- Serve che `RoomInfo.itemCategories` diventi `items: {id, category}[]` (in `rooms.ts`, `HouseInterior.tsx → Crates`) per avere l'id nella cassa.
- Etichetta DOM sopra la cassa selezionata (nome + valore) via `LabelProjector`.
- **Fatto quando:** clic cassa ↔ card funziona nei due versi.

### Fase 2: vista dettaglio oggetto (il cuore)
Pannello che sostituisce la lista nella colonna destra (con "← Inventory"), non una modale: il diorama resta visibile.
- **Testata:** immagine idealo (`valuation.image_url`), nome, categoria, pill assegnazione, `data_source` (live/cache/stima con `source_note`).
- **Prova idealo:** `top_offers` (shop, prezzo, spedizione, rating, link), `price_history` (min/max/attuale 30 gg come mini sparkline), badge deal se `is_buy_new_deal` (`deal_headline`, `best_buy_new_url`), `offer_count`/`scarcity_level`. Bottone agente (stile `btn-agent`) "Aggiorna da idealo" visibile ma disattivo se il live è spento (`GET /api/idealo/status`).
- **Svalutazione modificabile:** select condizione + anno di acquisto (+ override %), che chiama `POST /api/reapply-depreciation` (0 chiamate MCP) e aggiorna il valore equo.
- **Priorità:** due slider punti (0–100) per A e B, che chiamano `setPoints` e poi il re-solve.
- **Assegnazione:** controllo segmentato (A / B / Vendi / Automatico) → `forced_action`, poi re-solve; mostra `assignment.rationale`.
- **Fatto quando:** modificando condizione o punti, valore, assegnazione, balance e stanze cambiano insieme.

### Fase 3: dettaglio stanza (persona)
- Clic sull'etichetta di una stanza (o sulla stanza) → zoom camera sulla stanza e filtro della lista per persona: totale valore ricevuto, oggetti, conguaglio di quella persona.
- Per stanze 3–5 (solver a 2 parti): stato vuoto onesto ("il solver a più persone arriva dopo"), nessun dato finto.

### Fase 4: aggiungi oggetto
- "+" attivo: modale con due strade. (a) Form manuale (nome, categoria, anno, condizione, punti). (b) Testo libero → `POST /api/parse`.
- Valutazione con `POST /api/value` in `mode: "cache_only"`; se manca in cache → valore stimato con pill "Estimate". Il live resta dietro il flag e un'azione esplicita.
- La nuova cassa "cade" nella stanza assegnata dopo il re-solve.

### Fase 5: tab Split
- Modalità solver (`balanced` / `min_cash` / `liquidate_contested`) come segmented control → re-solve.
- Riepilogo: totali, `fairness_score_pct`, `is_envy_free`, `cash_transfer_summary`, `arbitrage_highlights`, `replacement_basket` (link idealo), `mediator_summary` (`POST /api/summary`, in background, mai bloccante).
- Nel diorama: oggetti contesi evidenziati in ambra.

### Fase 6: tab List & Export
- Modale tabella completa (ordinabile) sopra la casa + export Excel con SheetJS (`xlsx` è già in `package.json`), import dinamico.

### Fuori da questo piano (da decidere a parte)
- Persistenza processi (`/api/processes`, vedi piano non tracciato) e solver a N persone: senza questi le stanze 3–5 restano vuote.
- Lazy-load del mondo 3D e test mobile.

### Ordine consigliato e verifica
0 → 2 → 1 → 5 → 4 → 3 → 6. La fase 2 dà il valore più visibile per la demo. Verificare ogni fase nel browser (`npx vite` + chrome-devtools MCP), con `npx tsc -b` e `npx oxlint src` puliti, e controllare che il contatore del budget idealo (`data/idealo_budget.json`) non si muova.
