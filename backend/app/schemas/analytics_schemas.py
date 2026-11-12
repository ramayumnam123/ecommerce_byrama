"""Analytics schemas (docs/04 §9.5, docs/08 §3). Revenue basis:
PAID/SHIPPED/DELIVERED orders whose paid_at falls in the window;
partial refunds subtract refund_amount from the summary revenue.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DeltasOut(BaseModel):
    """Percent change vs the equal-length preceding window (None = no baseline)."""

    revenue: float | None = None
    orders_count: float | None = None
    aov: float | None = None
    units_sold: float | None = None
    customers: float | None = None


class SummaryOut(BaseModel):
    revenue: int  # paise, net of partial refunds
    orders_count: int
    aov: int  # paise, floor(revenue / orders)
    units_sold: int
    customers: int  # distinct buyers in the window
    conversion_placeholder: None = None
    deltas_vs_prev: DeltasOut


class RevenueDayOut(BaseModel):
    date: str  # YYYY-MM-DD
    revenue: int
    orders: int


class TopProductOut(BaseModel):
    product_id: uuid.UUID
    name: str
    units: int
    revenue: int


class SalesByCategoryOut(BaseModel):
    category: str  # "Uncategorised" when the product has none
    revenue: int
    share: float  # percent of window revenue, 1 decimal


class CustomerGrowthOut(BaseModel):
    date: str
    new_customers: int
    cumulative: int


class LowStockOut(BaseModel):
    variant_id: uuid.UUID
    sku: str
    product_name: str
    stock: int
