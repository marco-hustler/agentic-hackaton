# CleanBreak — Fair Household Split

> **Primary challenge:** idealo — *Most Creative Use of the idealo MCP* (Agentic Commerce track)  
> **Working name:** CleanBreak *(alternatives: EquiSplit, SplitFair)*

---

## One-Liner

> *When a household splits, people don't fight over what they own—they fight over what it's worth. CleanBreak turns idealo's live market data into a neutral mediator that values, balances, and settles the split.*

---

## How It Works Under the Hood (3 Simple Layers)

No magic, no black boxes—easy to explain to judges in 30 seconds:

```text
[1. INPUT]                    [2. IDEALO ORACLE]                 [3. FAIR SPLIT ENGINE]
Messy items + who paid        idealo MCP (cached locally)        Exact Python math (not LLM!)
+ 100 Care Points each   ──►  • Trusted price (rated shops) ──►  • Optimal A / B assignment
                              • Age depreciation = Fair Value    • Exact cash equalization (€)
                              • 30-day price trend (Black Fri)   • "Stop fighting, buy new" alert
                              • Availability & substitutes       • 1-click idealo replacement links
```

**Where does the LLM fit?** Only in the two fuzzy human tasks—never in the math:
1. **Parse** messy human notes / WhatsApp text into structured items (and pick a substitute query if an old model is discontinued).
2. **Explain** the final verdict in 3 calm, neutral sentences grounded in the idealo evidence.

Everything else (trusted price calculation, depreciation, exact partition optimization, cash transfer) is **100% deterministic Python**—auditable, fast (<5 ms), and impossible to hallucinate.

---

## Real Problem & Sweet Spot

In a breakup, Berlin WG (flatshare) move-out, or amicable estate split, two parties must divide shared household items. Fighting happens because:
1. Nobody agrees on what a used item is fairly worth today.
2. Both people claim the same favorite item (e.g., the espresso machine).
3. Simple "50/50 euro split" ignores who paid originally and who actually cares about each item.

**Catalog sweet spot (important for idealo coverage):** Focus on **high-value branded household assets** where idealo has deep, trustworthy catalog & offer coverage—coffee machines, vacuums, TVs, audio, kitchen appliances, gaming consoles, bikes—plus one discontinued older model to showcase **category-substitute valuation**. *(Avoid generic/IKEA furniture where idealo has weak coverage.)*

---

## How All 5 idealo MCP Signals Drive the Verdict

| idealo MCP Signal | MCP Tool | Role in the Split |
|---|---|---|
| **Catalog & Specs** | `search_products`, `get_product_details` | Maps vague user text (*"our 2023 Sage espresso machine"*) to a real product; finds spec-matched **category substitutes** for discontinued models (backed by specs / test grades). |
| **Trusted Offers + Shipping** | `get_product_offers` | Computes **Trusted Market Price** (median of well-rated merchants including shipping) so neither party can cherry-pick a sketchy outlier price. |
| **30-Day Price History** | `get_product_price_history` | Drives the **Contention Arbitrage ("Stop Fighting, Buy-New Deal")** signal: if both parties fight over an item that's currently at a 30-day / Black Friday low, propose *"A keeps used, B takes cash buyout + buys brand-new today via idealo."* |
| **Availability / Scarcity** | `get_product_offers` | Measures **Replacement Friction** (many shops + fast delivery vs. scarce/out-of-stock → higher replacement difficulty). |
| **Categories** | `search_products` | Powers fallback substitute search and helps balance categories across parties. |

**Honest Used-Item Valuation (New ≠ Used):**  
idealo gives today's **Replacement Value** (new). CleanBreak explicitly applies a transparent, user-editable **Age/Condition Depreciation** curve (e.g., 15% year 1, 10%/year after, floor 30%) to compute **Fair Settlement Value**—so every euro is traceable and editable.

---

## Feature Priorities (P0 / P1 / P2)

Built for a **3-person async team** targeting a rock-solid demo by **17:00 Friday** (feature freeze **18:30**, submit **19:30**).

### P0 — Must-Have Core *(Wins the challenge on its own · target: 17:00)*
- [x] **Preloaded realistic Berlin WG/couple scenario** (6–7 branded items + 1 discontinued model) with editable ownership (`Shared 50/50`, `Paid by A`, `Paid by B`) and **100-point priority budgets** per party (prevents rating everything 10/10). *(Status: done. Each card has a Who paid dropdown and Alex and Sam point steppers. Each person is capped at 100 points, and new items only take the points that are left.)*
- [ ] **Live idealo MCP valuation pipeline** with local JSON disk cache (respects 500 calls/day limit and guarantees zero-crash pitch fallback, with a visible `Live MCP` / `Cached` badge). *(Status: probed and cached for the 7 demo items. Warnings say in plain words when sample prices are shown. Still needs a live test against idealo.)*
- [ ] **Transparent Fair Value**: Trusted Market Price × editable Depreciation factor. *(Status: the Worth vs new slider moves in 1% steps, and moving it back to the suggested value clears the override. Fixed a bug that shrank the shop count when the slider moved. Not tested with users yet.)*
- [ ] **Exact Deterministic Fairness Solver**: evaluates all A/B/Sell assignments, maximizes joint care points while balancing euro equity, and computes the exact **Cash Equalization (€)** transfer. *(Status: optimizer and tests pass. Contested now depends on each person's average points, and the buyer's top-up counts as money spent. Large lists not tested in the UI.)*
- [ ] **Signature "Aha!" — Contention Arbitrage Card**: detects when both parties put high care points on an item that is at a real **30-day / Black Friday low** on idealo → recommends *"A keeps used, B takes buyout & buys new today"* with direct merchant link. *(Status: triggers on the Sonos Era 300 in the demo. Shown as one box above the columns with the only orange button. Not tested on a projector.)*
- [ ] **Projector-ready Split Board UI**: Party A vs. Party B vs. Buy-New/Sell columns, big settlement banner, and expandable **idealo Evidence Drawer** per item. *(Status: settlement block, two columns and Details drawer tested in a browser at 1280 px in light and dark. Not tested on a projector or a phone after the last changes.)*

### P1 — High-Impact Polish *(Makes the live demo shine · target: 17:00–18:30)*
- [x] **Interactive "What-If" Controls**: click to swap any item between A and B or drag a depreciation slider → totals & cash transfer recalculate instantly (0 extra MCP calls). *(Status: done. Swap moves the card to the top of the other column and shows Undo swap. Points, who paid and the slider re-solve at once. Reset changes undoes everything. Tested in the browser.)*
- [ ] **3 Split Strategy Tabs**: *Balanced (Max Happiness)* · *Min Cash Transfer* · *Sell Contested Items*. *(Status: tabs are Balanced, Least cash and Sell contested. Sell contested shows a Sell and split section. Its UX still needs a review.)*
- [ ] **Live Messy-Text Input (LLM-agnostic)**: paste a raw sentence (*"PS5 Slim from 2024, split 50/50"*) → LLM parses + live idealo MCP prices it on the fly. *(Status: the regex fallback now keeps only the product name. Added items can be edited like any other card. Real LLM provider not wired or tested yet.)*
- [ ] **Re-Equip Replacement Basket**: shows the moving-out party direct idealo replacement links funded by their settlement payout. *(Status: shown as a list with idealo links. Links not checked against live idealo.)*
- [ ] **Neutral Mediator Summary (LLM-agnostic)**: 3-sentence calm rationale grounded in the exact idealo numbers. *(Status: the deterministic summary is one line on purpose, since the settlement shows the numbers. Real LLM summary not wired or tested yet.)*

### P2 — Stretch *(Only if ahead of schedule after 18:00; skip freely)*
- [ ] Category-balance weighting penalty. *(Status: not started.)*
- [ ] Printable / exportable Markdown settlement receipt. *(Status: not started.)*
- [ ] Norma (Quality Clouds) add-on (`DEFENCE.md` + 2-author PR workflow). *(Status: not started.)*

---

## Judging Alignment

| idealo Criterion | How CleanBreak Wins It |
|---|---|
| **Creativity** | Non-shopping emotional domain (breakups / WG splits) + game-theoretic 100-point budgets + Black Friday conflict arbitrage. |
| **Meaningfulness** | Real conflict almost everyone in Berlin has lived through; immediately usable without lawyers. |
| **Use of the data** | All 5 idealo signals directly drive valuation, fairness weights, substitute matching, and buy-new arbitrage—impossible without idealo MCP. |
| **Execution** | Working Python + idealo MCP prototype with live valuation, exact deterministic math, interactive swaps, and cached pitch safety net. |
