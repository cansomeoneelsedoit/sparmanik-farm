from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from typing import Optional

from app.database import get_db
from app.models import InventoryItem, InventoryAdjustment, User
from app.schemas.inventory import (
    InventoryItemCreate, InventoryItemUpdate, InventoryItemOut,
    InventoryAdjustRequest, InventoryAdjustmentOut, InventoryPhotoRequest,
    InventoryStats,
)
from app.auth import get_current_user, require_owner

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


def _item_status(item: InventoryItem) -> str:
    if item.quantity <= 0:
        return "out"
    if item.quantity <= item.reorder_level:
        return "low"
    return "in_stock"


def _to_out(item: InventoryItem) -> InventoryItemOut:
    return InventoryItemOut(
        id=item.id,
        name=item.name,
        category=item.category,
        quantity=item.quantity,
        unit=item.unit,
        reorder_level=item.reorder_level,
        location=item.location,
        cost_per_unit=item.cost_per_unit,
        photo_url=item.photo_url,
        updated_at=item.updated_at,
        status=_item_status(item),
    )


@router.get("", response_model=list[InventoryItemOut])
def list_inventory(
    category: Optional[str] = None,
    low_stock: bool = False,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(InventoryItem)
    if category and category != "all":
        stmt = stmt.where(InventoryItem.category == category)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(func.lower(InventoryItem.name).like(like))
    stmt = stmt.order_by(InventoryItem.category, InventoryItem.name)
    items = db.scalars(stmt).all()
    if low_stock:
        items = [i for i in items if i.quantity <= i.reorder_level]
    return [_to_out(i) for i in items]


@router.get("/stats", response_model=InventoryStats)
def inventory_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    items = db.scalars(select(InventoryItem)).all()
    total_value = sum(i.quantity * i.cost_per_unit for i in items)
    low = sum(1 for i in items if 0 < i.quantity <= i.reorder_level)
    out = sum(1 for i in items if i.quantity <= 0)
    categories: dict[str, int] = {}
    for i in items:
        categories[i.category] = categories.get(i.category, 0) + 1
    return InventoryStats(
        total_items=len(items),
        total_value=total_value,
        low_stock_count=low,
        out_of_stock_count=out,
        categories=categories,
    )


@router.get("/{item_id}", response_model=InventoryItemOut)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return _to_out(item)


@router.post("", response_model=InventoryItemOut)
def create_item(
    payload: InventoryItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = InventoryItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.patch("/{item_id}", response_model=InventoryItemOut)
def update_item(
    item_id: int,
    payload: InventoryItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.post("/{item_id}/adjust", response_model=InventoryItemOut)
def adjust_item(
    item_id: int,
    payload: InventoryAdjustRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Apply a quantity change and log it to the audit trail."""
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    old_q = item.quantity

    if payload.new_quantity is not None:
        new_q = payload.new_quantity
    elif payload.delta is not None:
        new_q = max(0, old_q + payload.delta)
    else:
        raise HTTPException(status_code=400, detail="Provide either delta or new_quantity")

    delta = new_q - old_q
    if delta == 0:
        return _to_out(item)  # nothing to do

    item.quantity = new_q

    adj = InventoryAdjustment(
        item_id=item.id,
        user_id=user.id,
        user_name=user.name,
        old_quantity=old_q,
        new_quantity=new_q,
        delta=delta,
        reason=payload.reason,
        note=payload.note,
    )
    db.add(adj)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.post("/{item_id}/photo", response_model=InventoryItemOut)
def set_photo(
    item_id: int,
    payload: InventoryPhotoRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Store a base64 photo directly in the database.

    TODO: In Session 6/7 swap this for Cloudflare R2 or Railway Volume object
    storage. For now base64 in Postgres is simple and sufficient for the demo
    team - photos are ~50-200KB each and we are storing single photos per item.
    """
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    photo = payload.photo_base64.strip()
    if not photo.startswith("data:image"):
        # Normalize to data URL so the frontend can drop it straight into an <img>
        photo = f"data:image/jpeg;base64,{photo}"

    # Sanity check: reject anything over ~3 MB encoded (roughly 2.2 MB raw)
    if len(photo) > 3_500_000:
        raise HTTPException(
            status_code=413,
            detail="Photo too large. Please resize to under 2 MB before uploading.",
        )

    item.photo_url = photo
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.get("/{item_id}/adjustments", response_model=list[InventoryAdjustmentOut])
def item_adjustments(
    item_id: int,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Audit history for one item, newest first."""
    stmt = (
        select(InventoryAdjustment)
        .where(InventoryAdjustment.item_id == item_id)
        .order_by(InventoryAdjustment.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
):
    """Only Boyd, Bintang, Erni can delete items."""
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
