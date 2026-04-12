from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app.models import Supplier, Setting, User
from app.schemas.suppliers import SupplierCreate, SupplierOut, ShippingAddress
from app.auth import get_current_user, require_owner

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])

SHIPPING_KEY = "shipping_address"

DEFAULT_ADDRESS = {
    "name": "Bintang Damanik",
    "phone": "+62 812 6035 8989",
    "address": "Jl. Sangnaualuh No. 123",
    "city": "Pematang Siantar",
    "region": "Sumatera Utara",
    "postcode": "21134",
    "country": "Indonesia",
}


def _to_out(s: Supplier) -> SupplierOut:
    return SupplierOut(
        id=s.id,
        supplier_name=s.supplier_name,
        product_name=s.product_name,
        description=s.description or "",
        price=s.price,
        shipping_cost=s.shipping_cost,
        total_cost=s.total_cost,
        category=s.category,
        image_url=s.image_url or "",
        source_url=s.source_url or "",
        notes=s.notes or "",
        created_at=s.created_at,
    )


@router.get("", response_model=list[SupplierOut])
def list_suppliers(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.scalars(select(Supplier).order_by(Supplier.created_at.desc())).all()
    return [_to_out(s) for s in rows]


@router.post("", response_model=SupplierOut)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    total = (payload.price or 0) + (payload.shipping_cost or 0)
    s = Supplier(
        supplier_name=payload.supplier_name,
        product_name=payload.product_name,
        description=payload.description,
        price=payload.price,
        shipping_cost=payload.shipping_cost,
        total_cost=total,
        category=payload.category,
        image_url=payload.image_url,
        source_url=payload.source_url,
        notes=payload.notes,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _to_out(s)


@router.patch("/{supplier_id}", response_model=SupplierOut)
def update_supplier(
    supplier_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    allowed = {"supplier_name", "product_name", "description", "price", "shipping_cost", "total_cost", "category", "image_url", "source_url", "notes"}
    for key, val in payload.items():
        if key in allowed:
            setattr(s, key, val)
    db.commit()
    db.refresh(s)
    return _to_out(s)


@router.delete("/{supplier_id}", status_code=204)
def delete_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    db.delete(s)
    db.commit()


@router.get("/shipping-address", response_model=ShippingAddress)
def get_shipping_address(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(Setting, SHIPPING_KEY)
    if not row:
        return ShippingAddress(**DEFAULT_ADDRESS)
    return ShippingAddress(**row.value)


@router.put("/shipping-address", response_model=ShippingAddress)
def update_shipping_address(
    payload: ShippingAddress,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(Setting, SHIPPING_KEY)
    if not row:
        row = Setting(key=SHIPPING_KEY, value=payload.model_dump())
        db.add(row)
    else:
        row.value = payload.model_dump()
    db.commit()
    return payload
