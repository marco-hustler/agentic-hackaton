"""Shared Pydantic data contracts used across all 3 tracks (idealo, solver/LLM, UI)."""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


OwnershipType = Literal["shared", "party_a", "party_b"]
ConditionType = Literal["like_new", "good", "fair", "worn"]
SplitMode = Literal["balanced", "min_cash", "liquidate_contested"]
AssignmentAction = Literal["party_a", "party_b", "sell_split", "keep_a_buy_new_b", "keep_b_buy_new_a"]
DataSourceType = Literal["idealo_live", "idealo_cached", "demo_fallback"]

# Dividealo world — process lifecycle (UI + SQLite API)
ProcessKind = Literal["separation", "inheritance", "other"]
ProcessStatus = Literal["draft", "collecting", "ready", "resolved", "closed"]


class AccountInfo(BaseModel):
    """Stub session account shown in the app chrome (auth comes later)."""

    id: str = "local-user"
    name: str = "Demo User"
    email: str = "you@dividealo.app"
    initials: str = "DU"


class ProcessCreate(BaseModel):
    """Payload to create a new split process from the world wizard."""

    kind: ProcessKind
    title: str | None = None
    participant_emails: list[str] = Field(default_factory=list)


class ProcessSummary(BaseModel):
    """One process (= one house) in the Dividealo world."""

    id: str
    title: str
    kind: ProcessKind
    status: ProcessStatus = "draft"
    participant_emails: list[str] = Field(default_factory=list)
    created_at: str | None = None
    updated_at: str | None = None


class ProcessStatusUpdate(BaseModel):
    status: ProcessStatus



class HouseholdItemInput(BaseModel):
    """One physical item in the household inventory."""

    id: str
    name: str
    search_query: str = ""
    category: str = "General"
    purchase_year: int = 2023
    condition: ConditionType = "good"
    ownership: OwnershipType = "shared"
    party_a_share: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Optional custom equity share for Party A (defaults from ownership).",
    )
    party_a_points: int = Field(default=10, ge=0, le=100)
    party_b_points: int = Field(default=10, ge=0, le=100)
    willing_to_sell: bool = True
    depreciation_override: float | None = Field(
        default=None,
        ge=0.1,
        le=1.0,
        description="Optional user slider override for retained value multiplier (0.1–1.0).",
    )
    forced_action: AssignmentAction | None = Field(
        default=None,
        description="Optional manual lock from interactive 'What-If' swap in the UI.",
    )
    notes: str = ""

    def effective_party_a_share(self) -> float:
        if self.party_a_share is not None:
            return self.party_a_share
        if self.ownership == "party_a":
            return 1.0
        if self.ownership == "party_b":
            return 0.0
        return 0.5


class IdealoOffer(BaseModel):
    """Normalized merchant offer from idealo MCP."""

    shop_name: str
    price_eur: float
    shipping_eur: float = 0.0
    total_eur: float
    shop_rating: float | None = None
    delivery_text: str | None = None
    free_return_days: int | None = None
    offer_url: str | None = None


class PriceHistoryStats(BaseModel):
    """Normalized 30-day price history from idealo MCP."""

    current_eur: float | None = None
    min_30d_eur: float | None = None
    max_30d_eur: float | None = None
    avg_30d_eur: float | None = None
    pct_change_30d: float | None = None
    lowest_date: str | None = None
    highest_date: str | None = None


class ItemValuation(BaseModel):
    """idealo-grounded valuation and market signals for one household item."""

    item_id: str
    matched_title: str
    product_ref: str | None = None
    product_url: str | None = None
    image_url: str | None = None
    is_substitute: bool = False
    substitute_reason: str | None = None
    category_label: str | None = None
    test_grade: str | None = None

    # Price signals
    trusted_market_price_eur: float
    lowest_offer_eur: float
    depreciation_factor: float = Field(ge=0.1, le=1.0)
    depreciation_explanation: str
    fair_value_eur: float

    # Availability & merchant signals
    offer_count: int = 0
    trusted_offer_count: int = 0
    scarcity_level: Literal["abundant", "moderate", "scarce"] = "moderate"
    replacement_friction: float = Field(default=1.0, ge=1.0, le=1.3)
    top_offers: list[IdealoOffer] = Field(default_factory=list)

    # 30-day trend & Black Friday / deal arbitrage signal
    price_history: PriceHistoryStats | None = None
    is_buy_new_deal: bool = False
    deal_discount_pct: float = 0.0
    deal_headline: str | None = None
    best_buy_new_url: str | None = None

    data_source: DataSourceType = "demo_fallback"
    source_note: str | None = None  # why a placeholder was used (e.g. "live mode off")


class ValuedItem(BaseModel):
    """Combines user item input with its idealo valuation."""

    item: HouseholdItemInput
    valuation: ItemValuation


class AssignedItemResult(BaseModel):
    """Final assignment decision for one item."""

    item_id: str
    item_name: str
    action: AssignmentAction
    fair_value_eur: float
    trusted_market_price_eur: float
    party_a_points: int
    party_b_points: int
    is_contested: bool
    rationale: str
    buy_new_url: str | None = None
    buy_new_price_eur: float | None = None
    buy_new_savings_note: str | None = None


class ReplacementSuggestion(BaseModel):
    """1-click idealo replacement link for a party who didn't keep an item they care about."""

    for_party: Literal["party_a", "party_b"]
    item_name: str
    matched_title: str
    replacement_price_eur: float
    is_deal: bool = False
    deal_headline: str | None = None
    offer_url: str | None = None


class SplitRequest(BaseModel):
    """Request payload for running the deterministic split solver."""

    party_a_name: str = "Alex"
    party_b_name: str = "Sam"
    mode: SplitMode = "balanced"
    valued_items: list[ValuedItem]


class SplitResult(BaseModel):
    """Complete auditable settlement verdict returned by the solver."""

    mode: SplitMode
    party_a_name: str
    party_b_name: str
    assignments: list[AssignedItemResult]

    # Financial totals
    total_fair_value_eur: float
    party_a_entitled_eur: float
    party_b_entitled_eur: float
    party_a_received_goods_eur: float
    party_b_received_goods_eur: float
    sell_pool_eur: float

    # Positive => Party A pays Party B; Negative => Party B pays Party A
    cash_transfer_a_to_b_eur: float
    cash_transfer_summary: str

    # Fairness metrics
    party_a_points_won: int
    party_a_points_total: int
    party_b_points_won: int
    party_b_points_total: int
    fairness_score_pct: float
    is_envy_free: bool

    # Highlights & commercial loop
    arbitrage_highlights: list[AssignedItemResult] = Field(default_factory=list)
    replacement_basket: list[ReplacementSuggestion] = Field(default_factory=list)
    mediator_summary: str = ""


class ProcessInventory(BaseModel):
    """A house's own inventory: items with their idealo valuations, plus the chosen solver mode.

    The split itself is not stored: it is recomputed by the deterministic solver.
    """

    mode: SplitMode = "balanced"
    valued_items: list[ValuedItem] = Field(default_factory=list)
    updated_at: str | None = None
