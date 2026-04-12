from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import date, timedelta
from typing import Optional

from app.database import get_db
from app.models import Sale, User
from app.schemas.sales import (
    SaleCreate, SaleOut, SalesStats, WeeklyRollup, SpeciesBreakdown,
)
from app.auth import get_current_user, require_owner

router = APIRouter(prefix="/api/sales", tags=["sales"])


def _to_out(s: Sale) -> SaleOut:
    return SaleOut(
        id=s.id,
        date=s.date,
        week=s.week,
        species=s.species,
        grade=s.grade,
        weight_kg=s.weight_kg,
        price_per_kg=s.price_per_kg,
        total=s.weight_kg * s.price_per_kg,
    )


@router.get("", response_model=list[SaleOut])
def list_sales(
    species: Optional[str] = None,
    grade: Optional[str] = None,
    period: Optional[str] = Query(None, description="all, week, month"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Sale)
    if species and species != "all":
        stmt = stmt.where(Sale.species == species)
    if grade and grade != "all":
        stmt = stmt.where(Sale.grade == grade)
    if period == "week":
        cutoff = date.today() - timedelta(days=7)
        stmt = stmt.where(Sale.date >= cutoff)
    elif period == "month":
        cutoff = date.today() - timedelta(days=30)
        stmt = stmt.where(Sale.date >= cutoff)
    stmt = stmt.order_by(Sale.date.desc())
    sales = db.scalars(stmt).all()
    return [_to_out(s) for s in sales]


@router.get("/stats", response_model=SalesStats)
def sales_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sales = db.scalars(select(Sale)).all()
    total_rev = sum(s.weight_kg * s.price_per_kg for s in sales)
    total_kg = sum(s.weight_kg for s in sales)

    weekly_map: dict[int, dict] = {}
    for s in sales:
        if s.week not in weekly_map:
            weekly_map[s.week] = {"revenue": 0.0, "weight_kg": 0.0, "entry_count": 0}
        weekly_map[s.week]["revenue"] += s.weight_kg * s.price_per_kg
        weekly_map[s.week]["weight_kg"] += s.weight_kg
        weekly_map[s.week]["entry_count"] += 1
    weekly = [
        WeeklyRollup(week=w, **wd)
        for w, wd in sorted(weekly_map.items(), key=lambda x: -x[0])
    ]

    species_map: dict[str, dict] = {}
    for s in sales:
        if s.species not in species_map:
            species_map[s.species] = {"revenue": 0.0, "weight_kg": 0.0}
        species_map[s.species]["revenue"] += s.weight_kg * s.price_per_kg
        species_map[s.species]["weight_kg"] += s.weight_kg
    by_species = [
        SpeciesBreakdown(species=sp, **sd)
        for sp, sd in sorted(species_map.items(), key=lambda x: -x[1]["revenue"])
    ]

    return SalesStats(
        total_revenue=total_rev,
        total_weight_kg=total_kg,
        entry_count=len(sales),
        weekly=weekly,
        by_species=by_species,
    )


@router.post("", response_model=SaleOut)
def create_sale(
    payload: SaleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sale = Sale(**payload.model_dump())
    db.add(sale)
    db.commit()
    db.refresh(sale)
    return _to_out(sale)


@router.patch("/{sale_id}", response_model=SaleOut)
def update_sale(
    sale_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    allowed = {"date", "week", "species", "grade", "weight_kg", "price_per_kg"}
    for key, val in payload.items():
        if key in allowed:
            setattr(sale, key, val)
    db.commit()
    db.refresh(sale)
    return _to_out(sale)


@router.delete("/{sale_id}", status_code=204)
def delete_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
):
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    db.delete(sale)
    db.commit()
