"""Unit tests for idealo valuation signals (trusted median, depreciation, 30-day deal detection)."""

from cleanbreak.models import HouseholdItemInput, IdealoOffer, PriceHistoryStats
from cleanbreak.valuation.engine import (
    assess_buy_new_deal,
    build_valuation,
    compute_depreciation,
    compute_trusted_market_price,
)


def test_trusted_price_ignores_low_rated_outlier() -> None:
    offers = [
        IdealoOffer(shop_name="SketchyShop", price_eur=199.0, shipping_eur=0.0, total_eur=199.0, shop_rating=2.1),
        IdealoOffer(shop_name="TrustedA", price_eur=480.0, shipping_eur=0.0, total_eur=480.0, shop_rating=4.7),
        IdealoOffer(shop_name="TrustedB", price_eur=490.0, shipping_eur=10.0, total_eur=500.0, shop_rating=4.5),
        IdealoOffer(shop_name="TrustedC", price_eur=510.0, shipping_eur=0.0, total_eur=510.0, shop_rating=4.8),
    ]
    trusted_price, lowest, trusted_count = compute_trusted_market_price(offers)
    assert lowest == 199.0
    assert trusted_count == 3
    assert trusted_price == 500.0  # Median of [480, 500, 510], ignoring SketchyShop!


def test_depreciation_curve_and_override() -> None:
    mult, expl = compute_depreciation(purchase_year=2023, condition="good", current_year=2026)
    assert 0.50 <= mult <= 0.65
    assert "3 yr old" in expl

    override_mult, _ = compute_depreciation(purchase_year=2023, condition="good", override=0.8)
    assert override_mult == 0.8


def test_black_friday_30d_deal_detection() -> None:
    history = PriceHistoryStats(
        current_eur=479.0,
        min_30d_eur=479.0,
        max_30d_eur=629.0,
        avg_30d_eur=589.0,
        pct_change_30d=-18.7,
    )
    is_deal, pct, headline = assess_buy_new_deal(490.0, 479.0, history, offer_count=6)
    assert is_deal is True
    assert pct > 15.0
    assert headline and "30-day low" in headline


def test_build_valuation_applies_scarcity_and_fair_value() -> None:
    item = HouseholdItemInput(id="x", name="Rare Amp", purchase_year=2024, condition="like_new")
    val = build_valuation(
        item,
        matched_title="Rare Amp Pro",
        offers=[IdealoOffer(shop_name="Shop1", price_eur=1000.0, shipping_eur=0.0, total_eur=1000.0, shop_rating=4.8)],
        current_year=2026,
    )
    assert val.scarcity_level == "scarce"
    assert val.replacement_friction > 1.0
    assert val.fair_value_eur == round(1000.0 * val.depreciation_factor, 2)


def test_idealo_live_schema_parsing_and_german_prices() -> None:
    from cleanbreak.idealo.client import _to_float, valuation_from_bundle

    assert _to_float("1.099,00 €") == 1099.0
    assert _to_float("ab 479,99 €") == 479.99
    assert _to_float("kostenlos") == 0.0

    item = HouseholdItemInput(id="tv", name="LG OLED TV", purchase_year=2023, condition="good")
    bundle = {
        "product_ref": "opaque_ref_123",
        "top_product": {
            "productRef": "opaque_ref_123",
            "itemType": "PRODUCT",
            "name": "LG OLED55C47LA",
            "price": "1.049,00 €",
            "totalOfferCount": 14,
            "url": "https://www.idealo.de/example",
        },
        "details": {"name": "LG OLED55C47LA", "imageUrls": ["https://img.idealo.de/a.jpg"]},
        "offers": {
            "nextOffset": 5,
            "offers": [
                {
                    "key": "1",
                    "price": "1.049,00 €",
                    "minShippingCost": "29,90 €",
                    "hasAlwaysFreeShipping": False,
                    "shop": {"name": "Euronics", "rating": {"avg": 4.6, "count": 500}},
                    "delivery": {"deliveryText": "2-4 Werktage", "deliveryStatus": "IN_STOCK"},
                    "freeReturnDays": 14,
                    "relocatorUrl": "https://www.idealo.de/relocator/1",
                },
                {
                    "key": "2",
                    "price": "1.099,00 €",
                    "minShippingCost": None,
                    "hasAlwaysFreeShipping": True,
                    "shop": {"name": "MediaMarkt", "rating": {"avg": 4.4, "count": 1200}},
                    "delivery": {"deliveryText": "1-3 Werktage", "deliveryStatus": "IN_STOCK"},
                    "freeReturnDays": 14,
                    "relocatorUrl": "https://www.idealo.de/relocator/2",
                },
            ],
        },
        "price_history": {
            "priceTrend": {
                "statistics": {
                    "minPrice": "1.049,00 €",
                    "maxPrice": "1.299,00 €",
                    "avgPrice": "1.210,00 €",
                    "currentPrice": "1.049,00 €",
                    "priceChangePercent": -13.3,
                    "lowestPriceDate": "2026-11-26",
                    "highestPriceDate": "2026-11-02",
                }
            }
        },
    }
    val = valuation_from_bundle(item, bundle, data_source="idealo_live")
    assert val.offer_count == 14
    assert val.scarcity_level == "abundant"
    assert val.lowest_offer_eur == 1078.9
    assert val.trusted_market_price_eur == 1088.95
    assert val.is_buy_new_deal is True
    assert val.price_history and val.price_history.avg_30d_eur == 1210.0
