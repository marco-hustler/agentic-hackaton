# Idea — Fair split of a dissolving household

> Primary challenge: **idealo** (*Most Creative Use of the idealo MCP*)  
> Track: Agentic Commerce

---

## Frame

**“Who keeps what — without fighting over values.”**

Breakups, roommates leaving a shared flat, soft inheritance: two (or more) parties need to divide physical belongings. The usual fight is not *what exists*, but *what it’s worth* and *who has a claim*.

The agent is not a shopping bot: it uses **idealo commerce data** as a **fairness engine** — market prices, categories, availability — to propose a weighted, documented split.

---

## Real problem

In a separation / end of cohabitation / amicable inheritance:

1. There is an inventory of items (furniture, appliances, tech, …)
2. Each party has different claims (who paid, who cares, who uses it)
3. There is no shared “fair price” → conflict over subjective values
4. What’s needed is a **balanced** assignment proposal, grounded in market evidence, not opinions

---

## Flow (use case)

### 1. User input (per item)

Inventory can be vague, for example:

| Field | Example | Notes |
|---|---|---|
| Description | “grey IKEA sofa ~2019” | Fuzzy match OK |
| Who bought it | Party A | Soft/hard constraint |
| When | 2019 | For depreciation / comps |
| Purchase price | €499 | Historical cost (optional) |
| Usage | High / medium / low | Weight in the split |
| Who cares | Party B, score 8/10 | Preference |
| Willing to sell | Yes / no | If “sell and split cash” |

### 2. Lookup via idealo MCP

For each inventory line the agent queries idealo:

| idealo data | Role in fairness |
|---|---|
| **Market comps** | Current value of the item (or closest match) |
| **Category substitutes** | If no exact match → analogous product in the same category |
| **Current prices + short history (~30 days)** | Anchor current value; recent trend for sell/split timing |
| **Availability** | If a party wants to sell and split cash: live offers / merchants |

Note: MCP price history is ~30 days — not enough to audit old purchase claims (e.g. 2019). Fairness is grounded in **today’s** market comps (+ simple depreciation heuristics if needed), not long historical proof.

### 3. Assignment optimization

Not just “equal total price.” A **weighted** split across several levels:

- **Market value** (comps / substitutes)
- **Category** (e.g. balance appliances vs. furniture, not only €)
- **Usage** (who uses it more / how much it was used)
- **Ownership constraints** (who paid for it)
- **Preferences** (who cares)
- **Cash exit** (sell + split, if the market has availability)

Output: one (or more) **split combinations** — “Party A keeps X,Y; Party B keeps Z,W; item Q sell and split 50/50” — with a rationale grounded in the data.

### 4. Output

- Proposed assignment per party
- Estimated value per side (total and by category)
- Residual gap and how to close it (cash, sale, swap)
- Trace: which idealo product anchored each estimate

---

## Why it’s creative (idealo criterion)

| Judge criterion | How we hit it |
|---|---|
| **Creativity** | Commerce data as a fairness engine, **not** as a shop |
| **Meaningfulness** | Separations / roommates / soft inheritance — real fights over values |
| **Use of the data** | Product, price, category, availability drive assignments and cash exits |
| **Execution** | Prototype: inventory → MCP → documented split proposal |

---

## MVP scope (hackathon)

Minimum tangible in one day:

1. Form / chat: vague inventory (3–10 items) + basic preferences
2. idealo MCP calls → comps / substitutes per item
3. Assignment heuristic (value balance + simple constraints)
4. Report: “who keeps what” + estimated totals + product trace links

Out of MVP: multi-party trust isolation, legal app, real-time sync, heavy preference ML.

---

## Open questions

- [ ] Default weights (value vs. preference vs. who-paid) — configurable or fixed?
- [ ] Fuzzy matching: how far to push category substitutes before asking for clarification?
- [ ] UI: agent chat vs. inventory table + report
- [ ] How many parties in MVP (fixed 2 vs. N)
- [ ] Product naming / pitch one-liner

---

## Pitch one-liner

> *Commerce data to split a household without fighting over prices: idealo values, the agent balances.*

---

*Idea doc · update as MVP and naming lock in.*
