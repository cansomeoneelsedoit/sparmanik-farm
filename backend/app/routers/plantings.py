from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import date

from app.database import get_db
from app.models import Planting, User
from app.schemas.plantings import PlantingCreate, PlantingUpdate, PlantingOut
from app.auth import get_current_user, require_owner

router = APIRouter(prefix="/api/plantings", tags=["plantings"])


def _to_out(p: Planting) -> PlantingOut:
    days = (p.harvest_estimate - date.today()).days
    return PlantingOut(
        id=p.id,
        variety=p.variety,
        planting_date=p.planting_date,
        harvest_estimate=p.harvest_estimate,
        beds=p.beds or "",
        stage=p.stage,
        notes=p.notes or "",
        days_to_harvest=days,
    )


@router.get("", response_model=list[PlantingOut])
def list_plantings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.scalars(select(Planting).order_by(Planting.planting_date.desc())).all()
    return [_to_out(p) for p in rows]


@router.post("", response_model=PlantingOut)
def create_planting(
    payload: PlantingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = Planting(**payload.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return _to_out(p)


@router.patch("/{planting_id}", response_model=PlantingOut)
def update_planting(
    planting_id: int,
    payload: PlantingUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = db.get(Planting, planting_id)
    if not p:
        raise HTTPException(status_code=404, detail="Planting not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return _to_out(p)


@router.delete("/{planting_id}", status_code=204)
def delete_planting(
    planting_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
):
    p = db.get(Planting, planting_id)
    if not p:
        raise HTTPException(status_code=404, detail="Planting not found")
    db.delete(p)
    db.commit()
