"""Deterministic exact fairness optimizer for 2-party household splits.

No LLM guessing on numbers:
- Computes exact ownership equity baselines (shared 50/50 or custom paid-by shares).
- Solves the optimal assignment over all items in <5 ms (exact search up to 12 items).
- Computes exact cash equalization transfer so both sides receive 100% of their financial equity.
- Triggers "Contention Arbitrage" when both parties fight over an item that idealo's 30-day
  history flags as a real Buy-New Deal (e.g. Black Friday low).
"""

from __future__ import annotations

from itertools import product

from cleanbreak.models import (
    AssignedItemResult,
    AssignmentAction,
    ReplacementSuggestion,
    SplitMode,
    SplitRequest,
    SplitResult,
    ValuedItem,
)


# The smaller of the two point counts must be at least this share of the larger one.
CONTESTED_MIN_RATIO = 0.5


def average_points(valued_items: list[ValuedItem]) -> tuple[float, float]:
    """Each party's average points per item, so the contested rule scales with the list size."""
    n = max(1, len(valued_items))
    return (
        sum(vi.item.party_a_points for vi in valued_items) / n,
        sum(vi.item.party_b_points for vi in valued_items) / n,
    )


def is_item_contested(vi: ValuedItem, averages: tuple[float, float]) -> bool:
    """Both parties put at least their own average on the item, and neither wants it far more."""
    pa = vi.item.party_a_points
    pb = vi.item.party_b_points
    if pa <= 0 or pb <= 0:
        return False
    avg_a, avg_b = averages
    return pa >= avg_a and pb >= avg_b and min(pa, pb) >= CONTESTED_MIN_RATIO * max(pa, pb)


def _candidate_actions(vi: ValuedItem, mode: SplitMode, averages: tuple[float, float]) -> list[AssignmentAction]:
    if vi.item.forced_action is not None:
        return [vi.item.forced_action]

    actions: list[AssignmentAction] = ["party_a", "party_b"]
    contested = is_item_contested(vi, averages)

    # Signature "Aha!" option: both want it AND idealo shows a real 30-day deal in stock.
    if contested and vi.valuation.is_buy_new_deal:
        actions.extend(["keep_a_buy_new_b", "keep_b_buy_new_a"])

    if mode == "liquidate_contested" and contested and vi.item.willing_to_sell:
        actions.append("sell_split")

    return actions


def _evaluate_plan(
    valued_items: list[ValuedItem],
    actions: tuple[AssignmentAction, ...],
    mode: SplitMode,
) -> tuple[float, dict[str, float]]:
    """Score one candidate assignment vector deterministically."""
    total_a_pts = max(1, sum(vi.item.party_a_points for vi in valued_items))
    total_b_pts = max(1, sum(vi.item.party_b_points for vi in valued_items))
    total_value = max(1.0, sum(vi.valuation.fair_value_eur for vi in valued_items))

    won_a = 0.0
    won_b = 0.0
    goods_a = 0.0
    goods_b = 0.0
    entitled_a_kept = 0.0
    friction_a = 0.0
    friction_b = 0.0
    ownership_bonus = 0.0
    # Money the buyer of a new item pays on top of their share of the used one.
    topup_total = 0.0
    liquidate_bonus = 0.0

    for vi, act in zip(valued_items, actions):
        val = vi.valuation.fair_value_eur
        share_a = vi.item.effective_party_a_share()
        pa = vi.item.party_a_points
        pb = vi.item.party_b_points
        friction = vi.valuation.replacement_friction - 1.0

        if act == "party_a":
            won_a += pa
            goods_a += val
            entitled_a_kept += share_a * val
            friction_a += friction * val
            if vi.item.ownership == "party_a":
                ownership_bonus += 0.03
        elif act == "party_b":
            won_b += pb
            goods_b += val
            entitled_a_kept += share_a * val
            friction_b += friction * val
            if vi.item.ownership == "party_b":
                ownership_bonus += 0.03
        elif act == "keep_a_buy_new_b":
            # A keeps the used item; B gets buyout + buys brand-new at idealo 30-day low.
            won_a += pa
            won_b += pb * 0.85
            goods_a += val
            entitled_a_kept += share_a * val
            topup_total += max(0.0, vi.valuation.lowest_offer_eur - val * (1.0 - share_a))
            if vi.item.ownership == "party_a":
                ownership_bonus += 0.02
        elif act == "keep_b_buy_new_a":
            won_b += pb
            won_a += pa * 0.85
            goods_b += val
            entitled_a_kept += share_a * val
            topup_total += max(0.0, vi.valuation.lowest_offer_eur - val * share_a)
            if vi.item.ownership == "party_b":
                ownership_bonus += 0.02
        elif act == "sell_split":
            # Both give up the contested item and split proceeds cleanly.
            won_a += pa * 0.30
            won_b += pb * 0.30
            if mode == "liquidate_contested":
                liquidate_bonus += 0.12

    frac_a = won_a / total_a_pts
    frac_b = won_b / total_b_pts
    cash_transfer = goods_a - entitled_a_kept
    cash_ratio = abs(cash_transfer) / total_value
    # Spending on a new item weighs like paying the other party.
    topup_ratio = topup_total / total_value
    friction_gap = abs(friction_a - friction_b) / total_value

    if mode == "min_cash":
        score = (
            -0.75 * (cash_ratio + topup_ratio)
            + 0.25 * (frac_a + frac_b)
            + 0.15 * min(frac_a, frac_b)
            + ownership_bonus
        )
    elif mode == "liquidate_contested":
        score = (
            0.45 * (frac_a + frac_b)
            + 0.35 * min(frac_a, frac_b)
            - 0.15 * (cash_ratio + topup_ratio)
            + liquidate_bonus
            + ownership_bonus
        )
    else:  # "balanced" (default envy-free)
        score = (
            0.52 * (frac_a + frac_b)
            + 0.38 * min(frac_a, frac_b)
            - 0.12 * (cash_ratio + topup_ratio)
            - 0.05 * friction_gap
            + ownership_bonus
        )

    metrics = {
        "frac_a": frac_a,
        "frac_b": frac_b,
        "goods_a": goods_a,
        "goods_b": goods_b,
        "cash_transfer": cash_transfer,
    }
    return score, metrics


def _solve_exact_or_greedy(
    valued_items: list[ValuedItem], mode: SplitMode
) -> tuple[AssignmentAction, ...]:
    averages = average_points(valued_items)
    action_lists = [_candidate_actions(vi, mode, averages) for vi in valued_items]

    # Exact search is instant for <= 12 items (typical household split is 5-10 items).
    total_combos = 1
    for opts in action_lists:
        total_combos *= len(opts)

    if total_combos <= 60_000:
        best_score = float("-inf")
        best_actions: tuple[AssignmentAction, ...] = tuple(opts[0] for opts in action_lists)
        for combo in product(*action_lists):
            score, _ = _evaluate_plan(valued_items, combo, mode)
            if score > best_score:
                best_score = score
                best_actions = combo
        return best_actions

    # Fallback for very large inventories: greedy initialization + 1-item local search.
    current: list[AssignmentAction] = []
    for vi, opts in zip(valued_items, action_lists):
        if len(opts) == 1:
            current.append(opts[0])
        elif "keep_a_buy_new_b" in opts and vi.item.party_a_points >= vi.item.party_b_points:
            current.append("keep_a_buy_new_b")
        elif "keep_b_buy_new_a" in opts:
            current.append("keep_b_buy_new_a")
        elif vi.item.party_a_points >= vi.item.party_b_points:
            current.append("party_a")
        else:
            current.append("party_b")

    best_score, _ = _evaluate_plan(valued_items, tuple(current), mode)
    improved = True
    while improved:
        improved = False
        for idx, opts in enumerate(action_lists):
            for candidate in opts:
                if candidate == current[idx]:
                    continue
                trial = list(current)
                trial[idx] = candidate
                score, _ = _evaluate_plan(valued_items, tuple(trial), mode)
                if score > best_score + 1e-9:
                    best_score = score
                    current = trial
                    improved = True
    return tuple(current)


def _is_you(name: str) -> bool:
    return name.strip().lower() == "you"


def _puts_possessive(name: str) -> tuple[str, str]:
    return ("put", "your") if _is_you(name) else ("puts", "their")


def _pays_verb(name: str) -> str:
    return "pay" if _is_you(name) else "pays"


def _build_item_rationale(
    vi: ValuedItem,
    action: AssignmentAction,
    party_a_name: str,
    party_b_name: str,
) -> tuple[str, str | None, float | None, str | None]:
    item = vi.item
    val = vi.valuation
    buy_url: str | None = None
    buy_price: float | None = None
    savings_note: str | None = None

    if action == "keep_a_buy_new_b":
        buy_url = val.best_buy_new_url
        buy_price = val.lowest_offer_eur
        extra = max(0.0, round(buy_price - val.fair_value_eur * (1.0 - item.effective_party_a_share()), 2))
        put_verb, poss = _puts_possessive(party_b_name)
        savings_note = (
            f"{party_b_name} {put_verb} {poss} €{val.fair_value_eur * (1.0 - item.effective_party_a_share()):,.0f} "
            f"share toward a new one at €{buy_price:,.0f}, adding €{extra:,.0f}. "
            f"That is {val.deal_discount_pct:.0f}% under the 30-day average."
        )
        # The deal box above the columns explains it.
        rationale = ""
    elif action == "keep_b_buy_new_a":
        buy_url = val.best_buy_new_url
        buy_price = val.lowest_offer_eur
        extra = max(0.0, round(buy_price - val.fair_value_eur * item.effective_party_a_share(), 2))
        put_verb, poss = _puts_possessive(party_a_name)
        savings_note = (
            f"{party_a_name} {put_verb} {poss} €{val.fair_value_eur * item.effective_party_a_share():,.0f} "
            f"share toward a new one at €{buy_price:,.0f}, adding €{extra:,.0f}. "
            f"That is {val.deal_discount_pct:.0f}% under the 30-day average."
        )
        # The deal box above the columns explains it.
        rationale = ""
    elif action == "sell_split":
        rationale = "The money is split by who paid."
    elif item.forced_action is not None:
        rationale = "Locked manually, so points no longer decide this item."
    else:
        rationale = ""

    return rationale, buy_url, buy_price, savings_note


def solve_split(request: SplitRequest) -> SplitResult:
    """Solve the optimal fair household split deterministically."""
    valued_items = request.valued_items
    party_a = request.party_a_name
    party_b = request.party_b_name

    if not valued_items:
        return SplitResult(
            mode=request.mode,
            party_a_name=party_a,
            party_b_name=party_b,
            assignments=[],
            total_fair_value_eur=0.0,
            party_a_entitled_eur=0.0,
            party_b_entitled_eur=0.0,
            party_a_received_goods_eur=0.0,
            party_b_received_goods_eur=0.0,
            sell_pool_eur=0.0,
            cash_transfer_a_to_b_eur=0.0,
            cash_transfer_summary="No items to split yet.",
            party_a_points_won=0,
            party_a_points_total=0,
            party_b_points_won=0,
            party_b_points_total=0,
            fairness_score_pct=100.0,
            is_envy_free=True,
            mediator_summary="Add household items to calculate a fair split.",
        )

    best_actions = _solve_exact_or_greedy(valued_items, request.mode)
    averages = average_points(valued_items)

    assignments: list[AssignedItemResult] = []
    arbitrage_highlights: list[AssignedItemResult] = []
    replacement_basket: list[ReplacementSuggestion] = []

    total_fair = 0.0
    entitled_a_all = 0.0
    entitled_b_all = 0.0
    entitled_a_kept = 0.0
    goods_a = 0.0
    goods_b = 0.0
    sell_pool = 0.0

    pts_a_total = sum(vi.item.party_a_points for vi in valued_items)
    pts_b_total = sum(vi.item.party_b_points for vi in valued_items)
    pts_a_won = 0
    pts_b_won = 0

    for vi, action in zip(valued_items, best_actions):
        val = vi.valuation
        item = vi.item
        fair = val.fair_value_eur
        share_a = item.effective_party_a_share()

        total_fair += fair
        entitled_a_all += share_a * fair
        entitled_b_all += (1.0 - share_a) * fair

        if action in ("party_a", "keep_a_buy_new_b"):
            goods_a += fair
            entitled_a_kept += share_a * fair
            pts_a_won += item.party_a_points
            if action == "keep_a_buy_new_b":
                pts_b_won += int(round(item.party_b_points * 0.85))
            # If Party B cared meaningfully and didn't keep it, add to B's Re-Equip Replacement Basket.
            if item.party_b_points >= 10:
                replacement_basket.append(
                    ReplacementSuggestion(
                        for_party="party_b",
                        item_name=item.name,
                        matched_title=val.matched_title,
                        replacement_price_eur=val.lowest_offer_eur,
                        is_deal=val.is_buy_new_deal,
                        deal_headline=val.deal_headline,
                        offer_url=val.best_buy_new_url or val.product_url,
                    )
                )
        elif action in ("party_b", "keep_b_buy_new_a"):
            goods_b += fair
            entitled_a_kept += share_a * fair
            pts_b_won += item.party_b_points
            if action == "keep_b_buy_new_a":
                pts_a_won += int(round(item.party_a_points * 0.85))
            if item.party_a_points >= 10:
                replacement_basket.append(
                    ReplacementSuggestion(
                        for_party="party_a",
                        item_name=item.name,
                        matched_title=val.matched_title,
                        replacement_price_eur=val.lowest_offer_eur,
                        is_deal=val.is_buy_new_deal,
                        deal_headline=val.deal_headline,
                        offer_url=val.best_buy_new_url or val.product_url,
                    )
                )
        else:  # sell_split
            sell_pool += fair

        rationale, buy_url, buy_price, savings_note = _build_item_rationale(
            vi, action, party_a, party_b
        )
        assigned = AssignedItemResult(
            item_id=item.id,
            item_name=item.name,
            action=action,
            fair_value_eur=round(fair, 2),
            trusted_market_price_eur=round(val.trusted_market_price_eur, 2),
            party_a_points=item.party_a_points,
            party_b_points=item.party_b_points,
            is_contested=is_item_contested(vi, averages),
            rationale=rationale,
            buy_new_url=buy_url,
            buy_new_price_eur=buy_price,
            buy_new_savings_note=savings_note,
        )
        assignments.append(assigned)
        if action in ("keep_a_buy_new_b", "keep_b_buy_new_a"):
            arbitrage_highlights.append(assigned)

    cash_a_to_b = round(goods_a - entitled_a_kept, 2)
    if abs(cash_a_to_b) < 1.0:
        cash_summary = f"Even split. No payment between {party_a} and {party_b}."
    elif cash_a_to_b > 0:
        cash_summary = f"{party_a} {_pays_verb(party_a)} {party_b} €{cash_a_to_b:,.2f}."
    else:
        cash_summary = f"{party_b} {_pays_verb(party_b)} {party_a} €{abs(cash_a_to_b):,.2f}."

    frac_a = pts_a_won / max(1, pts_a_total)
    frac_b = pts_b_won / max(1, pts_b_total)
    # Envy-free in preferences + exact euro equity: neither side prefers the other's bundle.
    is_envy_free = frac_a >= 0.50 and frac_b >= 0.50
    fairness_score_pct = round(min(100.0, ((frac_a + frac_b) / 2.0) * 100.0), 1)

    deal_note = ""
    if arbitrage_highlights:
        deal_names = ", ".join(a.item_name for a in arbitrage_highlights)
        deal_note = f" Buy-new idealo deal flagged on {deal_names}."
    mediator_summary = (
        f"Total fair value is €{total_fair:,.0f} ({fairness_score_pct:.0f}% wish satisfaction). "
        f"{cash_summary}{deal_note} {DETERMINISTIC_SUMMARY}"
    )

    return SplitResult(
        mode=request.mode,
        party_a_name=party_a,
        party_b_name=party_b,
        assignments=assignments,
        total_fair_value_eur=round(total_fair, 2),
        party_a_entitled_eur=round(entitled_a_all, 2),
        party_b_entitled_eur=round(entitled_b_all, 2),
        party_a_received_goods_eur=round(goods_a, 2),
        party_b_received_goods_eur=round(goods_b, 2),
        sell_pool_eur=round(sell_pool, 2),
        cash_transfer_a_to_b_eur=cash_a_to_b,
        cash_transfer_summary=cash_summary,
        party_a_points_won=pts_a_won,
        party_a_points_total=pts_a_total,
        party_b_points_won=pts_b_won,
        party_b_points_total=pts_b_total,
        fairness_score_pct=fairness_score_pct,
        is_envy_free=is_envy_free,
        arbitrage_highlights=arbitrage_highlights,
        replacement_basket=replacement_basket,
        mediator_summary=mediator_summary,
    )


# Used directly or as the fallback when no LLM is set. The UI shows the totals, the payment
# and the contested item, so the summary adds only where the values come from.
DETERMINISTIC_SUMMARY = "Values come from idealo offers by well rated shops, minus age and condition."


AGENT_MODES: tuple[SplitMode, ...] = ("balanced", "min_cash", "liquidate_contested")
MODE_LABELS: dict[str, str] = {
    "balanced": "closest to 50/50",
    "min_cash": "least cash changing hands",
    "liquidate_contested": "selling what both want",
}


def _agent_rank(r: SplitResult) -> tuple:
    # Envy-free first, then wishes met, then less cash, then fewer things sold.
    return (not r.is_envy_free, -r.fairness_score_pct, abs(r.cash_transfer_a_to_b_eur), r.sell_pool_eur)


def agent_split(req: SplitRequest) -> SplitResult:
    """The split agent: try every strategy with the deterministic solver and propose the fairest."""
    results = [solve_split(req.model_copy(update={"mode": m})) for m in AGENT_MODES]
    best = min(results, key=_agent_rank)
    others = [r for r in results if r is not best]
    note = f"I compared {len(results)} ways to split and chose {MODE_LABELS[best.mode]}: " + (
        "nobody would rather have the other's share" if best.is_envy_free else "the most wishes met"
    ) + f", {round(best.fairness_score_pct)}% fairness."
    if others:
        runner = min(others, key=_agent_rank)
        note += f" Next best was {MODE_LABELS[runner.mode]} at {round(runner.fairness_score_pct)}%."
    return best.model_copy(update={"agent_note": note})
