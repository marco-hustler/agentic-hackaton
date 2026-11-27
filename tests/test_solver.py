"""Unit tests for the deterministic fairness solver (exact math, equity, buy-new arbitrage)."""

from cleanbreak.models import HouseholdItemInput, SplitRequest, ValuedItem
from cleanbreak.solver.optimizer import solve_split
from cleanbreak.valuation.engine import build_demo_fallback_valuations


def _sample_items() -> list[HouseholdItemInput]:
    return [
        HouseholdItemInput(
            id="espresso",
            name="Sage Barista Express",
            purchase_year=2023,
            condition="good",
            ownership="shared",
            party_a_points=35,
            party_b_points=35,
        ),
        HouseholdItemInput(
            id="vacuum",
            name="Dyson V15",
            purchase_year=2024,
            condition="like_new",
            ownership="party_a",
            party_a_points=25,
            party_b_points=10,
        ),
        HouseholdItemInput(
            id="tv",
            name="LG OLED TV",
            purchase_year=2023,
            condition="good",
            ownership="shared",
            party_a_points=20,
            party_b_points=30,
        ),
        HouseholdItemInput(
            id="mixer",
            name="KitchenAid Artisan",
            purchase_year=2022,
            condition="good",
            ownership="party_b",
            party_a_points=5,
            party_b_points=25,
        ),
    ]


def test_exact_financial_equity_accounting() -> None:
    items = _sample_items()
    vals = build_demo_fallback_valuations(items)
    valued = [ValuedItem(item=i, valuation=v) for i, v in zip(items, vals)]

    res = solve_split(SplitRequest(party_a_name="Alex", party_b_name="Sam", mode="balanced", valued_items=valued))

    # After cash equalization, each party's net value (goods - cash paid) MUST equal their exact equity.
    net_a = round(res.party_a_received_goods_eur - res.cash_transfer_a_to_b_eur, 2)
    net_b = round(res.party_b_received_goods_eur + res.cash_transfer_a_to_b_eur, 2)
    assert abs(net_a - res.party_a_entitled_eur) < 0.05
    assert abs(net_b - res.party_b_entitled_eur) < 0.05


def test_contention_arbitrage_triggers_on_black_friday_deal() -> None:
    items = _sample_items()
    vals = build_demo_fallback_valuations(items)
    valued = [ValuedItem(item=i, valuation=v) for i, v in zip(items, vals)]

    res = solve_split(SplitRequest(mode="balanced", valued_items=valued))
    espresso_assignment = next(a for a in res.assignments if a.item_id == "espresso")

    # Both put 35 pts on espresso AND idealo history shows -18.7% 30-day low => triggers buy-new arbitrage!
    assert espresso_assignment.action in ("keep_a_buy_new_b", "keep_b_buy_new_a")
    assert len(res.arbitrage_highlights) >= 1
    assert espresso_assignment.buy_new_price_eur == 479.0


def test_forced_swap_updates_transfer_deterministically() -> None:
    items = _sample_items()
    vals = build_demo_fallback_valuations(items)

    items_a = [i.model_copy() for i in items]
    items_a[2].forced_action = "party_a"  # Force TV to Party A
    res_a = solve_split(
        SplitRequest(mode="balanced", valued_items=[ValuedItem(item=i, valuation=v) for i, v in zip(items_a, vals)])
    )

    items_b = [i.model_copy() for i in items]
    items_b[2].forced_action = "party_b"  # Force TV to Party B
    res_b = solve_split(
        SplitRequest(mode="balanced", valued_items=[ValuedItem(item=i, valuation=v) for i, v in zip(items_b, vals)])
    )

    assert res_a.cash_transfer_a_to_b_eur > res_b.cash_transfer_a_to_b_eur


def test_contested_rule_is_relative_to_each_partys_average() -> None:
    from cleanbreak.solver.optimizer import is_item_contested

    item = HouseholdItemInput(id="x", name="X", party_a_points=12, party_b_points=10)
    vi = ValuedItem(item=item, valuation=build_demo_fallback_valuations([item])[0])
    # With 20 items the average is 5 points, so 12 against 10 is wanted by both.
    assert is_item_contested(vi, (5.0, 5.0))
    # With 7 items the average is about 14, so the same points are not enough.
    assert not is_item_contested(vi, (14.3, 14.3))

    item.party_a_points, item.party_b_points = 31, 15
    assert not is_item_contested(vi, (5.0, 5.0))  # 15 is less than half of 31
    item.party_a_points, item.party_b_points = 30, 15
    assert is_item_contested(vi, (5.0, 5.0))
    item.party_a_points, item.party_b_points = 0, 0
    assert not is_item_contested(vi, (0.0, 0.0))


def test_least_cash_counts_the_buyers_top_up() -> None:
    items = _sample_items()
    vals = build_demo_fallback_valuations(items)
    valued = [ValuedItem(item=i, valuation=v) for i, v in zip(items, vals)]

    # Buying new costs the buyer money, so the mode that minimises money avoids it.
    res = solve_split(SplitRequest(mode="min_cash", valued_items=valued))
    espresso = next(a for a in res.assignments if a.item_id == "espresso")
    assert espresso.action in ("party_a", "party_b")


def test_agent_picks_an_envy_free_split_when_one_exists():
    from fastapi.testclient import TestClient

    from cleanbreak.api.app import app

    c = TestClient(app)
    items = c.get("/api/demo").json()["valued_items"]
    r = c.post("/api/solve/agent", json={"party_a_name": "You", "party_b_name": "Marco", "valued_items": items}).json()
    assert r["agent_note"] and r["mode"] in {"balanced", "min_cash", "liquidate_contested"}
    others = [
        c.post("/api/solve", json={"party_a_name": "You", "party_b_name": "Marco", "mode": m, "valued_items": items}).json()
        for m in ("balanced", "min_cash", "liquidate_contested")
    ]
    if any(o["is_envy_free"] for o in others):
        assert r["is_envy_free"]
    assert r["fairness_score_pct"] >= max(o["fairness_score_pct"] for o in others if o["is_envy_free"] == r["is_envy_free"])


def test_you_grammar_and_manual_lock_copy() -> None:
    items = _sample_items()
    items[1].forced_action = "party_a"
    vals = build_demo_fallback_valuations(items)
    valued = [ValuedItem(item=i, valuation=v) for i, v in zip(items, vals)]

    res = solve_split(SplitRequest(party_a_name="You", party_b_name="Sam", mode="balanced", valued_items=valued))
    assert "You pays" not in res.cash_transfer_summary
    assert "You puts" not in " ".join(a.buy_new_savings_note or "" for a in res.assignments)
    locked = next(a for a in res.assignments if a.item_id == "vacuum")
    assert "Locked manually" in locked.rationale
    assert "Swap" not in locked.rationale
    assert "€" in res.mediator_summary
