from pydantic import BaseModel, Field
from datetime import datetime
from typing import Literal

AdjustReason = Literal["stock_take", "used", "wastage", "received", "correction"]

INVENTORY_CATEGORIES = [
    "Nutrients", "Media", "Pots", "Irrigation",
    "Seeds", "Packaging", "Tools", "Other",
]


class InventoryItemBase(BaseModel):
    name: str
    category: str
    quantity: float = 0
    unit: str = "pcs"
    reorder_level: float = 0
    location: str = ""
    cost_per_unit: float = 0
    photo_url: str = ""


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    quantity: float | None = None
    unit: str | None = None
    reorder_level: float | None = None
    location: str | None = None
    cost_per_unit: float | None = None
    photo_url: str | None = None


class InventoryItemOut(InventoryItemBase):
    id: int
    updated_at: datetime
    status: str  # in_stock, low, out - computed

    class Config:
        from_attributes = True


class InventoryAdjustRequest(BaseModel):
    # Either provide a delta OR a new absolute quantity
    delta: float | None = None
    new_quantity: float | None = Field(default=None, ge=0)
    reason: AdjustReason = "correction"
    note: str = ""


class InventoryAdjustmentOut(BaseModel):
    id: int
    item_id: int
    user_name: str
    old_quantity: float
    new_quantity: float
    delta: float
    reason: str
    note: str
    created_at: datetime

    class Config:
        from_attributes = True


class InventoryPhotoRequest(BaseModel):
    # base64-encoded image, with or without the data URL prefix
    photo_base64: str


class InventoryStats(BaseModel):
    total_items: int
    total_value: float
    low_stock_count: int
    out_of_stock_count: int
    categories: dict[str, int]  # category -> item count
