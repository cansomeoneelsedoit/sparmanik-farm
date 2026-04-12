from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from typing import Optional

from app.database import get_db
from app.models import (
    RawMaterial, RawPurchase, MixedNutrient, MixingLog, HarvestUsage,
    Part, PartPurchase, PartUsage, HarvestExpense, HarvestIncome, User
)
from app.auth import get_current_user

router = APIRouter(prefix="/api/harvest", tags=["harvest"])


# ============================================================
# RAW MATERIALS
# ============================================================

class RawMaterialOut:
    def __init__(self, obj: RawMaterial, total_purchased: float, total_used: float):
        self.id = obj.id
        self.name = obj.name
        self.unit = obj.unit
        self.category = obj.category
        self.notes = obj.notes
        self.created_at = obj.created_at
        self.total_purchased = total_purchased
        self.total_used = total_used
        self.stock_on_hand = total_purchased - total_used


def _raw_material_to_out(obj: RawMaterial, db: Session) -> dict:
    # total_purchased from raw_purchases
    total_purchased = db.scalar(
        select(func.sum(RawPurchase.qty)).where(RawPurchase.raw_material_id == obj.id)
    ) or 0.0

    # total_used from mixing_log
    total_used = db.scalar(
        select(func.sum(MixingLog.qty_used)).where(MixingLog.raw_material_id == obj.id)
    ) or 0.0

    return {
        "id": obj.id,
        "name": obj.name,
        "unit": obj.unit,
        "category": obj.category,
        "notes": obj.notes,
        "created_at": obj.created_at,
        "total_purchased": total_purchased,
        "total_used": total_used,
        "stock_on_hand": total_purchased - total_used,
    }


@router.get("/raw-materials")
def list_raw_materials(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    materials = db.scalars(select(RawMaterial).order_by(RawMaterial.created_at.desc())).all()
    return [_raw_material_to_out(m, db) for m in materials]


@router.post("/raw-materials")
def create_raw_material(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    material = RawMaterial(
        name=payload.get("name"),
        unit=payload.get("unit", "kg"),
        category=payload.get("category", ""),
        notes=payload.get("notes", ""),
    )
    db.add(material)
    db.commit()
    db.refresh(material)
    return _raw_material_to_out(material, db)


@router.patch("/raw-materials/{material_id}")
def update_raw_material(
    material_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    material = db.get(RawMaterial, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Raw material not found")
    allowed = {"name", "unit", "category", "notes"}
    for key, val in payload.items():
        if key in allowed:
            setattr(material, key, val)
    db.commit()
    db.refresh(material)
    return _raw_material_to_out(material, db)


@router.delete("/raw-materials/{material_id}", status_code=204)
def delete_raw_material(
    material_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    material = db.get(RawMaterial, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Raw material not found")
    db.delete(material)
    db.commit()


# ============================================================
# RAW PURCHASES
# ============================================================

def _raw_purchase_to_out(obj: RawPurchase, db: Session) -> dict:
    material = db.get(RawMaterial, obj.raw_material_id)
    material_name = material.name if material else ""
    return {
        "id": obj.id,
        "raw_material_id": obj.raw_material_id,
        "raw_material_name": material_name,
        "date": obj.date,
        "supplier": obj.supplier,
        "qty": obj.qty,
        "total_cost": obj.total_cost,
        "notes": obj.notes,
        "created_at": obj.created_at,
    }


@router.get("/raw-purchases")
def list_raw_purchases(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    purchases = db.scalars(select(RawPurchase).order_by(RawPurchase.date.desc())).all()
    return [_raw_purchase_to_out(p, db) for p in purchases]


@router.post("/raw-purchases")
def create_raw_purchase(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    purchase = RawPurchase(
        raw_material_id=payload.get("raw_material_id"),
        date=payload.get("date"),
        supplier=payload.get("supplier", ""),
        qty=payload.get("qty"),
        total_cost=payload.get("total_cost"),
        notes=payload.get("notes", ""),
    )
    db.add(purchase)
    db.commit()
    db.refresh(purchase)
    return _raw_purchase_to_out(purchase, db)


@router.delete("/raw-purchases/{purchase_id}", status_code=204)
def delete_raw_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    purchase = db.get(RawPurchase, purchase_id)
    if not purchase:
        raise HTTPException(status_code=404, detail="Raw purchase not found")
    db.delete(purchase)
    db.commit()


# ============================================================
# MIXED NUTRIENTS
# ============================================================

def _mixed_nutrient_to_out(obj: MixedNutrient, db: Session) -> dict:
    # total_produced from mixing_log
    total_produced = db.scalar(
        select(func.sum(MixingLog.qty_produced)).where(MixingLog.mixed_nutrient_id == obj.id)
    ) or 0.0

    # total_used from harvest_usage
    total_used = db.scalar(
        select(func.sum(HarvestUsage.qty_used)).where(HarvestUsage.mixed_nutrient_id == obj.id)
    ) or 0.0

    return {
        "id": obj.id,
        "name": obj.name,
        "unit": obj.unit,
        "crop": obj.crop,
        "notes": obj.notes,
        "created_at": obj.created_at,
        "total_produced": total_produced,
        "total_used": total_used,
        "stock_on_hand": total_produced - total_used,
    }


@router.get("/mixed-nutrients")
def list_mixed_nutrients(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    nutrients = db.scalars(select(MixedNutrient).order_by(MixedNutrient.created_at.desc())).all()
    return [_mixed_nutrient_to_out(n, db) for n in nutrients]


@router.post("/mixed-nutrients")
def create_mixed_nutrient(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    nutrient = MixedNutrient(
        name=payload.get("name"),
        unit=payload.get("unit", "liter"),
        crop=payload.get("crop", ""),
        notes=payload.get("notes", ""),
    )
    db.add(nutrient)
    db.commit()
    db.refresh(nutrient)
    return _mixed_nutrient_to_out(nutrient, db)


@router.patch("/mixed-nutrients/{nutrient_id}")
def update_mixed_nutrient(
    nutrient_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    nutrient = db.get(MixedNutrient, nutrient_id)
    if not nutrient:
        raise HTTPException(status_code=404, detail="Mixed nutrient not found")
    allowed = {"name", "unit", "crop", "notes"}
    for key, val in payload.items():
        if key in allowed:
            setattr(nutrient, key, val)
    db.commit()
    db.refresh(nutrient)
    return _mixed_nutrient_to_out(nutrient, db)


@router.delete("/mixed-nutrients/{nutrient_id}", status_code=204)
def delete_mixed_nutrient(
    nutrient_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    nutrient = db.get(MixedNutrient, nutrient_id)
    if not nutrient:
        raise HTTPException(status_code=404, detail="Mixed nutrient not found")
    db.delete(nutrient)
    db.commit()


# ============================================================
# MIXING LOG
# ============================================================

def _mixing_log_to_out(obj: MixingLog, db: Session) -> dict:
    raw_material = db.get(RawMaterial, obj.raw_material_id)
    nutrient = db.get(MixedNutrient, obj.mixed_nutrient_id)
    return {
        "id": obj.id,
        "batch": obj.batch,
        "date": obj.date,
        "raw_material_id": obj.raw_material_id,
        "raw_material_name": raw_material.name if raw_material else "",
        "qty_used": obj.qty_used,
        "mixed_nutrient_id": obj.mixed_nutrient_id,
        "mixed_nutrient_name": nutrient.name if nutrient else "",
        "qty_produced": obj.qty_produced,
        "notes": obj.notes,
        "created_at": obj.created_at,
    }


@router.get("/mixing-log")
def list_mixing_log(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    logs = db.scalars(select(MixingLog).order_by(MixingLog.date.desc())).all()
    return [_mixing_log_to_out(log, db) for log in logs]


@router.post("/mixing-log")
def create_mixing_log(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    log = MixingLog(
        batch=payload.get("batch"),
        date=payload.get("date"),
        raw_material_id=payload.get("raw_material_id"),
        qty_used=payload.get("qty_used"),
        mixed_nutrient_id=payload.get("mixed_nutrient_id"),
        qty_produced=payload.get("qty_produced", 0),
        notes=payload.get("notes", ""),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return _mixing_log_to_out(log, db)


@router.delete("/mixing-log/{log_id}", status_code=204)
def delete_mixing_log(
    log_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    log = db.get(MixingLog, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Mixing log not found")
    db.delete(log)
    db.commit()


# ============================================================
# HARVEST USAGE
# ============================================================

def _harvest_usage_to_out(obj: HarvestUsage, db: Session) -> dict:
    nutrient = db.get(MixedNutrient, obj.mixed_nutrient_id)
    return {
        "id": obj.id,
        "date": obj.date,
        "mixed_nutrient_id": obj.mixed_nutrient_id,
        "mixed_nutrient_name": nutrient.name if nutrient else "",
        "qty_used": obj.qty_used,
        "harvest_name": obj.harvest_name,
        "notes": obj.notes,
        "created_at": obj.created_at,
    }


@router.get("/harvest-usage")
def list_harvest_usage(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    usages = db.scalars(select(HarvestUsage).order_by(HarvestUsage.date.desc())).all()
    return [_harvest_usage_to_out(u, db) for u in usages]


@router.post("/harvest-usage")
def create_harvest_usage(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    usage = HarvestUsage(
        date=payload.get("date"),
        mixed_nutrient_id=payload.get("mixed_nutrient_id"),
        qty_used=payload.get("qty_used"),
        harvest_name=payload.get("harvest_name", "Melon Harvest 1"),
        notes=payload.get("notes", ""),
    )
    db.add(usage)
    db.commit()
    db.refresh(usage)
    return _harvest_usage_to_out(usage, db)


@router.delete("/harvest-usage/{usage_id}", status_code=204)
def delete_harvest_usage(
    usage_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    usage = db.get(HarvestUsage, usage_id)
    if not usage:
        raise HTTPException(status_code=404, detail="Harvest usage not found")
    db.delete(usage)
    db.commit()


# ============================================================
# PARTS
# ============================================================

def _part_to_out(obj: Part, db: Session) -> dict:
    # total_purchased from part_purchases
    total_purchased = db.scalar(
        select(func.sum(PartPurchase.qty)).where(PartPurchase.part_id == obj.id)
    ) or 0.0

    # total_assigned from part_usage
    total_assigned = db.scalar(
        select(func.sum(PartUsage.qty_used)).where(PartUsage.part_id == obj.id)
    ) or 0.0

    return {
        "id": obj.id,
        "name": obj.name,
        "unit": obj.unit,
        "link": obj.link,
        "notes": obj.notes,
        "created_at": obj.created_at,
        "total_purchased": total_purchased,
        "total_assigned": total_assigned,
        "on_shelf": total_purchased - total_assigned,
    }


@router.get("/parts")
def list_parts(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    parts = db.scalars(select(Part).order_by(Part.created_at.desc())).all()
    return [_part_to_out(p, db) for p in parts]


@router.post("/parts")
def create_part(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    part = Part(
        name=payload.get("name"),
        unit=payload.get("unit", "pcs"),
        link=payload.get("link", ""),
        notes=payload.get("notes", ""),
    )
    db.add(part)
    db.commit()
    db.refresh(part)
    return _part_to_out(part, db)


@router.patch("/parts/{part_id}")
def update_part(
    part_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    part = db.get(Part, part_id)
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    allowed = {"name", "unit", "link", "notes"}
    for key, val in payload.items():
        if key in allowed:
            setattr(part, key, val)
    db.commit()
    db.refresh(part)
    return _part_to_out(part, db)


@router.delete("/parts/{part_id}", status_code=204)
def delete_part(
    part_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    part = db.get(Part, part_id)
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    db.delete(part)
    db.commit()


# ============================================================
# PART PURCHASES
# ============================================================

def _part_purchase_to_out(obj: PartPurchase, db: Session) -> dict:
    part = db.get(Part, obj.part_id)
    return {
        "id": obj.id,
        "part_id": obj.part_id,
        "part_name": part.name if part else "",
        "date": obj.date,
        "supplier": obj.supplier,
        "qty": obj.qty,
        "total_cost": obj.total_cost,
        "notes": obj.notes,
        "created_at": obj.created_at,
    }


@router.get("/part-purchases")
def list_part_purchases(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    purchases = db.scalars(select(PartPurchase).order_by(PartPurchase.date.desc())).all()
    return [_part_purchase_to_out(p, db) for p in purchases]


@router.post("/part-purchases")
def create_part_purchase(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    purchase = PartPurchase(
        part_id=payload.get("part_id"),
        date=payload.get("date"),
        supplier=payload.get("supplier", ""),
        qty=payload.get("qty"),
        total_cost=payload.get("total_cost"),
        notes=payload.get("notes", ""),
    )
    db.add(purchase)
    db.commit()
    db.refresh(purchase)
    return _part_purchase_to_out(purchase, db)


@router.delete("/part-purchases/{purchase_id}", status_code=204)
def delete_part_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    purchase = db.get(PartPurchase, purchase_id)
    if not purchase:
        raise HTTPException(status_code=404, detail="Part purchase not found")
    db.delete(purchase)
    db.commit()


# ============================================================
# PART USAGE
# ============================================================

def _part_usage_to_out(obj: PartUsage, db: Session) -> dict:
    part = db.get(Part, obj.part_id)
    return {
        "id": obj.id,
        "date": obj.date,
        "part_id": obj.part_id,
        "part_name": part.name if part else "",
        "qty_used": obj.qty_used,
        "harvest_name": obj.harvest_name,
        "notes": obj.notes,
        "created_at": obj.created_at,
    }


@router.get("/part-usage")
def list_part_usage(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    usages = db.scalars(select(PartUsage).order_by(PartUsage.date.desc())).all()
    return [_part_usage_to_out(u, db) for u in usages]


@router.post("/part-usage")
def create_part_usage(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    usage = PartUsage(
        date=payload.get("date"),
        part_id=payload.get("part_id"),
        qty_used=payload.get("qty_used"),
        harvest_name=payload.get("harvest_name", "Melon Harvest 1"),
        notes=payload.get("notes", ""),
    )
    db.add(usage)
    db.commit()
    db.refresh(usage)
    return _part_usage_to_out(usage, db)


@router.delete("/part-usage/{usage_id}", status_code=204)
def delete_part_usage(
    usage_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    usage = db.get(PartUsage, usage_id)
    if not usage:
        raise HTTPException(status_code=404, detail="Part usage not found")
    db.delete(usage)
    db.commit()


# ============================================================
# HARVEST EXPENSES
# ============================================================

def _harvest_expense_to_out(obj: HarvestExpense) -> dict:
    return {
        "id": obj.id,
        "date": obj.date,
        "harvest_name": obj.harvest_name,
        "category": obj.category,
        "description": obj.description,
        "amount": obj.amount,
        "notes": obj.notes,
        "created_at": obj.created_at,
    }


@router.get("/expenses")
def list_harvest_expenses(
    harvest_name: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(HarvestExpense).order_by(HarvestExpense.date.desc())
    if harvest_name:
        stmt = stmt.where(HarvestExpense.harvest_name == harvest_name)
    expenses = db.scalars(stmt).all()
    return [_harvest_expense_to_out(e) for e in expenses]


@router.post("/expenses")
def create_harvest_expense(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    expense = HarvestExpense(
        date=payload.get("date"),
        harvest_name=payload.get("harvest_name", "Melon Harvest 1"),
        category=payload.get("category"),
        description=payload.get("description"),
        amount=payload.get("amount"),
        notes=payload.get("notes", ""),
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return _harvest_expense_to_out(expense)


@router.patch("/expenses/{expense_id}")
def update_harvest_expense(
    expense_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    expense = db.get(HarvestExpense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    allowed = {"date", "harvest_name", "category", "description", "amount", "notes"}
    for key, val in payload.items():
        if key in allowed:
            setattr(expense, key, val)
    db.commit()
    db.refresh(expense)
    return _harvest_expense_to_out(expense)


@router.delete("/expenses/{expense_id}", status_code=204)
def delete_harvest_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    expense = db.get(HarvestExpense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(expense)
    db.commit()


# ============================================================
# HARVEST INCOME
# ============================================================

def _harvest_income_to_out(obj: HarvestIncome) -> dict:
    total_revenue = obj.weight_kg * obj.price_per_kg
    return {
        "id": obj.id,
        "date": obj.date,
        "harvest_name": obj.harvest_name,
        "buyer": obj.buyer,
        "weight_kg": obj.weight_kg,
        "price_per_kg": obj.price_per_kg,
        "total_revenue": total_revenue,
        "notes": obj.notes,
        "created_at": obj.created_at,
    }


@router.get("/income")
def list_harvest_income(
    harvest_name: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(HarvestIncome).order_by(HarvestIncome.date.desc())
    if harvest_name:
        stmt = stmt.where(HarvestIncome.harvest_name == harvest_name)
    income = db.scalars(stmt).all()
    return [_harvest_income_to_out(i) for i in income]


@router.post("/income")
def create_harvest_income(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    income = HarvestIncome(
        date=payload.get("date"),
        harvest_name=payload.get("harvest_name", "Melon Harvest 1"),
        buyer=payload.get("buyer", ""),
        weight_kg=payload.get("weight_kg"),
        price_per_kg=payload.get("price_per_kg"),
        notes=payload.get("notes", ""),
    )
    db.add(income)
    db.commit()
    db.refresh(income)
    return _harvest_income_to_out(income)


@router.patch("/income/{income_id}")
def update_harvest_income(
    income_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    income = db.get(HarvestIncome, income_id)
    if not income:
        raise HTTPException(status_code=404, detail="Income not found")
    allowed = {"date", "harvest_name", "buyer", "weight_kg", "price_per_kg", "notes"}
    for key, val in payload.items():
        if key in allowed:
            setattr(income, key, val)
    db.commit()
    db.refresh(income)
    return _harvest_income_to_out(income)


@router.delete("/income/{income_id}", status_code=204)
def delete_harvest_income(
    income_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    income = db.get(HarvestIncome, income_id)
    if not income:
        raise HTTPException(status_code=404, detail="Income not found")
    db.delete(income)
    db.commit()


# ============================================================
# HARVEST SUMMARY (P&L)
# ============================================================

@router.get("/summary")
def harvest_summary(
    harvest_name: str = Query("Melon Harvest 1"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get P&L summary for a specific harvest"""
    # Total parts cost
    part_costs = db.scalars(
        select(PartPurchase.total_cost).join(
            PartUsage, PartUsage.part_id == PartPurchase.part_id
        ).where(PartUsage.harvest_name == harvest_name)
    ).all()
    total_parts_cost = sum(part_costs) if part_costs else 0.0

    # Total nutrient cost (from raw purchases used in mixing)
    raw_costs = db.scalars(
        select(RawPurchase.total_cost).join(
            MixingLog, MixingLog.raw_material_id == RawPurchase.raw_material_id
        ).join(
            HarvestUsage, HarvestUsage.mixed_nutrient_id == MixingLog.mixed_nutrient_id
        ).where(HarvestUsage.harvest_name == harvest_name)
    ).all()
    total_nutrient_cost = sum(raw_costs) if raw_costs else 0.0

    # Total expenses
    total_expenses = db.scalar(
        select(func.sum(HarvestExpense.amount)).where(
            HarvestExpense.harvest_name == harvest_name
        )
    ) or 0.0

    # Total income
    total_income = db.scalar(
        select(func.sum(HarvestIncome.weight_kg * HarvestIncome.price_per_kg)).where(
            HarvestIncome.harvest_name == harvest_name
        )
    ) or 0.0

    total_cost = total_parts_cost + total_nutrient_cost + total_expenses
    net_profit = total_income - total_cost

    return {
        "harvest_name": harvest_name,
        "total_parts_cost": total_parts_cost,
        "total_nutrient_cost": total_nutrient_cost,
        "total_expenses": total_expenses,
        "total_cost": total_cost,
        "total_income": total_income,
        "net_profit": net_profit,
    }
