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

## 3. Metafora UI — il Mondo (SimCity / The Sims)

L’intera esperienza è **basata sul diorama**. Non esiste una “lista processi” come schermata primaria.

### 3.1 Il Mondo

- All’ingresso l’utente atterra in un **mondo** (terra / quartiere / piccola città), ispirato a **The Sims / SimCity**.
- Ogni **casa** nel mondo = **un processo**.
- Navigazione spaziale: pan/zoom sul mondo, click su una casa per entrarci.
- Il mondo resta sempre sotto; è il canvas permanente dell’app.

### 3.2 Layering: mondo sotto, UI statica sopra

```text
┌─────────────────────────────────────────────┐
│  Layer UI (sempre sopra il mondo)           │
│  · Header / chrome                          │
│  · Sidebar (se presente)                    │
│  · Modali (onboarding, wizard, lista, …)    │
│  · Tooltips, toast, drawer                  │
├─────────────────────────────────────────────┤
│  Layer Mondo (canvas permanente)            │
│  · Terreno / città / quartiere              │
│  · Case = processi                          │
│  · Slot “+” = crea nuovo processo           │
└─────────────────────────────────────────────┘
```

Regola d’oro: **header, sidebar, modali e ogni chrome statico vivono sopra il mondo**. Il mondo non sparisce: si oscura / resta visibile dietro quando si apre un overlay.

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

- Mondo diorama come landing permanente (SimCity-like)
- Empty world con `+` enorme “Crea il tuo primo processo”
- Modale onboarding al primo accesso
- Wizard creazione (modale sopra il mondo)
- Entrata in casa = dettaglio processo (diorama interno a stanze)
- Inventario e Separazione come overlay/tab sopra la casa
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

Entrando in una casa, il canvas resta diorama: si passa dalla **vista quartiere** alla **vista interna** (pianta della casa, stile The Sims dall’alto).

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

### 6.3 Tab Separazione — diorama stanze

Vista default dentro la casa: **stanze = utenti**.

- Una stanza per ogni partecipante
- Nella stanza fluttuano gli oggetti assegnati (icone/thumb)
- **Hover** oggetto → tooltip rapido (titolo, valore, perché assegnato)
- **Click** oggetto → **modale dettaglio** sopra la casa (prezzo idealo, fair value, ownership, care points, evidence)
- Zona neutra (corridoio / garage / “in bilico”) per oggetti da vendere / buy-new / non assegnati
- Banner settlement flottante: cash equalization

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

- **Il mondo è la home.** Nessuna lista processi come schermata primaria.
- **Case = processi.** Click per entrare, `+` per crearne uno.
- **Tutto il chrome sta sopra il mondo** (header, sidebar, modali, toast).
- Empty state = mondo + `+` enorme, non icona su pagina bianca.
- Primo accesso = modale onboarding che spiega la metafora.
- Wizard e lista sono **overlay**, non navigazioni che distruggono il canvas.
- Dentro la casa: diorama stanze come default; lista solo come modale tool.
- Export e numeri chiari: la magia non nasconde la trasparenza dei valori idealo.

---

## 10. Stack UI (minimo, ship veloce)

Allineato a `docs/stack.md`. Nessuna libreria di animazione / state manager / game engine.

| Pezzo | Tech |
|---|---|
| App | Vite + React + TypeScript |
| Stile | Tailwind CSS |
| API | `fetch` → FastAPI |
| State | `useState` / `useContext` |
| Mondo | React + CSS isometrico (case = processi) |
| Overlay | Modali HTML/Tailwind |
| Export | SheetJS (`xlsx`) quando serve la lista |

Mondo sempre sotto; header / sidebar / modali sempre sopra (`z-index`).

---

## 11. Prossimi passi implementativi

1. Scaffold Vite React TS + Tailwind in `frontend/`
2. Canvas Mondo (terra/città) + layer UI sopra
3. Empty world con `+` enorme
4. Modale onboarding primo accesso
5. Wizard creazione (modale) → spawn casa nel mondo
6. Entrata in casa: diorama stanze + chrome sopra
7. Inventario come overlay
8. Separazione diorama (hover + modale dettaglio oggetto)
9. Modale “Vista lista” + export Excel
10. Collegare FastAPI / solver / idealo

---

## 12. Note aperte (da chiudere in implementazione)

- Estetica mondo: terra stilizzata vs quartiere urbano vs isola
- Quante case max in vista / scroll del mondo
- Invito post-creazione vs obbligatorio nel wizard
- Numero minimo partecipanti
- Dove vive la CTA “ricalcola split” (Inventario vs Separazione / chrome casa)
- Auth / ownership reale multi-utente (MVP può essere single-session multi-persona)
- Persistenza flag “onboarding già visto”
