# CleanBreak — Flussi utente & UX processi

> Specifica concettuale da cui parte l’implementazione UI/UX dei processi.  
> Focus iniziale: **flusso utenti standard senza mediatore**.  
> Product: CleanBreak · Track Agentic Commerce · idealo MCP

---

## 1. Attori

| Ruolo | Chi è | Cosa fa |
|---|---|---|
| **Mediatore** | Avvocato divorzista, notaio, perito, o altra figura imparziale | Avvia e guida il processo, invita le parti, supervisiona inventario e output |
| **Utente finale** | Marito/moglie, figli, coinquilini, soci, ecc. | Partecipa a un processo: inserisce oggetti, assegna priorità, vede la divisione |

Per questa fase implementiamo solo il percorso **utente finale senza mediatore**. Il percorso con mediatore riuserà lo stesso scheletro di flusso.

---

## 2. Tipi di processo

Due modalità di processo:

1. **Con mediatore** — il mediatore avvia e orchestra
2. **Senza mediatore** — gli utenti finali si auto-organizzano *(scope attuale)*

Entrambe seguono lo stesso pipeline logico:

```text
Avvio processo
    → Invito collaboratori
    → Inserimento input oggetti (inventario)
    → Calcoli software (idealo + fair-split engine)
    → Output: come sono divisi gli oggetti (+ eventuale cash equalization)
```

---

## 3. Metafora UI — il Mondo (SimCity / The Sims) in **3D**

L’intera esperienza è **basata su un diorama 3D** (non una lista, non un mockup flat 2D fingendo di essere 3D).  
Riferimento: quartiere / case stile **The Sims / SimCity**, vista obliqua/isometrica, oggetti e case come modelli nello spazio.

### 3.1 Il Mondo (obbligo: 3D)

- All’ingresso l’utente atterra in un **mondo 3D** (terra / quartiere / piccola città).
- Ogni **casa 3D** nel mondo = **un processo**.
- Navigazione spaziale reale: orbit / pan / zoom sulla scena 3D, click su una casa per entrarci.
- Il canvas WebGL resta sempre sotto; è il layer permanente dell’app.
- **Non accettabile come “mondo”:** sola griglia CSS, card HTML, o SVG flat senza profondità 3D.

### 3.2 Layering: mondo sotto, UI statica sopra

```text
┌─────────────────────────────────────────────┐
│  Layer UI (sempre sopra il mondo)           │
│  · Header / chrome                          │
│  · Sidebar (se presente)                    │
│  · Modali (onboarding, wizard, lista, …)    │
│  · Tooltips, toast, drawer                  │
├─────────────────────────────────────────────┤
│  Layer Mondo 3D (WebGL / R3F, permanente)   │
│  · Terreno / città / quartiere in 3D        │
│  · Case 3D = processi                       │
│  · Slot “+” 3D = crea nuovo processo        │
└─────────────────────────────────────────────┘
```

Regola d’oro: **header, sidebar, modali e ogni chrome statico vivono sopra il diorama 3D** (DOM overlay). Il mondo 3D non sparisce: si oscura / resta visibile dietro quando si apre un overlay.

### 3.3 Empty world (utente nuovo)

Se l’utente non ha processi:

- Il mondo esiste già (terra/città vuota o con lotto vuoto)
- Al centro (o sul lotto principale) un **+ enorme** con copy tipo: **“Crea il tuo primo processo”**
- Click sul `+` → apre il wizard di creazione (modale sopra il mondo)

### 3.4 Mondo con processi

- Ogni processo = una casa sul lotto
- Visivamente differenziabili per tipo (separazione, eredità, coinquilini…) e/o stato
- Label leggera su hover/focus: titolo processo, partecipanti, stato
- Click casa → **entra nella casa** (zoom-in sul dettaglio processo in diorama interno)
- Slot libero / CTA `+` per aggiungere un altro processo

### 3.5 Onboarding al primo accesso

Al **primo accesso** (flag locale / sessione):

- Si apre una **modale di onboarding** sopra il mondo
- Spiega in 2–4 step come funziona:
  1. Il mondo = i tuoi processi (ogni casa è uno split)
  2. Crei una casa, inviti le persone, riempi l’inventario
  3. CleanBreak valuta con idealo e propone la divisione equa
- CTA finale: **Inizia** / **Crea il tuo primo processo** (chiude onboarding e evidenzia il `+`)

---

## 4. Scope implementazione attuale

**In scope**

- Mondo **diorama 3D** come landing permanente (SimCity-like)
- Empty world 3D con `+` enorme “Crea il tuo primo processo”
- Modale onboarding al primo accesso (DOM sopra il 3D)
- Wizard creazione (modale sopra il mondo)
- Entrata in casa = dettaglio processo in **diorama 3D interno** (stanze)
- Inventario e Separazione come overlay/tab DOM sopra la scena
- Vista lista = **modale** aperta sopra la casa (non una schermata alternativa)
- Export Excel dalla vista lista

**Out of scope (per ora)**

- Flusso mediatore dedicato
- Auth completa / gestione account reale
- Notifiche email reali (invite può essere mock/stub)
- Multiplayer real-time sul mondo

---

## 5. Flusso utente senza mediatore

### 5.1 Entry point — Il Mondo

Quando l’utente entra in app, atterra sempre sul **Mondo**.

| Condizione | Cosa vede |
|---|---|
| Primo accesso | Mondo + **modale onboarding** |
| Nessun processo | Mondo vuoto + **`+` enorme** “Crea il tuo primo processo” |
| Ha processi | Mondo con **case** (una per processo) + slot `+` per aggiungerne |

### 5.2 Wizard creazione processo

Si apre come **modale / overlay sopra il mondo**. Step lineari. Alla conferma nasce una nuova casa nel mondo e si entra subito dentro.

#### Step 1 — Tipo di processo

- Separazione (coppia)
- Eredità
- Altro tipo di separazione (es. coinquilini / WG, soci, ecc.)

UI: card selezionabili, una sola scelta obbligatoria. Opzionale: titolo/descrizione (default dal tipo).

#### Step 2 — Invita utenti

- Campo email (multi-add): email → Enter/Add → chip
- Validazione formato email
- Default proposto: **almeno 2 partecipanti totali** (inclusa chi crea)
- Copy: “Invieremo un invito a collaborare a questo processo”

#### Step 3 — Conferma / creazione

- Riepilogo tipo + invitati
- CTA **Crea processo**
- On success → chiude wizard → **nuova casa appare nel mondo** → zoom/entrata nel dettaglio casa

---

## 6. Dentro la casa — dettaglio processo

Entrando in una casa, il canvas resta **3D**: si passa dalla **vista quartiere** alla **vista interna** (pianta/volumi della casa, stile The Sims, ancora nello stesso motore 3D).

### 6.1 Header / chrome sopra la casa

Sopra il diorama interno restano:

- Titolo processo, tipo, partecipanti, stato
- Azioni (es. invita, settings, esci → torna al quartiere)
- Switch tab / modalità: **Inventario** | **Separazione**

Il chrome non sostituisce il mondo: fluttua sopra.

### 6.2 Tab Inventario

Overlay / pannello sopra la pianta (o lista flottante laterale), non una pagina separata.

Ogni item mostra (pipeline idealo MCP + input utente):

| Campo | Fonte tipica |
|---|---|
| Titolo | utente / parse LLM |
| Immagine | idealo / placeholder |
| Descrizione | utente + match prodotto |
| Prezzo (nuovo / mercato) | idealo offers |
| Valore stimato dopo utilizzo | fair value (depreciation) |
| Utilizzo / condizione / età | input utente |
| Chi ha pagato / ownership | input utente |
| Priorità / care points | input utenti |

Azioni MVP: aggiungi / modifica / rimuovi oggetto. (Opzionale: paste testo grezzo → parse.)

### 6.3 Tab Separazione — diorama 3D stanze

Vista default dentro la casa: **stanze 3D = utenti**.

- Una stanza/volume 3D per ogni partecipante
- Nella stanza fluttuano gli oggetti assegnati (mesh / billboard / thumb in 3D)
- **Hover** oggetto → tooltip DOM rapido (titolo, valore, perché assegnato)
- **Click** oggetto → **modale dettaglio** sopra la scena (prezzo idealo, fair value, ownership, care points, evidence)
- Zona neutra (corridoio / garage / “in bilico”) per oggetti da vendere / buy-new / non assegnati
- Banner settlement flottante (DOM): cash equalization

### 6.4 Vista Lista = modale sopra la casa

La lista **non** è una schermata o un route alternativo.

- Dalla Separazione, CTA tipo **“Vista lista”** / **“Apri lista”**
- Si apre una **modale (o drawer largo) sopra la casa**
- Contenuto: sezioni/colonne per utente, totali € e punti, settlement, export
- Chiudendo la modale si torna al diorama stanze (la casa resta sotto)

### 6.5 Export

Dalla modale lista:

- **Export Excel** (sheet per utente + riepilogo totals / cash transfer)
- Opzionale CSV

---

## 7. Mappa esperienza (senza mediatore)

```text
[App entry]
    └─► MONDO (canvas permanente, sempre sotto)
            │
            ├─ (primo accesso) Modale onboarding ──► chiude / evidenzia “+”
            │
            ├─ (nessuna casa)  “+” enorme → Crea il tuo primo processo
            │
            └─ (case presenti) click casa / click “+”
                    │
                    ├─► Wizard (modale sopra il mondo)
                    │       ├─ 1. Tipo processo
                    │       ├─ 2. Invita utenti (email)
                    │       └─ 3. Crea → nuova casa + entra
                    │
                    └─► DENTRO LA CASA (diorama interno)
                            ├─ Chrome/header sopra
                            ├─ Inventario (pannello/overlay)
                            └─ Separazione (stanze diorama)
                                    └─ CTA “Vista lista”
                                            └─► Modale lista (+ export Excel)
                                                    sopra la casa
```

---

## 8. Stati processo (proposta)

| Stato | Significato | Hint visivo sulla casa (idea) |
|---|---|---|
| `draft` | Creato, inventario incompleto | Casa in costruzione / impalcature |
| `collecting` | Partecipanti stanno inserendo oggetti | Luci accese, gente che porta scatoloni |
| `ready` | Inventario pronto per calcolare | Casa “pronta” |
| `resolved` | Split calcolato | Bandierina / check sulla casa |
| `closed` | Archiviato | Casa spenta / grigia |

Transizioni minime MVP: `draft` → `collecting` → `resolved`.

---

## 9. Principi UI

- **Il mondo 3D è la home.** Nessuna lista processi come schermata primaria.
- **Case 3D = processi.** Click per entrare, `+` per crearne uno.
- **Diorama = WebGL 3D**, non CSS fake-isometric.
- **Tutto il chrome sta sopra il mondo** (header, sidebar, modali, toast in DOM).
- Empty state = scena 3D + `+` enorme, non icona su pagina bianca.
- Primo accesso = modale onboarding che spiega la metafora.
- Wizard e lista sono **overlay DOM**, non navigazioni che smontano la scena.
- Dentro la casa: diorama 3D stanze come default; lista solo come modale tool.
- Export e numeri chiari: la magia non nasconde la trasparenza dei valori idealo.

---

## 10. Stack UI (minimo + 3D)

Allineato a `docs/stack.md`.

| Pezzo | Tech |
|---|---|
| App | Vite + React + TypeScript |
| Stile / chrome | Tailwind CSS |
| API | `fetch` → FastAPI |
| State | `useState` / `useContext` |
| **Mondo / casa (3D)** | **React Three Fiber + Three.js + Drei** |
| Overlay | Modali HTML/Tailwind sopra il canvas |
| Export | SheetJS (`xlsx`) quando serve la lista |

Scena 3D sempre sotto; header / sidebar / modali sempre sopra (`z-index` DOM).

---

## 11. Prossimi passi implementativi

1. [x] Scaffold Vite React TS + Tailwind in `frontend/` (+ legacy Split Board in `frontend/legacy/`)
2. [x] Shell app + overlay (onboarding, wizard) — mondo ancora stub 2D da sostituire
3. **Sostituire lo stub con diorama 3D (R3F): quartiere + case + `+`**
4. Entrata in casa: diorama 3D stanze + chrome sopra
5. Inventario come overlay DOM
6. Separazione 3D (hover + modale dettaglio oggetto)
7. Modale “Vista lista” + export Excel (SheetJS già in deps)
8. Collegare FastAPI process API / solver / idealo (oggi: stub locale + `/api/health`)

---

## 12. Note aperte (da chiudere in implementazione)

- Estetica mondo: terra stilizzata vs quartiere urbano vs isola
- Quante case max in vista / scroll del mondo
- Invito post-creazione vs obbligatorio nel wizard
- Numero minimo partecipanti
- Dove vive la CTA “ricalcola split” (Inventario vs Separazione / chrome casa)
- Auth / ownership reale multi-utente (MVP può essere single-session multi-persona)
- Persistenza flag “onboarding già visto”
