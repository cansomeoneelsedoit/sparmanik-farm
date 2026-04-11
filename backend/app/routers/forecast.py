from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app.models import ForecastBudget, AccountingEntry, User
from app.schemas.forecast import (
    ForecastBudgetCreate, ForecastBudgetOut, ForecastTotals
)
from app.auth import get_current_user, require_owner

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


def _compute_actuals(db: Session) -> dict[str, float]:
    actuals: dict[str, float] = {}
    rows = db.scalars(
        select(AccountingEntry).where(AccountingEntry.type == "expense")
    ).all()
    for r in rows:
        cat = r.category or ""
        actuals[cat] = actuals.get(cat, 0.0) + r.amount
    return actuals


def _to_out(f: ForecastBudget, actuals: dict[str, float]) -> ForecastBudgetOut:
    actual = actuals.get(f.category, 0.0)
    variance = actual - f.budgeted
    pct = (actual / f.budgeted * 100) if f.budgeted > 0 else 0
    return ForecastBudgetOut(
        id=f.id,
        category=f.category,
        budgeted=f.budgeted,
        period=f.period or "",
        actual=actual,
        variance=variance,
        pct=pct,
    )


@router.get("", response_model=list[ForecastBudgetOut])
def list_forecast(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    actuals = _compute_actuals(db)
    rows = db.scalars(select(ForecastBudget).order_by(ForecastBudget.category)).all()
    return [_to_out(r, actuals) for r in rows]


@router.get("/totals", response_model=ForecastTotals)
def forecast_totals(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    actuals = _compute_actuals(db)
    rows = db.scalars(select(ForecastBudget)).all()
    total_bud = sum(r.budgeted for r in rows)
    total_act = sum(actuals.get(r.category, 0.0) for r in rows)
    return ForecastTotals(
        total_budgeted=total_bud,
        total_actual=total_act,
        over_budget=total_act > total_bud,
        pct=(total_act / total_bud * 100) if total_bud > 0 else 0,
    )


@router.post("", response_model=ForecastBudgetOut)
def create_forecast(
    payload: ForecastBudgetCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    f = ForecastBudget(**payload.model_dump())
    db.add(f)
    db.commit()
    db.refresh(f)
    actuals = _compute_actuals(db)
    return _to_out(f, actuals)


@router.delete("/{forecast_id}", status_code=204)
def delete_forecast(
    forecast_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
):
    f = db.get(ForecastBudget, forecast_id)
    if not f:
        raise HTTPException(status_code=404, detail="Forecast not found")
    db.delete(f)
    db.commit()
