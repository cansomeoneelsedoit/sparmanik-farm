from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app.models import StaffWage, User
from app.schemas.staff import StaffWageCreate, StaffWageOut, StaffProfile
from app.auth import get_current_user, require_owner

router = APIRouter(prefix="/api/staff", tags=["staff"])


def _to_out(s: StaffWage) -> StaffWageOut:
    return StaffWageOut(
        id=s.id,
        name=s.name,
        role=s.role or "",
        week=s.week,
        date=s.date,
        hours=s.hours,
        hourly_rate=s.hourly_rate,
        wage_total=s.hours * s.hourly_rate,
    )


@router.get("", response_model=list[StaffWageOut])
def list_wages(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.scalars(select(StaffWage).order_by(StaffWage.week.desc(), StaffWage.name)).all()
    return [_to_out(r) for r in rows]


@router.get("/profiles", response_model=list[StaffProfile])
def list_profiles(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.scalars(select(StaffWage)).all()
    by_name: dict[str, dict] = {}
    for r in rows:
        if r.name not in by_name:
            by_name[r.name] = {
                "name": r.name,
                "role": r.role or "",
                "total_hours": 0.0,
                "total_earned": 0.0,
                "weeks": set(),
                "entries": [],
            }
        p = by_name[r.name]
        p["total_hours"] += r.hours
        p["total_earned"] += r.hours * r.hourly_rate
        p["weeks"].add(r.week)
        p["entries"].append(_to_out(r))
        # Latest role
        p["role"] = r.role or p["role"]

    profiles = []
    for p in by_name.values():
        profiles.append(StaffProfile(
            name=p["name"],
            role=p["role"],
            total_hours=p["total_hours"],
            total_earned=p["total_earned"],
            weeks_worked=len(p["weeks"]),
            entries=sorted(p["entries"], key=lambda e: e.date, reverse=True),
        ))
    profiles.sort(key=lambda p: -p.total_earned)
    return profiles


@router.post("", response_model=StaffWageOut)
def create_wage(
    payload: StaffWageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    wage = StaffWage(**payload.model_dump())
    db.add(wage)
    db.commit()
    db.refresh(wage)
    return _to_out(wage)


@router.delete("/{wage_id}", status_code=204)
def delete_wage(
    wage_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
):
    w = db.get(StaffWage, wage_id)
    if not w:
        raise HTTPException(status_code=404, detail="Wage entry not found")
    db.delete(w)
    db.commit()
