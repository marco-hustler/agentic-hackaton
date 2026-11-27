const state = {
  scenarioName: "",
  partyA: "Alex",
  partyB: "Sam",
  country: "DE",
  mode: "balanced",
  valuedItems: [],
  split: null,
  openDetails: new Set(),
  // Item ids that recently changed column, most recent first. Those cards render on top.
  recentMoves: [],
  columnOf: {},
  trackMoves: false,
  scrollTo: null,
  focusKey: null,
  // Starting points, ownership and swap for each item, used by Reset changes.
  initial: {},
};

function remember(item) {
  state.initial[item.id] = {
    party_a_points: item.party_a_points,
    party_b_points: item.party_b_points,
    ownership: item.ownership,
    party_a_share: item.party_a_share ?? null,
  };
}

const POINT_BUDGET = 100;
const POINT_STEP = 1;
const HOLD_DELAY_MS = 350;
const HOLD_REPEAT_MS = 60;
const SOLVE_DELAY_MS = 250;

// One number format everywhere: €1,215 and €196.03.
const eur = (n) => `€${Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
const eur2 = (n) => `€${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (f) => `${Math.round(Number(f || 0) * 100)}%`;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Item names and shop names come from user text and idealo; never inject them raw.
function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const PRIMARY_BTN = "inline-flex items-center justify-center h-9 px-4 rounded-lg bg-accent text-on-accent font-medium transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";
const STEP_BTN = "pt-step w-7 h-7 rounded-md border border-line bg-card text-ink2 leading-none transition-[background-color,color,transform] duration-150 ease-out hover:bg-raised hover:text-ink active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-card disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const PARTY_TEXT = { party_a: "text-alex", party_b: "text-sam" };
// lucide "scale", drawn at the size of the small tag text.
const SCALE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>`;

const pointsKey = (party) => (party === "party_a" ? "party_a_points" : "party_b_points");
const partyName = (party) => (party === "party_a" ? state.partyA : state.partyB);

function pointsUsed(party) {
  const key = pointsKey(party);
  return state.valuedItems.reduce((sum, vi) => sum + Number(vi.item[key] || 0), 0);
}

function budgetLine(party) {
  const left = POINT_BUDGET - pointsUsed(party);
  if (left === POINT_BUDGET) return "has not placed any points yet";
  if (left === 0) return `has placed all ${POINT_BUDGET} points`;
  return left > 0 ? `has ${left} of ${POINT_BUDGET} points left to place` : `is ${-left} points over`;
}

async function loadDemo() {
  const res = await fetch(`/api/demo?mode=${state.mode}`);
  const data = await res.json();
  state.scenarioName = data.scenario_name;
  state.partyA = data.party_a_name;
  state.partyB = data.party_b_name;
  state.country = data.country || "DE";
  state.valuedItems = data.valued_items;
  state.valuedItems.forEach((vi) => remember(vi.item));
  state.split = data.split;
  setWarning(data.warning);
  render();
}

async function resolveSplit() {
  const res = await fetch("/api/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      party_a_name: state.partyA,
      party_b_name: state.partyB,
      mode: state.mode,
      valued_items: state.valuedItems,
    }),
  });
  state.split = await res.json();
  render();
}

let solveTimer = null;
function scheduleSolve() {
  clearTimeout(solveTimer);
  solveTimer = setTimeout(() => {
    state.trackMoves = true;
    resolveSplit();
  }, SOLVE_DELAY_MS);
}

async function refreshViaLiveIdealo() {
  const btn = document.getElementById("btnLiveIdealo");
  btn.disabled = true;
  btn.textContent = "Querying idealo";
  try {
    const items = state.valuedItems.map((vi) => vi.item);
    const res = await fetch("/api/value", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, country: state.country, mode: "live_or_cache" }),
    });
    const data = await res.json();
    state.valuedItems = items.map((item, i) => ({ item, valuation: data.valuations[i] }));
    setWarning(data.warning);
    await resolveSplit();
  } finally {
    btn.disabled = false;
    btn.textContent = "Refresh from idealo";
  }
}

async function resetChanges() {
  const btn = document.getElementById("btnReset");
  btn.disabled = true;
  try {
    await Promise.all(
      state.valuedItems.map(async (vi) => {
        Object.assign(vi.item, state.initial[vi.item.id], { forced_action: null });
        if (vi.item.depreciation_override == null) return;
        vi.item.depreciation_override = null;
        const res = await fetch("/api/reapply-depreciation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item: vi.item, valuation: vi.valuation }),
        });
        vi.valuation = await res.json();
      })
    );
    state.recentMoves = [];
    await resolveSplit();
  } finally {
    btn.disabled = false;
  }
}

async function setOwnership(itemId, ownership) {
  const entry = state.valuedItems.find((vi) => vi.item.id === itemId);
  if (!entry) return;
  entry.item.ownership = ownership;
  entry.item.party_a_share = null;
  state.trackMoves = true;
  await resolveSplit();
}

async function swapItem(itemId, targetAction) {
  const entry = state.valuedItems.find((vi) => vi.item.id === itemId);
  if (!entry) return;
  entry.item.forced_action = targetAction;
  state.trackMoves = true;
  state.scrollTo = itemId;
  await resolveSplit();
}

async function updateDepreciation(itemId, newFactor) {
  const entry = state.valuedItems.find((vi) => vi.item.id === itemId);
  if (!entry) return;
  entry.item.depreciation_override = Number(newFactor);
  const res = await fetch("/api/reapply-depreciation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item: entry.item, valuation: entry.valuation }),
  });
  entry.valuation = await res.json();
  await resolveSplit();
}

// Update the number at once, then re-solve once the clicks stop.
function stepPoints(itemId, party, delta) {
  const entry = state.valuedItems.find((vi) => vi.item.id === itemId);
  if (!entry) return false;
  const key = pointsKey(party);
  const left = POINT_BUDGET - pointsUsed(party);
  const current = Number(entry.item[key] || 0);
  const change = delta > 0 ? Math.min(delta, Math.max(0, left)) : delta;
  const next = Math.max(0, current + change);
  if (next === current) return false;
  entry.item[key] = next;
  state.focusKey = `${itemId}|${party}|${delta}`;
  syncPointControls();
  scheduleSolve();
  return true;
}

let holdTimer = null;
function startHold(step) {
  stopHold();
  step();
  holdTimer = setTimeout(function repeat() {
    // Stop at 0 or at a full budget; a disabled button may never see the pointerup.
    if (step()) holdTimer = setTimeout(repeat, HOLD_REPEAT_MS);
  }, HOLD_DELAY_MS);
}
function stopHold() {
  clearTimeout(holdTimer);
  holdTimer = null;
}
["pointerup", "pointercancel", "blur"].forEach((type) => window.addEventListener(type, stopHold));

function syncPointControls() {
  for (const party of ["party_a", "party_b"]) {
    const key = pointsKey(party);
    const left = POINT_BUDGET - pointsUsed(party);
    document.querySelectorAll(`.pt-val[data-party="${party}"]`).forEach((el) => {
      const vi = state.valuedItems.find((v) => v.item.id === el.dataset.id);
      if (vi) el.textContent = vi.item[key];
    });
    document.querySelectorAll(`.pt-step[data-party="${party}"]`).forEach((btn) => {
      const vi = state.valuedItems.find((v) => v.item.id === btn.dataset.id);
      const pts = vi ? Number(vi.item[key] || 0) : 0;
      btn.disabled = Number(btn.dataset.delta) > 0 ? left <= 0 : pts <= 0;
    });
    const s = state.split;
    if (s) {
      // The solver's "points won" is the share of a party's points that sit on items they get.
      const won = party === "party_a" ? s.party_a_points_won : s.party_b_points_won;
      const total = party === "party_a" ? s.party_a_points_total : s.party_b_points_total;
      const got = total > 0 ? `gets ${Math.round((won / total) * 100)}% of what they asked for and` : "";
      document.getElementById(party === "party_a" ? "wonA" : "wonB").textContent =
        `${partyName(party)} ${got} ${budgetLine(party)}.`.replace(/\s+/g, " ");
    }
  }
}

async function addMessyItem() {
  const input = document.getElementById("messyInput");
  const raw = input.value.trim();
  if (!raw) return;

  const btn = document.getElementById("btnAddMessy");
  btn.disabled = true;
  btn.textContent = "Adding";
  try {
    const parseRes = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text: raw, party_a_name: state.partyA, party_b_name: state.partyB }),
    });
    const parsed = await parseRes.json();
    if (!parsed.items || !parsed.items.length) return;

    const valRes = await fetch("/api/value", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: parsed.items, country: state.country, mode: "live_or_cache" }),
    });
    const valData = await valRes.json();
    setWarning(valData.warning);
    parsed.items.forEach((item, idx) => {
      // A new item can only take what is left of each budget.
      item.party_a_points = Math.max(0, Math.min(item.party_a_points, POINT_BUDGET - pointsUsed("party_a")));
      item.party_b_points = Math.max(0, Math.min(item.party_b_points, POINT_BUDGET - pointsUsed("party_b")));
      state.valuedItems.push({ item, valuation: valData.valuations[idx] });
      remember(item);
    });
    input.value = "";
    await resolveSplit();
  } finally {
    btn.disabled = false;
    btn.textContent = "Add";
  }
}

function setWarning(msg) {
  const el = document.getElementById("warningBanner");
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
}

function renderDataSourceBadge() {
  const sources = new Set(state.valuedItems.map((vi) => vi.valuation.data_source));
  const badge = document.getElementById("dataSourceBadge");
  if (sources.has("idealo_live")) {
    badge.textContent = "idealo data live";
    badge.className = "font-mono text-xs text-pos";
  } else if (sources.has("idealo_cached")) {
    badge.textContent = "idealo data cached";
    badge.className = "font-mono text-xs text-muted";
  } else {
    badge.textContent = "idealo data offline";
    badge.className = "font-mono text-xs text-neg";
  }
}

function receiptRow(label, value) {
  return `
    <div class="flex items-baseline">
      <dt class="font-sans text-ink2">${esc(label)}</dt>
      <span class="leader" aria-hidden="true"></span>
      <dd>${value}</dd>
    </div>`;
}

function renderSettlement(s) {
  const a = s.party_a_name;
  const b = s.party_b_name;
  const cash = Number(s.cash_transfer_a_to_b_eur || 0);
  const payer = cash > 0 ? a : b;
  const payee = cash > 0 ? b : a;
  const even = Math.abs(cash) < 1;

  document.getElementById("settleHeadline").textContent = even
    ? `Even split, no payment`
    : `${payer} pays ${payee} ${eur2(Math.abs(cash))}`;
  document.getElementById("mediatorSummary").textContent = s.mediator_summary;

  const rows = [
    receiptRow("Valued today", eur(s.total_fair_value_eur)),
    receiptRow(`${a} keeps`, eur(s.party_a_received_goods_eur)),
    receiptRow(`${a}'s fair share`, eur(s.party_a_entitled_eur)),
    receiptRow(`${b} keeps`, eur(s.party_b_received_goods_eur)),
    receiptRow(`${b}'s fair share`, eur(s.party_b_entitled_eur)),
  ];
  if (s.sell_pool_eur > 0) rows.push(receiptRow("Sold and split", eur(s.sell_pool_eur)));
  document.getElementById("receipt").innerHTML = rows.join("");

  // The bar shows who keeps how much; the hatched part is what the payment moves.
  const goodsA = Number(s.party_a_received_goods_eur || 0);
  const goodsB = Number(s.party_b_received_goods_eur || 0);
  const total = goodsA + goodsB || 1;
  const shareA = goodsA / total;
  const fairA = Math.min(1, Math.max(0, (goodsA - cash) / total));
  document.getElementById("barA").style.width = `${shareA * 100}%`;
  document.getElementById("barB").style.width = `${(1 - shareA) * 100}%`;
  const gap = document.getElementById("barGap");
  gap.style.left = `${Math.min(shareA, fairA) * 100}%`;
  gap.style.width = `${Math.abs(shareA - fairA) * 100}%`;
  document.getElementById("barMarker").style.left = `${Math.min(0.8, Math.max(0.2, fairA)) * 100}%`;
  document.getElementById("barLabelA").innerHTML = `<span class="text-alex">${esc(a)}</span>`;
  document.getElementById("barLabelB").innerHTML = `<span class="text-sam">${esc(b)}</span>`;
}

function stepper(item, party) {
  const key = pointsKey(party);
  const name = partyName(party);
  const pts = Number(item[key] || 0);
  const left = POINT_BUDGET - pointsUsed(party);
  const id = esc(item.id);
  const label = esc(item.name);
  const btn = (delta, sign, disabled, aria) =>
    `<button class="${STEP_BTN}" data-id="${id}" data-party="${party}" data-delta="${delta}" data-focus-key="${id}|${party}|${delta}"
             aria-label="${aria} ${esc(name)} points for ${label}" ${disabled ? "disabled" : ""}>${sign}</button>`;
  return `
    <div class="flex items-center gap-1" title="How much ${esc(name)} wants to keep it">
      <span class="${PARTY_TEXT[party]} mr-1">${esc(name)}</span>
      ${btn(-POINT_STEP, "−", pts <= 0, "Fewer")}
      <span class="pt-val w-7 text-center font-mono" data-id="${id}" data-party="${party}">${pts}</span>
      ${btn(POINT_STEP, "+", left <= 0, "More")}
    </div>`;
}

function buildItemCard(assigned, vi) {
  const { item, valuation } = vi;
  const isA = assigned.action === "party_a" || assigned.action === "keep_a_buy_new_b";
  const swapTarget = isA ? "party_b" : "party_a";
  const swapLabel = isA ? `Swap to ${esc(state.partyB)}` : `Swap to ${esc(state.partyA)}`;
  const pinned = Boolean(item.forced_action);
  const open = state.openDetails.has(item.id);

  const ownerOptions = [
    ["shared", "Shared 50/50"],
    ["party_a", `Paid by ${esc(state.partyA)}`],
    ["party_b", `Paid by ${esc(state.partyB)}`],
  ]
    .map(([value, label]) => `<option value="${value}" ${item.ownership === value ? "selected" : ""}>${label}</option>`)
    .join("");

  const offersHtml = (valuation.top_offers || [])
    .slice(0, 4)
    .map(
      (o) => `
      <div class="flex items-baseline">
        <span class="font-sans truncate">${esc(o.shop_name)}</span>
        ${o.shop_rating ? `<span class="text-muted ml-2">${o.shop_rating.toFixed(1)}</span>` : ""}
        <span class="leader" aria-hidden="true"></span>
        <span>${eur2(o.total_eur)}</span>
      </div>`
    )
    .join("");

  const hist = valuation.price_history;
  const histChange =
    hist && hist.pct_change_30d != null
      ? ` <span class="${hist.pct_change_30d < 0 ? "text-pos" : "text-neg"}">${hist.pct_change_30d > 0 ? "+" : ""}${hist.pct_change_30d.toFixed(1)}% vs 30 days ago</span>`
      : "";
  const histHtml = hist
    ? `<div class="text-ink2">Last 30 days on idealo: now <span class="font-mono">${eur(hist.current_eur)}</span>, low <span class="font-mono">${eur(hist.min_30d_eur)}</span>, average <span class="font-mono">${eur(hist.avg_30d_eur)}</span>, high <span class="font-mono">${eur(hist.max_30d_eur)}</span>.${histChange}</div>`
    : "";

  const tags = [
    assigned.is_contested
      ? `<span class="inline-flex items-center gap-1 font-mono text-xs text-accent-text" title="You both want this item">${SCALE_ICON}contested</span>`
      : "",
    assigned.action.includes("buy_new") ? `<span class="font-mono text-xs text-ink2">buy new</span>` : "",
    valuation.is_substitute ? `<span class="font-mono text-xs text-muted">no longer sold</span>` : "",
  ].join("");

  const card = document.createElement("div");
  card.dataset.id = item.id;
  card.className = `rounded-xl bg-card border p-5 space-y-3 ${assigned.is_contested ? "border-[color:var(--accent-line)]" : "border-line"}`;
  card.innerHTML = `
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <h3 class="text-[15px] font-medium">${esc(item.name)}</h3>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
        <select class="own-select h-7 rounded-md border border-line bg-card px-2 text-ink2 transition-colors duration-150 ease-out hover:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                data-id="${esc(item.id)}" aria-label="Who paid for ${esc(item.name)}">${ownerOptions}</select>
          ${tags}
        </div>
      </div>
      <div class="text-right shrink-0 font-mono">
        <div class="text-lg font-medium leading-none">${eur(valuation.fair_value_eur)}</div>
        <div class="text-xs text-muted mt-2">new ${eur(valuation.trusted_market_price_eur)}</div>
      </div>
    </div>

    ${assigned.rationale ? `<p class="text-ink2">${esc(assigned.rationale)}</p>` : ""}

    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        ${stepper(item, "party_a")}
        ${stepper(item, "party_b")}
      </div>
      <div class="flex items-center gap-2">
        <button class="btn btn-details" aria-expanded="${open}">Details</button>
        ${
          pinned
            ? `<button class="btn btn-unpin" data-id="${esc(item.id)}">Undo swap</button>`
            : `<button class="btn btn-swap" data-id="${esc(item.id)}" data-target="${swapTarget}">${swapLabel}</button>`
        }
      </div>
    </div>

    <div class="details-drawer ${open ? "" : "hidden"} pt-4 border-t border-line space-y-3">
      <label class="flex items-center gap-3 text-ink2">
        Worth vs new
        <input type="range" min="0.25" max="1.00" step="0.01" value="${valuation.depreciation_factor}"
               class="dep-slider w-32" style="accent-color: var(--accent)" data-id="${esc(item.id)}" />
        <span class="dep-value font-mono w-10">${pct(valuation.depreciation_factor)}</span>
      </label>
      <div class="text-ink2">${esc(valuation.depreciation_explanation)} Drag to correct it if the item is in better or worse shape.</div>
      <div class="text-ink2">
        Matched on idealo: <span class="text-ink">${esc(valuation.matched_title)}</span>${valuation.test_grade ? `, test grade ${esc(valuation.test_grade)}` : ""}
      </div>
      ${valuation.substitute_reason ? `<div class="text-ink2">${esc(valuation.substitute_reason)}</div>` : ""}
      ${histHtml}
      ${
        offersHtml
          ? `<div class="font-mono text-[13px] space-y-1">${offersHtml}</div>
             <div class="font-mono text-xs text-muted">${valuation.offer_count} shops on idealo</div>`
          : ""
      }
      ${
        valuation.best_buy_new_url
          ? `<a href="${esc(valuation.best_buy_new_url)}" target="_blank" rel="noopener" class="inline-block text-accent-text hover:underline">Open on idealo</a>`
          : ""
      }
    </div>
  `;

  card.querySelector(".btn-details").addEventListener("click", (e) => {
    const nowOpen = card.querySelector(".details-drawer").classList.toggle("hidden") === false;
    e.currentTarget.setAttribute("aria-expanded", String(nowOpen));
    if (nowOpen) state.openDetails.add(item.id);
    else state.openDetails.delete(item.id);
  });
  card.querySelector(".btn-swap")?.addEventListener("click", (e) => {
    swapItem(e.currentTarget.dataset.id, e.currentTarget.dataset.target);
  });
  card.querySelector(".own-select").addEventListener("change", (e) => {
    setOwnership(e.currentTarget.dataset.id, e.currentTarget.value);
  });
  card.querySelector(".btn-unpin")?.addEventListener("click", (e) => {
    swapItem(e.currentTarget.dataset.id, null);
  });
  card.querySelectorAll(".pt-step").forEach((btn) => {
    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const { id, party, delta } = e.currentTarget.dataset;
      startHold(() => stepPoints(id, party, Number(delta)));
    });
    // Keyboard presses arrive as clicks with no pointer.
    btn.addEventListener("click", (e) => {
      if (e.detail !== 0) return;
      const { id, party, delta } = e.currentTarget.dataset;
      stepPoints(id, party, Number(delta));
    });
  });
  const slider = card.querySelector(".dep-slider");
  slider.addEventListener("input", (e) => {
    card.querySelector(".dep-value").textContent = pct(e.currentTarget.value);
  });
  slider.addEventListener("change", (e) => {
    updateDepreciation(e.currentTarget.dataset.id, e.currentTarget.value);
  });

  return card;
}

function columnFor(action) {
  if (action === "party_a" || action === "keep_a_buy_new_b") return "A";
  if (action === "party_b" || action === "keep_b_buy_new_a") return "B";
  return "S";
}

function render() {
  if (!state.split) return;
  const s = state.split;
  renderDataSourceBadge();

  document.getElementById("scenarioSubtitle").textContent = state.scenarioName;
  document.getElementById("priorityHelp").textContent =
    `${s.party_a_name} and ${s.party_b_name} each spread ${POINT_BUDGET} points over the items. More points on an item means you want to keep it more.`;
  renderSettlement(s);

  const arbSec = document.getElementById("arbitrageSection");
  if (s.arbitrage_highlights && s.arbitrage_highlights.length) {
    arbSec.classList.remove("hidden");
    document.getElementById("arbitrageCards").innerHTML = s.arbitrage_highlights
      .map(
        (a) => `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="text-ink2">Both want the ${esc(a.item_name)}</div>
            <div class="text-[15px] font-medium mt-1">${esc(a.buy_new_savings_note || a.rationale)}</div>
          </div>
          ${a.buy_new_url ? `<a href="${esc(a.buy_new_url)}" target="_blank" rel="noopener" class="shrink-0 ${PRIMARY_BTN}">Buy new for ${eur(a.buy_new_price_eur)} on idealo</a>` : ""}
        </div>`
      )
      .join("");
  } else {
    arbSec.classList.add("hidden");
  }

  // Cards that changed column after a swap or a points change go on top.
  for (const a of s.assignments) {
    const col = columnFor(a.action);
    const prev = state.columnOf[a.item_id];
    if (state.trackMoves && prev && prev !== col) {
      state.recentMoves = [a.item_id, ...state.recentMoves.filter((id) => id !== a.item_id)];
    }
    state.columnOf[a.item_id] = col;
  }
  state.trackMoves = false;
  // The card the user swapped comes first, ahead of cards the solver moved as a result.
  if (state.scrollTo) {
    state.recentMoves = [state.scrollTo, ...state.recentMoves.filter((id) => id !== state.scrollTo)];
  }
  const rank = (id) => {
    const i = state.recentMoves.indexOf(id);
    return i === -1 ? Infinity : i;
  };
  const ordered = s.assignments
    .map((a, i) => ({ a, i }))
    .sort((x, y) => rank(x.a.item_id) - rank(y.a.item_id) || x.i - y.i)
    .map((x) => x.a);

  const cols = { A: document.getElementById("colA"), B: document.getElementById("colB"), S: document.getElementById("colSell") };
  Object.values(cols).forEach((c) => (c.innerHTML = ""));
  const counts = { A: 0, B: 0, S: 0 };
  const viById = Object.fromEntries(state.valuedItems.map((vi) => [vi.item.id, vi]));

  for (const assigned of ordered) {
    const vi = viById[assigned.item_id];
    if (!vi) continue;
    const col = columnFor(assigned.action);
    cols[col].appendChild(buildItemCard(assigned, vi));
    counts[col]++;
  }

  const items = (n) => `${n} ${n === 1 ? "item" : "items"}`;
  document.getElementById("colHeaderA").textContent = `${s.party_a_name} keeps`;
  document.getElementById("colCountA").textContent = items(counts.A);
  document.getElementById("colHeaderB").textContent = `${s.party_b_name} keeps`;
  document.getElementById("colCountB").textContent = items(counts.B);
  document.getElementById("sellSection").classList.toggle("hidden", counts.S === 0);

  const repList = document.getElementById("replacementList");
  if (s.replacement_basket && s.replacement_basket.length) {
    repList.innerHTML = s.replacement_basket
      .map((r) => {
        const who = r.for_party === "party_a" ? s.party_a_name : s.party_b_name;
        return `
          <div class="flex items-baseline">
            <span class="font-sans text-muted mr-2">${esc(who)}</span>
            <span class="font-sans truncate">${esc(r.item_name)}</span>
            ${r.is_deal ? `<span class="text-xs text-accent-text ml-2 whitespace-nowrap">30-day low</span>` : ""}
            <span class="leader" aria-hidden="true"></span>
            <span>${eur(r.replacement_price_eur)}</span>
            ${r.offer_url ? `<a href="${esc(r.offer_url)}" target="_blank" rel="noopener" class="font-sans text-accent-text ml-3 hover:underline">idealo</a>` : ""}
          </div>`;
      })
      .join("");
  } else {
    repList.innerHTML = `<div class="font-sans text-muted">Nothing to replace. Each party kept the items it wanted most.</div>`;
  }

  document.querySelectorAll(".mode-tab").forEach((btn) => {
    btn.setAttribute("aria-selected", String(btn.dataset.mode === state.mode));
  });

  syncPointControls();

  // Keep keyboard focus on the stepper that was used, and show a swapped card.
  if (state.focusKey) {
    document.querySelector(`[data-focus-key="${CSS.escape(state.focusKey)}"]`)?.focus({ preventScroll: true });
    state.focusKey = null;
  }
  if (state.scrollTo) {
    const sel = CSS.escape(state.scrollTo);
    document
      .querySelector(`#colA [data-id="${sel}"], #colB [data-id="${sel}"], #colSell [data-id="${sel}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    state.scrollTo = null;
  }
}

document.querySelectorAll(".mode-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.mode = btn.dataset.mode;
    resolveSplit();
  });
});
document.getElementById("btnLiveIdealo").addEventListener("click", refreshViaLiveIdealo);
document.getElementById("btnReset").addEventListener("click", resetChanges);
document.getElementById("messyForm").addEventListener("submit", (e) => {
  e.preventDefault();
  addMessyItem();
});

function renderThemeButton() {
  const dark = document.documentElement.classList.contains("dark");
  const btn = document.getElementById("btnTheme");
  btn.textContent = dark ? "Light" : "Dark";
  btn.setAttribute("aria-pressed", String(dark));
}
document.getElementById("btnTheme").addEventListener("click", () => {
  const dark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", dark ? "dark" : "light");
  renderThemeButton();
});
renderThemeButton();

loadDemo();
