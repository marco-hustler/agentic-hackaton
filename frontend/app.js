const state = {
  scenarioName: "",
  partyA: "Alex",
  partyB: "Sam",
  country: "DE",
  mode: "balanced",
  valuedItems: [],
  split: null,
  idealo: null, // { live_enabled, logged_in, used, cap, remaining }
  splitVersion: 0,
  summaryTimer: null,
};

// Single fetch helper: on any failure show the error and return null, leaving state untouched.
async function api(path, body) {
  const opts = body === undefined
    ? {}
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  try {
    const res = await fetch(path, opts);
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      setWarning(`Request to ${path} failed (${res.status}). ${detail}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    setWarning(`Server unreachable (${path}): ${err.message}`);
    return null;
  }
}

const eur = (n) => `€${Number(n || 0).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const eur2 = (n) => `€${Number(n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function loadDemo() {
  const data = await api(`/api/demo?mode=${state.mode}`);
  if (!data) return;
  state.scenarioName = data.scenario_name;
  state.partyA = data.party_a_name;
  state.partyB = data.party_b_name;
  state.country = data.country || "DE";
  state.valuedItems = data.valued_items;
  state.split = data.split;
  setWarning(data.warning);
  render();
  fetchSummaryInBackground();
}

async function loadIdealoStatus() {
  const data = await api("/api/idealo/status");
  if (data) {
    state.idealo = data;
    renderLiveStatus();
  }
}

function updateBudget(budget) {
  if (budget && state.idealo) {
    Object.assign(state.idealo, budget);
    renderLiveStatus();
  }
}

function renderLiveStatus() {
  const el = document.getElementById("liveStatus");
  const btn = document.getElementById("btnLiveIdealo");
  const s = state.idealo;
  if (!s) {
    btn.disabled = false; // status unknown: let the server decide
    return;
  }
  if (!s.live_enabled) {
    el.textContent = "Live idealo: off (cached data only)";
  } else if (!s.logged_in) {
    el.textContent = "Live idealo: on · login missing";
  } else {
    el.textContent = `Live idealo: on · ${s.remaining} calls left today`;
  }
  btn.disabled = !s.live_enabled;
}

// Returns true when a new split was rendered.
async function resolveSplit() {
  const data = await api("/api/solve", {
    party_a_name: state.partyA,
    party_b_name: state.partyB,
    mode: state.mode,
    valued_items: state.valuedItems,
  });
  if (!data) return false;
  state.split = data;
  render();
  fetchSummaryInBackground();
  return true;
}

// Optional LLM polish: debounced so slider bursts make one call; stale or failed responses are ignored.
function fetchSummaryInBackground() {
  const version = ++state.splitVersion;
  clearTimeout(state.summaryTimer);
  state.summaryTimer = setTimeout(() => polishSummary(version), 500);
}

async function polishSummary(version) {
  if (version !== state.splitVersion) return;
  try {
    const res = await fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.split),
    });
    if (!res.ok) return;
    const { summary } = await res.json();
    if (version === state.splitVersion && summary) {
      state.split.mediator_summary = summary;
      document.getElementById("mediatorSummary").textContent = summary;
    }
  } catch (_) {}
}

async function refreshViaLiveIdealo() {
  const btn = document.getElementById("btnLiveIdealo");
  btn.disabled = true;
  btn.textContent = "Querying idealo MCP...";
  try {
    const items = state.valuedItems.map((vi) => vi.item);
    const data = await api("/api/value", { items, country: state.country, mode: "live_or_cache" });
    if (!data) return;
    updateBudget(data.budget);
    state.valuedItems = items.map((item, i) => ({ item, valuation: data.valuations[i] }));
    setWarning(data.warning);
    await resolveSplit();
  } finally {
    btn.textContent = "Refresh via Live idealo MCP";
    renderLiveStatus();
  }
}

async function swapItem(itemId, targetAction) {
  const entry = state.valuedItems.find((vi) => vi.item.id === itemId);
  if (!entry) return;
  const previous = entry.item.forced_action;
  entry.item.forced_action = targetAction;
  if (!(await resolveSplit())) entry.item.forced_action = previous;
}

async function updateDepreciation(itemId, newFactor) {
  const entry = state.valuedItems.find((vi) => vi.item.id === itemId);
  if (!entry) return;
  const item = { ...entry.item, depreciation_override: Number(newFactor) };
  const valuation = await api("/api/reapply-depreciation", { item, valuation: entry.valuation });
  if (!valuation) {
    render(); // snap the slider back to the last good value
    return;
  }
  entry.item = item;
  entry.valuation = valuation;
  await resolveSplit();
}

async function addMessyItem() {
  const input = document.getElementById("messyInput");
  const raw = input.value.trim();
  if (!raw) return;

  const btn = document.getElementById("btnAddMessy");
  btn.disabled = true;
  btn.textContent = "Working...";
  try {
    const parsed = await api("/api/parse", { raw_text: raw, party_a_name: state.partyA, party_b_name: state.partyB });
    if (!parsed || !parsed.items || !parsed.items.length) return;

    const valData = await api("/api/value", { items: parsed.items, country: state.country, mode: "live_or_cache" });
    if (!valData) return;
    updateBudget(valData.budget);
    setWarning(valData.warning);
    parsed.items.forEach((item, idx) => {
      state.valuedItems.push({ item, valuation: valData.valuations[idx] });
    });
    input.value = "";
    await resolveSplit();
  } finally {
    btn.disabled = false;
    btn.textContent = "Parse & Value";
  }
}

function setWarning(msg) {
  const el = document.getElementById("warningBanner");
  if (msg) {
    el.textContent = msg;
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

function renderDataSourceBadge() {
  const sources = new Set(state.valuedItems.map((vi) => vi.valuation.data_source));
  const badge = document.getElementById("dataSourceBadge");
  const placeholders = state.valuedItems.filter((vi) => vi.valuation.data_source === "demo_fallback").length;
  const idealo = state.valuedItems.length - placeholders;
  if (placeholders && idealo) {
    badge.textContent = `Mixed: ${idealo} idealo · ${placeholders} placeholder`;
    badge.className = "px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40";
  } else if (sources.has("idealo_live")) {
    badge.textContent = "Live idealo MCP";
    badge.className = "px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40";
  } else if (sources.has("idealo_cached")) {
    badge.textContent = "Cached idealo MCP";
    badge.className = "px-2.5 py-0.5 text-xs font-semibold rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40";
  } else {
    badge.textContent = "Offline Demo Fallback";
    badge.className = "px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40";
  }
}

function buildItemCard(assigned, vi) {
  const { item, valuation } = vi;
  const isA = assigned.action === "party_a" || assigned.action === "keep_a_buy_new_b";
  const swapTarget = isA ? "party_b" : "party_a";
  const swapLabel = isA ? `Swap → ${state.partyB}` : `Swap → ${state.partyA}`;

  const ownerLabel =
    item.ownership === "party_a"
      ? `Paid by ${state.partyA}`
      : item.ownership === "party_b"
      ? `Paid by ${state.partyB}`
      : "Shared 50/50";

  const offersHtml = (valuation.top_offers || [])
    .slice(0, 4)
    .map(
      (o) => `
      <tr class="border-t border-slate-800">
        <td class="py-1 pr-2 text-slate-200">${o.shop_name}</td>
        <td class="py-1 pr-2 text-slate-400">${o.shop_rating ? o.shop_rating.toFixed(1) + "★" : "—"}</td>
        <td class="py-1 pr-2 text-right font-semibold text-white">${eur2(o.total_eur)}</td>
        <td class="py-1 text-right text-slate-400">${o.delivery_text || "—"}</td>
      </tr>`
    )
    .join("");

  const hist = valuation.price_history;
  const histHtml = hist
    ? `<div class="text-xs text-slate-300 bg-slate-950/70 rounded-lg p-2.5 border border-slate-800">
         <span class="font-semibold text-slate-100">30-day idealo history:</span>
         Now <b>${eur(hist.current_eur)}</b> · Min ${eur(hist.min_30d_eur)} · Avg ${eur(hist.avg_30d_eur)} · Max ${eur(hist.max_30d_eur)}
         ${hist.pct_change_30d != null ? ` (<span class="${hist.pct_change_30d < 0 ? "text-emerald-400" : "text-rose-400"} font-semibold">${hist.pct_change_30d > 0 ? "+" : ""}${hist.pct_change_30d.toFixed(1)}%</span>)` : ""}
       </div>`
    : "";

  const dealBadge = assigned.action.includes("buy_new")
    ? `<span class="px-2 py-0.5 text-[11px] font-bold rounded bg-orange-500/25 text-orange-300 border border-orange-500/50">⚡ Buy-New Arbitrage</span>`
    : valuation.is_substitute
    ? `<span class="px-2 py-0.5 text-[11px] font-semibold rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">Category Substitute</span>`
    : "";

  const card = document.createElement("div");
  card.className = "rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3 hover:border-slate-700 transition";
  card.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="font-bold text-white text-base">${item.name}</h3>
          ${dealBadge}
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
          <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">${ownerLabel}</span>
          <span>${state.partyA}: <b class="text-sky-300">${item.party_a_points} pts</b></span>
          <span>·</span>
          <span>${state.partyB}: <b class="text-emerald-300">${item.party_b_points} pts</b></span>
          <span>·</span>
          <span>${valuation.offer_count} shops (${valuation.scarcity_level})</span>
        </div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-xl font-extrabold text-white">${eur(valuation.fair_value_eur)}</div>
        ${
          valuation.data_source === "demo_fallback"
            ? `<div class="mt-0.5 inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">Placeholder${valuation.source_note ? ` · ${valuation.source_note}` : ""}</div>`
            : ""
        }
        <div class="text-[11px] text-slate-400">New: ${eur(valuation.trusted_market_price_eur)} (${Math.round(valuation.depreciation_factor * 100)}%)</div>
      </div>
    </div>

    <p class="text-xs text-slate-300 leading-relaxed">${assigned.rationale}</p>

    <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
      <div class="flex items-center gap-2 text-xs text-slate-400">
        <label>Condition/Age:</label>
        <input type="range" min="0.25" max="1.00" step="0.05" value="${valuation.depreciation_factor}"
               class="dep-slider w-24 accent-orange-400" data-id="${item.id}" />
        <span class="font-mono text-slate-200">${Math.round(valuation.depreciation_factor * 100)}%</span>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-evidence px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700">
          idealo Evidence ▾
        </button>
        <button class="btn-swap px-2.5 py-1 rounded-md bg-slate-800 hover:bg-indigo-600 text-xs font-semibold text-white border border-slate-700 transition"
                data-id="${item.id}" data-target="${swapTarget}">
          ${swapLabel}
        </button>
      </div>
    </div>

    <div class="evidence-drawer hidden pt-2 border-t border-slate-800 space-y-2 text-xs">
      <div class="text-slate-300">
        <span class="text-slate-400">Matched product:</span> <b class="text-white">${valuation.matched_title}</b>
        ${valuation.test_grade ? `<span class="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Test: ${valuation.test_grade}</span>` : ""}
      </div>
      ${valuation.substitute_reason ? `<div class="text-purple-300">${valuation.substitute_reason}</div>` : ""}
      <div class="text-slate-400">${valuation.depreciation_explanation}</div>
      ${histHtml}
      ${
        offersHtml
          ? `<table class="w-full text-left border-collapse">
               <thead><tr class="text-slate-500"><th class="py-1">Merchant</th><th>Rating</th><th class="text-right">Total</th><th class="text-right">Delivery</th></tr></thead>
               <tbody>${offersHtml}</tbody>
             </table>`
          : ""
      }
      ${
        valuation.best_buy_new_url
          ? `<a href="${valuation.best_buy_new_url}" target="_blank" rel="noopener" class="inline-block text-orange-400 hover:text-orange-300 underline font-medium">View on idealo →</a>`
          : ""
      }
    </div>
  `;

  card.querySelector(".btn-evidence").addEventListener("click", () => {
    card.querySelector(".evidence-drawer").classList.toggle("hidden");
  });
  card.querySelector(".btn-swap").addEventListener("click", (e) => {
    swapItem(e.currentTarget.dataset.id, e.currentTarget.dataset.target);
  });
  card.querySelector(".dep-slider").addEventListener("change", (e) => {
    updateDepreciation(e.currentTarget.dataset.id, e.currentTarget.value);
  });

  return card;
}

function render() {
  if (!state.split) return;
  const s = state.split;
  renderDataSourceBadge();

  document.getElementById("scenarioSubtitle").textContent = `${state.scenarioName} · ${state.valuedItems.length} items · Total Fair Value ${eur(s.total_fair_value_eur)}`;
  document.getElementById("labelGoodsA").textContent = `${s.party_a_name} Keeps`;
  document.getElementById("valGoodsA").textContent = eur(s.party_a_received_goods_eur);
  document.getElementById("subGoodsA").textContent = `Entitled: ${eur(s.party_a_entitled_eur)} · Care pts: ${s.party_a_points_won}/${s.party_a_points_total}`;

  document.getElementById("labelGoodsB").textContent = `${s.party_b_name} Keeps`;
  document.getElementById("valGoodsB").textContent = eur(s.party_b_received_goods_eur);
  document.getElementById("subGoodsB").textContent = `Entitled: ${eur(s.party_b_entitled_eur)} · Care pts: ${s.party_b_points_won}/${s.party_b_points_total}`;

  document.getElementById("cashTransferSummary").textContent = s.cash_transfer_summary;
  document.getElementById("mediatorSummary").textContent = s.mediator_summary;
  document.getElementById("fairnessPill").textContent = `${s.is_envy_free ? "Envy-Free" : "Balanced"} · ${s.fairness_score_pct}% match`;

  // Arbitrage Banner
  const arbSec = document.getElementById("arbitrageSection");
  const arbCards = document.getElementById("arbitrageCards");
  if (s.arbitrage_highlights && s.arbitrage_highlights.length) {
    arbSec.classList.remove("hidden");
    arbCards.innerHTML = s.arbitrage_highlights
      .map(
        (a) => `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/60 rounded-xl p-4 border border-orange-500/30">
          <div>
            <div class="font-bold text-white text-base">${a.item_name} — Both wanted it (${a.party_a_points} vs ${a.party_b_points} pts)</div>
            <div class="text-sm text-orange-200 mt-1">${a.buy_new_savings_note || a.rationale}</div>
          </div>
          ${
            a.buy_new_url
              ? `<a href="${a.buy_new_url}" target="_blank" rel="noopener" class="shrink-0 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold text-sm text-center">
                   Buy New at ${eur(a.buy_new_price_eur)} →
                 </a>`
              : ""
          }
        </div>`
      )
      .join("");
  } else {
    arbSec.classList.add("hidden");
  }

  // Columns
  const colA = document.getElementById("colA");
  const colB = document.getElementById("colB");
  const colSell = document.getElementById("colSell");
  colA.innerHTML = "";
  colB.innerHTML = "";
  colSell.innerHTML = "";

  const viById = Object.fromEntries(state.valuedItems.map((vi) => [vi.item.id, vi]));
  let countA = 0, countB = 0, countSell = 0;

  for (const assigned of s.assignments) {
    const vi = viById[assigned.item_id];
    if (!vi) continue;
    const card = buildItemCard(assigned, vi);
    if (assigned.action === "party_a" || assigned.action === "keep_a_buy_new_b") {
      colA.appendChild(card);
      countA++;
    } else if (assigned.action === "party_b" || assigned.action === "keep_b_buy_new_a") {
      colB.appendChild(card);
      countB++;
    } else {
      colSell.appendChild(card);
      countSell++;
    }
  }

  document.getElementById("colHeaderA").textContent = `${s.party_a_name} Keeps`;
  document.getElementById("colCountA").textContent = `${countA} items`;
  document.getElementById("colHeaderB").textContent = `${s.party_b_name} Keeps`;
  document.getElementById("colCountB").textContent = `${countB} items`;
  document.getElementById("sellSection").classList.toggle("hidden", countSell === 0);

  // Replacement Basket
  const repList = document.getElementById("replacementList");
  if (s.replacement_basket && s.replacement_basket.length) {
    repList.innerHTML = s.replacement_basket
      .map((r) => {
        const who = r.for_party === "party_a" ? s.party_a_name : s.party_b_name;
        return `
          <div class="flex items-center justify-between gap-2 bg-slate-950/70 rounded-lg px-3 py-2 border border-slate-800">
            <div>
              <span class="text-xs font-semibold text-indigo-300">${who}</span>
              <span class="text-slate-200 ml-1">${r.item_name}</span>
              ${r.is_deal ? `<span class="ml-1.5 text-[11px] text-orange-300 font-semibold">🔥 30d deal</span>` : ""}
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <span class="font-bold text-white">${eur(r.replacement_price_eur)}</span>
              ${
                r.offer_url
                  ? `<a href="${r.offer_url}" target="_blank" rel="noopener" class="text-xs text-orange-400 hover:underline">idealo →</a>`
                  : ""
              }
            </div>
          </div>`;
      })
      .join("");
  } else {
    repList.innerHTML = `<div class="text-xs text-slate-500">Everyone kept the items they prioritized!</div>`;
  }

  // Update active mode tab styling
  document.querySelectorAll(".mode-tab").forEach((btn) => {
    const active = btn.dataset.mode === state.mode;
    btn.className = active
      ? "mode-tab px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-500 text-white"
      : "mode-tab px-4 py-2 rounded-lg text-sm font-semibold text-slate-400 hover:text-white";
  });
}

// Event wiring
document.querySelectorAll(".mode-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.mode = btn.dataset.mode;
    resolveSplit();
  });
});
document.getElementById("btnLiveIdealo").addEventListener("click", refreshViaLiveIdealo);
document.getElementById("btnResetSwaps").addEventListener("click", () => {
  state.valuedItems.forEach((vi) => {
    vi.item.forced_action = null;
  });
  resolveSplit();
});
document.getElementById("btnAddMessy").addEventListener("click", addMessyItem);
document.getElementById("messyInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addMessyItem();
});

loadIdealoStatus();
loadDemo();
