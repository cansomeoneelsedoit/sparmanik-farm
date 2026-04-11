from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app.models import AccountingEntry, Sale, StaffWage, User
from app.schemas.accounting import (
    AccountingEntryCreate, AccountingEntryOut, AccountingTotals, SyncResult
)
from app.auth import get_current_user, require_owner

router = APIRouter(prefix="/api/accounting", tags=["accounting"])


def _to_out(a: AccountingEntry) -> AccountingEntryOut:
    return AccountingEntryOut(
        id=a.id,
        date=a.date,
        type=a.type,
        description=a.description or "",
        amount=a.amount,
        category=a.category or "",
        source=a.source or "manual",
    )


@router.get("", response_model=list[AccountingEntryOut])
def list_entries(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.scalars(select(AccountingEntry).order_by(AccountingEntry.date.desc())).all()
    return [_to_out(r) for r in rows]


@router.get("/totals", response_model=AccountingTotals)
def totals(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.scalars(select(AccountingEntry)).all()
    income = sum(r.amount for r in rows if r.type == "income")
    expense = sum(r.amount for r in rows if r.type == "expense")
    return AccountingTotals(
        income=income,
        expense=expense,
        net=income - expense,
        entry_count=len(rows),
    )


@router.post("", response_model=AccountingEntryOut)
def create_entry(
    payload: AccountingEntryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = AccountingEntry(**payload.model_dump(), source="manual")
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _to_out(entry)


@router.post("/sync", response_model=SyncResult)
def sync_from_sales_and_wages(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate auto entries from sales and staff wages, grouped by week.

    Idempotent: looks for existing auto entries with matching descriptions and skips them.
    """
    existing_descriptions = set()
    for row in db.scalars(select(AccountingEntry).where(AccountingEntry.source == "auto")).all():
        existing_descriptions.add(row.description)

    sales_added = 0
    wages_added = 0

    # Sales rollup by week
    sales_by_week: dict[int, dict] = {}
    for s in db.scalars(select(Sale)).all():
        if s.week not in sales_by_week:
            sales_by_week[s.week] = {"total": 0.0, "date": s.date}
        sales_by_week[s.week]["total"] += s.weight_kg * s.price_per_kg
        if s.date > sales_by_week[s.week]["date"]:
            sales_by_week[s.week]["date"] = s.date

    for week, info in sales_by_week.items():
        desc = f"Sales rollup week {week}"
        if desc in existing_descriptions:
            continue
        db.add(AccountingEntry(
            date=info["date"],
            type="income",
            description=desc,
            amount=info["total"],
            category="Sales",
            source="auto",
        ))
        sales_added += 1

    # Wages rollup by week
    wages_by_week: dict[int, dict] = {}
    for w in db.scalars(select(StaffWage)).all():
        if w.week not in wages_by_week:
            wages_by_week[w.week] = {"total": 0.0, "date": w.date}
        wages_by_week[w.week]["total"] += w.hours * w.hourly_rate
        if w.date > wages_by_week[w.week]["date"]:
            wages_by_week[w.week]["date"] = w.date

    for week, info in wages_by_week.items():
        desc = f"Wages rollup week {week}"
        if desc in existing_descriptions:
            continue
        db.add(AccountingEntry(
            date=info["date"],
            type="expense",
            description=desc,
            amount=info["total"],
            category="Staff wages",
            source="auto",
        ))
        wages_added += 1

    db.commit()
    return SyncResult(
        sales_added=sales_added,
        wages_added=wages_added,
        message=f"Synced {sales_added} sales and {wages_added} wage entries",
    )


@router.delete("/{entry_id}", status_code=204)
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = db.get(AccountingEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.source == "auto":
        raise HTTPException(status_code=400, detail="Cannot delete auto-generated entries")
    db.delete(entry)
    db.commit()
