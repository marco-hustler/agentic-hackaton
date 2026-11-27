"""Transparent, deterministic valuation engine powered by idealo MCP signals.

Computes:
1. Trusted Market Price (median of well-rated offers including shipping — resists outliers).
2. Transparent Age + Condition Depreciation -> Fair Settlement Value (editable via UI slider).
3. Availability / Scarcity -> Replacement Friction.
4. 30-day Price History -> Black Friday / Buy-New Deal Arbitrage flag.
"""

from __future__ import annotations

from datetime import datetime
from statistics import median

from cleanbreak.models import (
    ConditionType,
    DataSourceType,
    HouseholdItemInput,
    IdealoOffer,
    ItemValuation,
    PriceHistoryStats,
)

CONDITION_MULTIPLIERS: dict[ConditionType, float] = {
    "like_new": 1.00,
    "good": 0.92,
    "fair": 0.80,
    "worn": 0.65,
}

# Minimum shop rating to consider an offer "trusted" (idealo uses a 1–5 star scale or 0–100%).
MIN_TRUSTED_RATING_5 = 4.0
MIN_TRUSTED_RATING_100 = 80.0


def compute_depreciation(
    purchase_year: int,
    condition: ConditionType,
    current_year: int | None = None,
    override: float | None = None,
) -> tuple[float, str]:
    """Return (retained_value_multiplier, human_readable_explanation)."""
    year_now = current_year or datetime.now().year
    age_years = max(0, year_now - purchase_year)

    # Transparent linear-with-floor curve: 15% year 1, 10%/year after, floored at 30%.
    if age_years == 0:
        age_factor = 0.95
    elif age_years == 1:
        age_factor = 0.85
    else:
        age_factor = max(0.30, 0.85 - 0.10 * (age_years - 1))

    cond_factor = CONDITION_MULTIPLIERS.get(condition, 0.92)
    combined = round(max(0.25, min(1.0, age_factor * cond_factor)), 2)

    explanation = (
        f"{age_years} years old ({int(age_factor * 100)}%), {condition.replace('_', ' ')} condition "
        f"({int(cond_factor * 100)}%): {int(combined * 100)}% of today's price for a new one."
    )
    # Moving the slider back to the suggested value clears the override.
    if override is not None and abs(override - combined) >= 0.005:
        clamped = round(max(0.10, min(1.00, override)), 2)
        return clamped, f"Set by hand to {int(clamped * 100)}%. Suggested: {int(combined * 100)}%."
    return combined, explanation


def _is_trusted_offer(offer: IdealoOffer) -> bool:
    if offer.shop_rating is None:
        return True
    if offer.shop_rating <= 5.0:
        return offer.shop_rating >= MIN_TRUSTED_RATING_5
    return offer.shop_rating >= MIN_TRUSTED_RATING_100


def compute_trusted_market_price(offers: list[IdealoOffer], fallback_price: float = 0.0) -> tuple[float, float, int]:
    """Compute (trusted_market_price_eur, lowest_offer_eur, trusted_offer_count).

    Uses the median of the top 5 trusted offers (price + shipping) to anchor a fair,
    non-cherry-picked replacement price.
    """
    valid = [o for o in offers if o.total_eur > 0]
    if not valid:
        price = round(max(0.0, fallback_price), 2)
        return price, price, 0

    valid.sort(key=lambda o: o.total_eur)
    lowest = round(valid[0].total_eur, 2)

    trusted = [o for o in valid if _is_trusted_offer(o)]
    pool = trusted[:5] if trusted else valid[:5]
    trusted_price = round(float(median([o.total_eur for o in pool])), 2)
    return trusted_price, lowest, len(trusted)


def assess_scarcity(offer_count: int) -> tuple[str, float]:
    """Return (scarcity_level, replacement_friction_multiplier)."""
    if offer_count <= 2:
        return "scarce", 1.15
    if offer_count <= 6:
        return "moderate", 1.05
    return "abundant", 1.00


def assess_buy_new_deal(
    trusted_price_eur: float,
    lowest_offer_eur: float,
    history: PriceHistoryStats | None,
    offer_count: int,
) -> tuple[bool, float, str | None]:
    """Detect whether idealo's 30-day history signals a genuine Buy-New Deal (e.g. Black Friday).

    Returns (is_deal, discount_pct_vs_30d_avg, headline).
    """
    if history is None or offer_count < 2:
        return False, 0.0, None

    current = history.current_eur or lowest_offer_eur or trusted_price_eur
    reference = history.avg_30d_eur or history.max_30d_eur
    if not current or not reference or reference <= 0:
        return False, 0.0, None

    discount_pct = round(((reference - current) / reference) * 100.0, 1)
    near_30d_low = (
        history.min_30d_eur is not None
        and history.min_30d_eur > 0
        and current <= history.min_30d_eur * 1.04
    )

    # Trigger when meaningfully below 30-day average (>= 8%) OR >= 5% below avg AND right at the 30-day low.
    if discount_pct >= 8.0 or (discount_pct >= 5.0 and near_30d_low):
        tag = "30-day low" if near_30d_low else "below 30-day avg"
        headline = (
            f"Deal alert ({tag}): €{current:.0f} today vs €{reference:.0f} 30-day avg "
            f"(-{discount_pct:.0f}%, {offer_count} shops in stock)"
        )
        return True, discount_pct, headline

    return False, max(0.0, discount_pct), None


def build_valuation(
    item: HouseholdItemInput,
    *,
    matched_title: str,
    offers: list[IdealoOffer],
    price_history: PriceHistoryStats | None = None,
    fallback_price_eur: float = 0.0,
    product_ref: str | None = None,
    product_url: str | None = None,
    image_url: str | None = None,
    is_substitute: bool = False,
    substitute_reason: str | None = None,
    category_label: str | None = None,
    test_grade: str | None = None,
    data_source: DataSourceType = "idealo_live",
    current_year: int | None = None,
) -> ItemValuation:
    """Assemble a complete, transparent ItemValuation from normalized idealo data."""
    trusted_price, lowest_offer, trusted_count = compute_trusted_market_price(
        offers, fallback_price=fallback_price_eur
    )
    depreciation_factor, depreciation_expl = compute_depreciation(
        purchase_year=item.purchase_year,
        condition=item.condition,
        current_year=current_year,
        override=item.depreciation_override,
    )
    fair_value = round(trusted_price * depreciation_factor, 2)

    offer_count = len(offers)
    scarcity_level, replacement_friction = assess_scarcity(offer_count)
    is_deal, deal_discount_pct, deal_headline = assess_buy_new_deal(
        trusted_price_eur=trusted_price,
        lowest_offer_eur=lowest_offer,
        history=price_history,
        offer_count=offer_count,
    )

    sorted_offers = sorted(offers, key=lambda o: o.total_eur)
    best_url = next((o.offer_url for o in sorted_offers if o.offer_url), product_url)

    return ItemValuation(
        item_id=item.id,
        matched_title=matched_title,
        product_ref=product_ref,
        product_url=product_url,
        image_url=image_url,
        is_substitute=is_substitute,
        substitute_reason=substitute_reason,
        category_label=category_label or item.category,
        test_grade=test_grade,
        trusted_market_price_eur=trusted_price,
        lowest_offer_eur=lowest_offer,
        depreciation_factor=depreciation_factor,
        depreciation_explanation=depreciation_expl,
        fair_value_eur=fair_value,
        offer_count=offer_count,
        trusted_offer_count=trusted_count,
        scarcity_level=scarcity_level,  # type: ignore[arg-type]
        replacement_friction=replacement_friction,
        top_offers=sorted_offers[:5],
        price_history=price_history,
        is_buy_new_deal=is_deal,
        deal_discount_pct=deal_discount_pct,
        deal_headline=deal_headline,
        best_buy_new_url=best_url,
        data_source=data_source,
    )


def build_demo_fallback_valuations(items: list[HouseholdItemInput]) -> list[ItemValuation]:
    """Realistic offline reference valuations used ONLY before live idealo MCP cache is populated.

    Clearly tagged `data_source='demo_fallback'` so the UI never pretends fallback data is live.
    """
    snapshots: dict[str, dict] = {
        "espresso": {
            "matched_title": "Sage Appliances The Barista Express (SES875)",
            "offers": [
                IdealoOffer(shop_name="CoffeeCircle", price_eur=479.0, shipping_eur=0.0, total_eur=479.0, shop_rating=4.8, delivery_text="1-2 Werktage", free_return_days=30, offer_url="https://www.idealo.de/preisvergleich/OffersOfProduct/5234824_-the-barista-express-ses875-sage-appliances.html"),
                IdealoOffer(shop_name="MediaMarkt", price_eur=489.0, shipping_eur=0.0, total_eur=489.0, shop_rating=4.4, delivery_text="2-3 Werktage", free_return_days=14, offer_url="https://www.idealo.de/preisvergleich/OffersOfProduct/5234824_-the-barista-express-ses875-sage-appliances.html"),
                IdealoOffer(shop_name="Saturn", price_eur=489.0, shipping_eur=0.0, total_eur=489.0, shop_rating=4.3, delivery_text="2-3 Werktage", free_return_days=14, offer_url="https://www.idealo.de/preisvergleich/OffersOfProduct/5234824_-the-barista-express-ses875-sage-appliances.html"),
                IdealoOffer(shop_name="Roastmarket", price_eur=499.0, shipping_eur=0.0, total_eur=499.0, shop_rating=4.7, delivery_text="1-3 Werktage", free_return_days=30, offer_url="https://www.idealo.de/preisvergleich/OffersOfProduct/5234824_-the-barista-express-ses875-sage-appliances.html"),
                IdealoOffer(shop_name="Galaxus", price_eur=509.0, shipping_eur=0.0, total_eur=509.0, shop_rating=4.6, delivery_text="2-4 Werktage", free_return_days=30, offer_url="https://www.idealo.de/preisvergleich/OffersOfProduct/5234824_-the-barista-express-ses875-sage-appliances.html"),
                IdealoOffer(shop_name="Alternate", price_eur=515.0, shipping_eur=6.99, total_eur=521.99, shop_rating=4.5, delivery_text="2-3 Werktage", free_return_days=14, offer_url="https://www.idealo.de/preisvergleich/OffersOfProduct/5234824_-the-barista-express-ses875-sage-appliances.html"),
                IdealoOffer(shop_name="Cyberport", price_eur=519.0, shipping_eur=0.0, total_eur=519.0, shop_rating=4.4, delivery_text="2-3 Werktage", free_return_days=14, offer_url="https://www.idealo.de/preisvergleich/OffersOfProduct/5234824_-the-barista-express-ses875-sage-appliances.html"),
            ],
            "history": PriceHistoryStats(current_eur=479.0, min_30d_eur=479.0, max_30d_eur=629.0, avg_30d_eur=589.0, pct_change_30d=-18.7),
            "test_grade": "gut (1,8)",
        },
        "vacuum": {
            "matched_title": "Dyson V15 Detect Absolute",
            "offers": [
                IdealoOffer(shop_name="Dyson Shop", price_eur=549.0, shipping_eur=0.0, total_eur=549.0, shop_rating=4.6, delivery_text="1-2 Werktage", free_return_days=30),
                IdealoOffer(shop_name="MediaMarkt", price_eur=559.0, shipping_eur=0.0, total_eur=559.0, shop_rating=4.4, delivery_text="1-2 Werktage", free_return_days=14),
                IdealoOffer(shop_name="Galaxus", price_eur=565.0, shipping_eur=0.0, total_eur=565.0, shop_rating=4.6, delivery_text="2-3 Werktage", free_return_days=30),
                IdealoOffer(shop_name="Cyberport", price_eur=579.0, shipping_eur=0.0, total_eur=579.0, shop_rating=4.4, delivery_text="2-3 Werktage", free_return_days=14),
                IdealoOffer(shop_name="Expert", price_eur=589.0, shipping_eur=4.99, total_eur=593.99, shop_rating=4.3, delivery_text="2-4 Werktage", free_return_days=14),
            ],
            "history": PriceHistoryStats(current_eur=549.0, min_30d_eur=529.0, max_30d_eur=599.0, avg_30d_eur=565.0, pct_change_30d=-2.8),
            "test_grade": "sehr gut (1,5)",
        },
        "tv": {
            "matched_title": "LG OLED55C47LA (55 Zoll, 4K OLED)",
            "offers": [
                IdealoOffer(shop_name="Euronics", price_eur=1049.0, shipping_eur=29.9, total_eur=1078.9, shop_rating=4.5, delivery_text="3-5 Werktage", free_return_days=14),
                IdealoOffer(shop_name="MediaMarkt", price_eur=1099.0, shipping_eur=0.0, total_eur=1099.0, shop_rating=4.4, delivery_text="2-4 Werktage", free_return_days=14),
                IdealoOffer(shop_name="Saturn", price_eur=1099.0, shipping_eur=0.0, total_eur=1099.0, shop_rating=4.3, delivery_text="2-4 Werktage", free_return_days=14),
                IdealoOffer(shop_name="Galaxus", price_eur=1129.0, shipping_eur=0.0, total_eur=1129.0, shop_rating=4.6, delivery_text="2-4 Werktage", free_return_days=30),
            ],
            "history": PriceHistoryStats(current_eur=1078.9, min_30d_eur=1049.0, max_30d_eur=1199.0, avg_30d_eur=1125.0, pct_change_30d=-4.1),
            "test_grade": "sehr gut (1,4)",
        },
        "speaker": {
            "matched_title": "Sonos Era 300",
            "offers": [
                IdealoOffer(shop_name="Hifi Klubben", price_eur=399.0, shipping_eur=0.0, total_eur=399.0, shop_rating=4.8, delivery_text="1-3 Werktage", free_return_days=30),
                IdealoOffer(shop_name="MediaMarkt", price_eur=419.0, shipping_eur=0.0, total_eur=419.0, shop_rating=4.4, delivery_text="1-2 Werktage", free_return_days=14),
                IdealoOffer(shop_name="Cyberport", price_eur=425.0, shipping_eur=0.0, total_eur=425.0, shop_rating=4.4, delivery_text="2-3 Werktage", free_return_days=14),
                IdealoOffer(shop_name="Galaxus", price_eur=429.0, shipping_eur=0.0, total_eur=429.0, shop_rating=4.6, delivery_text="2-3 Werktage", free_return_days=30),
                IdealoOffer(shop_name="Alternate", price_eur=435.0, shipping_eur=0.0, total_eur=435.0, shop_rating=4.5, delivery_text="2-3 Werktage", free_return_days=14),
            ],
            "history": PriceHistoryStats(current_eur=399.0, min_30d_eur=389.0, max_30d_eur=449.0, avg_30d_eur=422.0, pct_change_30d=-5.5),
            "test_grade": "gut (1,7)",
        },
        "mixer": {
            "matched_title": "KitchenAid Artisan 5KSM175PS (4,8 L)",
            "offers": [
                IdealoOffer(shop_name="Cookinglife", price_eur=469.0, shipping_eur=0.0, total_eur=469.0, shop_rating=4.7, delivery_text="2-3 Werktage", free_return_days=30),
                IdealoOffer(shop_name="Galaxus", price_eur=479.0, shipping_eur=0.0, total_eur=479.0, shop_rating=4.6, delivery_text="2-3 Werktage", free_return_days=30),
                IdealoOffer(shop_name="MediaMarkt", price_eur=499.0, shipping_eur=0.0, total_eur=499.0, shop_rating=4.4, delivery_text="2-4 Werktage", free_return_days=14),
            ],
            "history": PriceHistoryStats(current_eur=469.0, min_30d_eur=465.0, max_30d_eur=529.0, avg_30d_eur=492.0, pct_change_30d=-4.7),
            "test_grade": "gut (1,9)",
        },
        "switch": {
            "matched_title": "Nintendo Switch (OLED-Modell)",
            "offers": [
                IdealoOffer(shop_name="MediaMarkt", price_eur=299.0, shipping_eur=0.0, total_eur=299.0, shop_rating=4.4, delivery_text="1-2 Werktage", free_return_days=14),
                IdealoOffer(shop_name="Saturn", price_eur=299.0, shipping_eur=0.0, total_eur=299.0, shop_rating=4.3, delivery_text="1-2 Werktage", free_return_days=14),
                IdealoOffer(shop_name="Galaxus", price_eur=309.0, shipping_eur=0.0, total_eur=309.0, shop_rating=4.6, delivery_text="1-3 Werktage", free_return_days=30),
                IdealoOffer(shop_name="Coolblue", price_eur=312.0, shipping_eur=0.0, total_eur=312.0, shop_rating=4.8, delivery_text="1-2 Werktage", free_return_days=30),
                IdealoOffer(shop_name="Alternate", price_eur=315.0, shipping_eur=0.0, total_eur=315.0, shop_rating=4.5, delivery_text="2-3 Werktage", free_return_days=14),
                IdealoOffer(shop_name="Cyberport", price_eur=319.0, shipping_eur=0.0, total_eur=319.0, shop_rating=4.4, delivery_text="2-3 Werktage", free_return_days=14),
                IdealoOffer(shop_name="Expert", price_eur=324.0, shipping_eur=0.0, total_eur=324.0, shop_rating=4.3, delivery_text="2-4 Werktage", free_return_days=14),
            ],
            "history": PriceHistoryStats(current_eur=299.0, min_30d_eur=295.0, max_30d_eur=339.0, avg_30d_eur=318.0, pct_change_30d=-6.0),
            "test_grade": "sehr gut (1,5)",
        },
        "washer": {
            "matched_title": "Bosch Serie 6 WGG244Z40 (8 kg, 1400 U/min)",
            "is_substitute": True,
            "substitute_reason": "The 2019 model is no longer sold, so it is priced like the closest Bosch Serie 6 8 kg on idealo.",
            "offers": [
                IdealoOffer(shop_name="AO / Coolblue", price_eur=579.0, shipping_eur=39.9, total_eur=618.9, shop_rating=4.7, delivery_text="3-5 Werktage", free_return_days=30),
                IdealoOffer(shop_name="MediaMarkt", price_eur=599.0, shipping_eur=39.9, total_eur=638.9, shop_rating=4.4, delivery_text="3-6 Werktage", free_return_days=14),
            ],
            "history": PriceHistoryStats(current_eur=618.9, min_30d_eur=599.0, max_30d_eur=659.0, avg_30d_eur=629.0, pct_change_30d=-1.6),
            "test_grade": "gut (1,7)",
        },
    }

    results: list[ItemValuation] = []
    for item in items:
        snap = snapshots.get(item.id)
        if snap:
            results.append(
                build_valuation(
                    item,
                    matched_title=snap["matched_title"],
                    offers=snap["offers"],
                    price_history=snap["history"],
                    is_substitute=snap.get("is_substitute", False),
                    substitute_reason=snap.get("substitute_reason"),
                    test_grade=snap.get("test_grade"),
                    data_source="demo_fallback",
                )
            )
        else:
            est = item.estimated_price_eur if (item.estimated_price_eur and item.estimated_price_eur > 0) else 250.0
            shop_label = "User Estimate" if item.estimated_price_eur else "Demo Reference Shop"
            results.append(
                build_valuation(
                    item,
                    matched_title=item.name,
                    offers=[
                        IdealoOffer(
                            shop_name=shop_label,
                            price_eur=est,
                            shipping_eur=0.0,
                            total_eur=est,
                            shop_rating=4.5,
                        )
                    ],
                    fallback_price_eur=est,
                    data_source="demo_fallback",
                )
            )
    return results
