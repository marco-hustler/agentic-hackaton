# Agentic Hackathon: From Research to Commerce (context note)

> Summary of the prep session on 2026-11-25/26. Use it as context in a new session.
> Sources read: [Luma page](https://luma.com/research-to-commerce), [event page](https://aiagentsberlin.xyz/agentic-hackathon), the four partner brief PDFs (dated 20–23 Nov), the [idealo MCP guide](https://github.com/idealo/mcp-server-guide) and [tool reference](https://github.com/idealo/mcp-server-guide/blob/main/docs/tools.md), and the [norma-mcp README](https://github.com/qualityclouds/norma-mcp). trustboris.ai is a JavaScript app that couldn't be read, so Affinidi info comes from its brief only.

## Decision

- **Main challenge: idealo, "Build Something We Didn't Expect"** (Agentic Commerce track).
- **Optional add-ons**, only if the core is done in time: Norma (any project with a GitHub repo can enter) and Affinidi Boris (either track).
- **Not targeted:** Stackgini (Research track) and Tavily (no published brief, criteria or prize).
- **MVP idea: not chosen yet.** Ideas that were rejected, and why, are under "Lessons" below.

## Event facts

- **When:** Friday 27 Nov 2026 (Black Friday), 14:00–21:00 CET. **Submissions close at 19:45**, live pitches from 20:00, winners at 20:30.
- **Where:** The Delta Campus, Donaustraße 44, 12043 Berlin-Neukölln.
- **Cost and ownership:** free. Teams own their code. Partners may show demos publicly, credited to the team.
- **Teams:** up to 5 people, at least one on site. Solo builders are matched with a team on the day. Find teammates in the [Telegram](https://t.me/aiagentsberlin).
- **Stack:** free choice. Each brief lists only its required partner tool.
- **Prizes:** partner prizes per brief, plus an AIB Builder Pass (€99, includes the AI Agents Summit on 11 Mar 2027) for each eligible winning-team member. The idealo prize isn't stated beyond the award category "Most Creative Use of the idealo MCP".
- **Partner materials** (datasets, keys) go to registered builders by email only.
- **Personal laptop and personal accounts only.** Keep Amazon devices, code and data out of it.

## idealo challenge

**Task:** build an application, agent or prototype that uses idealo commerce data to solve a real problem. The data must be **essential** to what it does. Ideas outside shopping are welcome if commerce data makes them possible. idealo's own examples: help someone decide whether to buy, wait, repair, rent or substitute; spot shortages; plan purchases around a budget.

**Judging** (no weights given):

| Criterion | Their question |
|---|---|
| Creativity | Does it use the idealo MCP in an unexpected way? |
| Meaningfulness | What real problem does it solve, and for whom? |
| Use of the data | How do product, price, availability, merchant or category signals drive the result? |
| Execution | Does the working prototype make the idea tangible? |

**Submission:** standard AI Agents Berlin submission by 19:45. The format isn't explained on the page, so ask at check-in.

## idealo MCP: what it gives and its limits

- **Endpoint:** `https://mcp.idealo.com/mcp` (Streamable HTTP, OAuth with browser login). The MCP login is separate from an idealo website account.
- **Setup in Claude Code:** `claude mcp add --transport http idealo https://mcp.idealo.com/mcp --callback-port 6274`
- **Markets:** DE, AT, GB, FR, IT, ES. An unknown country code silently falls back to DE.

| Tool | Returns |
|---|---|
| `search_products` | Products with an opaque `productRef`. Filters: min/max price, `availableOnly`, `bargainsOnly`, categories, brands, attributes (attribute and size filters require a category ID) |
| `get_product_details` | Top 3 offers, specs (`productSpecification`), pros/cons, idealo expert review, test reports (e.g. Stiftung Warentest grade), price trend |
| `get_product_offers` | All offers, 5 per page (loop until `nextOffset` is 0): price, shop rating, delivery estimate, payment methods, free-return days, shipping cost, shop link (`relocatorUrl`) |
| `get_product_price_history` | **30 days only**: min, max, avg and current price, % change, lowest and highest price dates. `null` for new products |

**Limits that shape any idea:**
- **Trial tier** (default): 500 calls a day per user, 3 per second, **max 10 offers per product**. No user reviews, no test-report links, one image only. The Partner tier (10,000 a day, full data) is by request to mcp@idealo.de. **Ask at check-in whether the event provides it.**
- **Price history is 30 days**, not months.
- **Amazon, eBay and Otto are excluded** from all results.
- **No checkout.** "Buying" means handing over the shop link, or a simulated order.
- `productRef` is short-lived and tied to one country.
- Offer data gives delivery estimates for that market. It doesn't say whether a foreign shop ships to Germany or at what cost, so don't claim cross-border delivery without checking.
- Using the MCP from Claude Code/Cursor handles OAuth for you. A standalone Python app needs an MCP client library with OAuth support: **test that before Friday**.

**Useful data angles** (insights, not ideas):
- The 30-day window matches the **EU Omnibus rule**: a shop advertising a discount must compare it with its lowest price of the previous 30 days. (General knowledge, not from the brief.)
- Shop rating, delivery, return days, payment methods (e.g. invoice) and test grades are richer signals than price alone.
- Combining **several products** into one answer (e.g. a device plus its consumables, or a part versus a replacement) is something the idealo website itself doesn't do.
- 6 markets are available, but few teams will use them.
- Black Friday is the event day, so live deals make the demo timely.

## Lessons: how to win the idealo challenge

From stress-testing a first idea (an employee purchasing agent with manager approvals that learns from past decisions), which was dropped:

1. **idealo data must drive the result, not just feed a search or a threshold filter.** The judges are idealo. If the original part of the idea would work without their data, "use of the data" and "creativity" both score low.
2. **Avoid obvious ideas.** Price comparison, "is this deal real?" and spec-to-product advisors will be common. Creativity has to come from the angle.
3. **One clear demo moment.** Judges remember one "aha". A pitch with six concepts (roles, learning, signals, markets, trust) loses.
4. **Don't fake capabilities.** "Learning" from 10 seeded cases is just an if-rule, and judges will ask what it does that a rule wouldn't.
5. **Check meaningfulness against reality.** Ask "who would actually use this tomorrow?" For example, companies buy through approved suppliers and procurement tools, not consumer shops, and approval limits already exist without AI.
6. **Keep the build to what fits in about 4h45** (15:00–19:45). OAuth MCP client, multi-role UI, data store, a new product (Boris) and Norma paperwork each can eat an hour. A finished narrow demo beats a half-working broad one.
7. **Check every claim against the docs** before it goes into the pitch (see the delivery point above).
8. **Avoid ideas that need data collected over time** (e.g. tracking availability for days).
9. **Be honest about assumptions.** If the agent estimates something idealo doesn't provide (usage, repair cost), show the assumption and let the user edit it.
10. **Mind the call budget:** 500 calls a day. Cache results and don't page through every offer for every product.
11. **Stay simple:** one script or n8n flow, one model, a coding agent writing most of the code.

## Add-on challenges (only if time allows)

**Norma by Quality Clouds** (either track, €150 Amazon gift card split across the team)
- Requires: GitHub repo linked in Norma; **2+ merged PRs from different authors** checked by the Norma GitHub App (a solo builder with two coding agents counts); 1 finding fixed; `DEFENCE.md` in the repo root (one fixed finding, one accepted, one conflict between authors, each with rule, file and reason); demo video of max 2 min (at least 30 s on the conflict); Norma workspace named after the team.
- Scoring /100: consistency across authors 30, accepted trade-off 30, findings fixed 20 (weighted by severity), Production-Ready Score 20. **60 points are for explaining choices.** Tie-break: Norma used inside the agent loop. Empty repo or deleting code to remove findings scores zero.
- Setup: sign up at [norma.qualityclouds.com](https://norma.qualityclouds.com), `claude mcp add --scope user --transport http norma https://api.qualityclouds.ai/mcp`, install the GitHub App. Local `git remote` must match the linked repo. Covers Python, TS/JS, PHP, Dart and frameworks like FastAPI and React.
- MCP tools: `get_rulesets`, `get_rules_for_ruleset`, `live_check`, `get_open_issues`, `register_applied_actions`.
- Cost: about 45–60 min overhead. Out of scans: see Nuno at the Quality Clouds table.

**Affinidi "Trust Boris"** (either track, 1–3 months Boris Pro/Starter)
- Show a task you can hand to the agent **because** of a specific trust control (spending money, sending messages, personal data, risky tools).
- Judged on: a job worth doing ("would someone use this tomorrow?"), trust you can see ("what breaks without Boris?"), more freedom safely ("what did you let it do alone?"), only what matters ("why is each feature there?").
- Features: caller identity, tool gating per caller, agent and model throttles (calls, requests, tokens), prompt/reply screening and personal-data masking, model failover, own models/keys. **No purchase-amount limit**: a euro budget must live in your own code.
- Setup before the event: sign in at trustboris.ai, `brew install --cask affinidi-ai/tap/boris`, `boris doctor`, `boris login --url https://trustboris.ai`. Needs Docker, Mac/Linux, not Safari. New product with little public documentation, so expect setup surprises.
- Only fits if Boris controls the risky step itself. If the risky decision lives in our code, "what breaks without Boris?" has no good answer.

## Before the event (Thursday)

- [ ] Registered on Luma, watch the email for partner materials
- [ ] Team or solo decided
- [ ] Personal laptop: coding agent (Claude Code or Cursor) and model API key ready
- [ ] idealo MCP connected and tested (about 10 calls): check coverage of the categories the idea needs, and whether `productSpecification` holds the fields it needs
- [ ] If building a standalone app: MCP client with OAuth tested
- [ ] MVP idea chosen, with a one-paragraph pitch (problem, who, what the agent does, the demo moment)
- [ ] GitHub repo with a skeleton
- [ ] Optional: Norma signup and GitHub App; Boris CLI installed

## On the day

| Time | What |
|---|---|
| 14:00 | Check-in. Ask: Partner-tier idealo access? How does the AIB submission work? |
| 15:00 | Kickoff, start building |
| ~17:00 | End-to-end flow working, even if rough |
| 18:30 | Feature freeze: bugs, README, demo prep (and Norma `DEFENCE.md` if entered) |
| 19:15 | Record a backup demo video |
| 19:35 | Submit (don't wait for 19:45) |
| 20:00 | Pitches |

Keep a screen recording of the demo in case Wi-Fi or a model API fails. Ask mentors and partner engineers early when stuck on an API.
