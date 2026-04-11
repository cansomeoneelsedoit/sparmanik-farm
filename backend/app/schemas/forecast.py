from pydantic import BaseModel


class ForecastBudgetBase(BaseModel):
    category: str
    budgeted: float
    period: str  # YYYY-MM


class ForecastBudgetCreate(ForecastBudgetBase):
    pass


class ForecastBudgetOut(ForecastBudgetBase):
    id: int
    actual: float
    variance: float
    pct: float

    class Config:
        from_attributes = True


class ForecastTotals(BaseModel):
    total_budgeted: float
    total_actual: float
    over_budget: bool
    pct: float
