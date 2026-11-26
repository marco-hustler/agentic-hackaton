# Technology stack

> Living document: start from confirmed choices and fill in detail step by step.  
> Track: **Agentic Commerce** · Challenge: **idealo** (primary)

---

## Confirmed choices

| Layer | Tool | Role |
|---|---|---|
| **Commerce data** | **idealo MCP** | Catalog, prices (current + ~30-day history), availability, merchants, categories |

---

## What each piece does (high level)

### idealo MCP
Commerce data source. Anything the agent decides about products/prices/offers must go through here — matches the idealo brief “Use of the data” criterion.

---

## Out of scope for now

| Tool | Notes |
|---|---|
| **Affinidi / Trust Boris** | Deferred — not part of the current idea/MVP |
| **Norma** | Optional later (code governance); not required for the idealo pitch |

---

## Still to decide

Fill in over the next steps:

- [ ] App language / runtime (e.g. TypeScript, Python, …)
- [ ] Agent hosting / runtime
- [ ] UI / user interface (chat, web app, CLI, …)
- [ ] Orchestration (n8n, custom, …)
- [ ] LLM provider / model
- [ ] GitHub repo
- [ ] Other MCPs or tools beyond idealo

---

## Setup (checklist, to expand)

### Pre-hackathon
- [ ] Access / credentials for **idealo MCP** (when available to participants)
- [ ] GitHub repo ready

### Build day
- [ ] Agent wired to idealo MCP
- [ ] End-to-end: inventory → comps → split report

---

## Notes / open questions

_Space for decisions as we go:_

- …
