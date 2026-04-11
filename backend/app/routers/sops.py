import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app.models import Sop, User
from app.schemas.sops import SopCreate, SopOut
from app.auth import get_current_user, require_owner

router = APIRouter(prefix="/api/sops", tags=["sops"])


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _to_out(s: Sop) -> SopOut:
    return SopOut(
        id=s.id,
        title=s.title,
        title_key=s.title_key,
        category=s.category,
        description=s.description or "",
        steps=s.steps or [],
        safety_notes=s.safety_notes or "",
        frequency=s.frequency or "",
        image_url=s.image_url or "",
        version=s.version,
        archived=s.archived,
        archived_at=s.archived_at,
        created_at=s.created_at,
    )


@router.get("", response_model=list[SopOut])
def list_active(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.scalars(
        select(Sop).where(Sop.archived == False).order_by(Sop.created_at.desc())
    ).all()
    return [_to_out(r) for r in rows]


@router.get("/archive", response_model=list[SopOut])
def list_archived(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.scalars(
        select(Sop).where(Sop.archived == True).order_by(Sop.archived_at.desc())
    ).all()
    return [_to_out(r) for r in rows]


@router.get("/{sop_id}", response_model=SopOut)
def get_sop(
    sop_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sop = db.get(Sop, sop_id)
    if not sop:
        raise HTTPException(status_code=404, detail="SOP not found")
    return _to_out(sop)


@router.post("", response_model=SopOut)
def create_sop(
    payload: SopCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    title_key = _slug(payload.title)
    # Check max version of any matching title_key (active OR archived)
    existing = db.scalars(
        select(Sop).where(Sop.title_key == title_key)
    ).all()
    version = 1
    if existing:
        version = max(s.version for s in existing) + 1
    sop = Sop(
        title=payload.title,
        title_key=title_key,
        category=payload.category,
        description=payload.description,
        steps=payload.steps,
        safety_notes=payload.safety_notes,
        frequency=payload.frequency,
        image_url=payload.image_url,
        version=version,
        archived=False,
    )
    db.add(sop)
    db.commit()
    db.refresh(sop)
    return _to_out(sop)


@router.post("/{sop_id}/replace", response_model=SopOut)
def replace_sop(
    sop_id: int,
    payload: SopCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Archive the old SOP and create a new active version with the same title_key."""
    old = db.get(Sop, sop_id)
    if not old:
        raise HTTPException(status_code=404, detail="SOP not found")
    if old.archived:
        raise HTTPException(status_code=400, detail="SOP is already archived")

    title_key = old.title_key
    new_version = old.version + 1

    # Archive the old one
    old.archived = True
    old.archived_at = datetime.utcnow()

    # Create the new active version
    sop = Sop(
        title=payload.title,
        title_key=title_key,
        category=payload.category,
        description=payload.description,
        steps=payload.steps,
        safety_notes=payload.safety_notes,
        frequency=payload.frequency,
        image_url=payload.image_url,
        version=new_version,
        archived=False,
    )
    db.add(sop)
    db.commit()
    db.refresh(sop)
    return _to_out(sop)


@router.post("/{sop_id}/archive", response_model=SopOut)
def archive_sop(
    sop_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sop = db.get(Sop, sop_id)
    if not sop:
        raise HTTPException(status_code=404, detail="SOP not found")
    sop.archived = True
    sop.archived_at = datetime.utcnow()
    db.commit()
    db.refresh(sop)
    return _to_out(sop)


@router.post("/{sop_id}/restore", response_model=SopOut)
def restore_sop(
    sop_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sop = db.get(Sop, sop_id)
    if not sop:
        raise HTTPException(status_code=404, detail="SOP not found")
    sop.archived = False
    sop.archived_at = None
    db.commit()
    db.refresh(sop)
    return _to_out(sop)


@router.delete("/{sop_id}", status_code=204)
def delete_sop(
    sop_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
):
    sop = db.get(Sop, sop_id)
    if not sop:
        raise HTTPException(status_code=404, detail="SOP not found")
    db.delete(sop)
    db.commit()
