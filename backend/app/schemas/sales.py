from pydantic import BaseModel
from datetime import date as date_type, datetime


class SaleBase(BaseModel):
    date: date_type
    week: int
    species: str
    grade: str
    weight_kg: float
    price_per_kg: float


class SaleCreate(SaleBase):
    pass


class SaleOut(SaleBase):
    id: int
    total: float

    class Config:
        from_attributes = True


class WeeklyRollup(BaseModel):
    week: int
    revenue: float
    weight_kg: float
    entry_count: int


class SpeciesBreakdown(BaseModel):
    species: str
    revenue: float
    weight_kg: float


class SalesStats(BaseModel):
    total_revenue: float
    total_weight_kg: float
    entry_count: int
    weekly: list[WeeklyRollup]
    by_species: list[SpeciesBreakdown]
