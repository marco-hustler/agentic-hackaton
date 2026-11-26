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
