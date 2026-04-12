"""
All SQLAlchemy models. Mirrors the data shapes from the HTML demo
but normalized: join tables instead of nested JSON, foreign keys, timestamps.
"""
from datetime import datetime, date
from sqlalchemy import (
    String, Integer, Float, Boolean, DateTime, Date, ForeignKey, Text, JSON, Table, Column, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


# ============================================================
# USERS & AUTH
# ============================================================
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="worker")  # superuser, admin, worker, viewer
    permissions: Mapped[list] = mapped_column(JSON, default=list)  # list of module keys, or ["*"]
    language: Mapped[str] = mapped_column(String(8), default="en")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ============================================================
# SALES
# ============================================================
class Sale(Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[datetime] = mapped_column(Date, nullable=False)
    week: Mapped[int] = mapped_column(Integer, nullable=False)
    species: Mapped[str] = mapped_column(String(64), nullable=False)
    grade: Mapped[str] = mapped_column(String(8), nullable=False)  # A, B, C
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    price_per_kg: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ============================================================
# STAFF WAGES
# ============================================================
class StaffWage(Base):
    __tablename__ = "staff_wages"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(64))
    week: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[datetime] = mapped_column(Date, nullable=False)
    hours: Mapped[float] = mapped_column(Float, nullable=False)
    hourly_rate: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ============================================================
# TASKS with multi-assign
# ============================================================
task_assignees = Table(
    "task_assignees",
    Base.metadata,
    Column("task_id", ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("assignee_name", String(255), primary_key=True),
)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    due_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    priority: Mapped[str] = mapped_column(String(16), default="medium")  # high, medium, low
    category: Mapped[str] = mapped_column(String(64), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # assignees stored as simple strings in the join table; can FK to users later


# ============================================================
# INVENTORY
# ============================================================
class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(Float, default=0)
    unit: Mapped[str] = mapped_column(String(32), default="pcs")
    reorder_level: Mapped[float] = mapped_column(Float, default=0)
    location: Mapped[str] = mapped_column(String(255), default="")
    cost_per_unit: Mapped[float] = mapped_column(Float, default=0)
    photo_url: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    adjustments: Mapped[list["InventoryAdjustment"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", order_by="InventoryAdjustment.created_at.desc()"
    )


class InventoryAdjustment(Base):
    __tablename__ = "inventory_adjustments"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("inventory_items.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    user_name: Mapped[str] = mapped_column(String(255))  # denormalized for history even if user deleted
    old_quantity: Mapped[float] = mapped_column(Float, nullable=False)
    new_quantity: Mapped[float] = mapped_column(Float, nullable=False)
    delta: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[str] = mapped_column(String(32), default="correction")  # stock_take, used, wastage, received, correction
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    item: Mapped["InventoryItem"] = relationship(back_populates="adjustments")


# ============================================================
# PLANTINGS
# ============================================================
class Planting(Base):
    __tablename__ = "plantings"

    id: Mapped[int] = mapped_column(primary_key=True)
    variety: Mapped[str] = mapped_column(String(128), nullable=False)
    planting_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    harvest_estimate: Mapped[datetime] = mapped_column(Date, nullable=False)
    beds: Mapped[str] = mapped_column(String(255), default="")
    stage: Mapped[str] = mapped_column(String(32), default="seed")
    notes: Mapped[str] = mapped_column(Text, default="")


# ============================================================
# SOPs with versioning
# ============================================================
class Sop(Base):
    __tablename__ = "sops"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    title_key: Mapped[str] = mapped_column(String(500), index=True)  # slug for version grouping
    category: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(Text, default="")
    steps: Mapped[list] = mapped_column(JSON, default=list)
    safety_notes: Mapped[str] = mapped_column(Text, default="")
    frequency: Mapped[str] = mapped_column(String(128), default="")
    image_url: Mapped[str] = mapped_column(Text, default="")
    photos: Mapped[list] = mapped_column(JSON, default=list)
    version: Mapped[int] = mapped_column(Integer, default=1)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ============================================================
# VIDEOS
# ============================================================
class Video(Base):
    __tablename__ = "videos"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(64))  # Melons, Chillis, General
    subcategory: Mapped[str] = mapped_column(String(64))  # Seeding, Flowering, etc.
    notes: Mapped[str] = mapped_column(Text, default="")


# ============================================================
# SUPPLIERS
# ============================================================
class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    price: Mapped[float] = mapped_column(Float, default=0)
    shipping_cost: Mapped[float] = mapped_column(Float, default=0)
    total_cost: Mapped[float] = mapped_column(Float, default=0)
    category: Mapped[str] = mapped_column(String(64), index=True)
    image_url: Mapped[str] = mapped_column(Text, default="")
    source_url: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ============================================================
# ACCOUNTING & FORECAST
# ============================================================
class AccountingEntry(Base):
    __tablename__ = "accounting_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[datetime] = mapped_column(Date, nullable=False)
    type: Mapped[str] = mapped_column(String(16), nullable=False)  # income, expense
    description: Mapped[str] = mapped_column(String(500))
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[str] = mapped_column(String(128), index=True)
    source: Mapped[str] = mapped_column(String(32), default="manual")  # manual, auto


class ForecastBudget(Base):
    __tablename__ = "forecast_budgets"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(128), nullable=False)
    budgeted: Mapped[float] = mapped_column(Float, nullable=False)
    period: Mapped[str] = mapped_column(String(16))  # YYYY-MM


# ============================================================
# RECIPES (Kevin Medan table format)
# ============================================================
class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name_en: Mapped[str] = mapped_column(String(500), nullable=False)
    name_id: Mapped[str] = mapped_column(String(500), default="")
    crop_target_en: Mapped[str] = mapped_column(String(128), nullable=False)
    crop_target_id: Mapped[str] = mapped_column(String(128), default="")
    stage_en: Mapped[str] = mapped_column(String(64))
    stage_id: Mapped[str] = mapped_column(String(64), default="")
    ec_target: Mapped[float] = mapped_column(Float, nullable=False)
    ph_target: Mapped[float] = mapped_column(Float, nullable=False)
    concentrates: Mapped[list] = mapped_column(JSON, default=lambda: [1, 5, 25, 50])
    instructions_en: Mapped[str] = mapped_column(Text, default="")
    instructions_id: Mapped[str] = mapped_column(Text, default="")
    notes_en: Mapped[str] = mapped_column(Text, default="")
    notes_id: Mapped[str] = mapped_column(Text, default="")
    author: Mapped[str] = mapped_column(String(255), default="")
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    modified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        back_populates="recipe", cascade="all, delete-orphan", order_by="RecipeIngredient.position"
    )
    comments: Mapped[list["RecipeComment"]] = relationship(
        back_populates="recipe", cascade="all, delete-orphan", order_by="RecipeComment.created_at"
    )


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)  # for row ordering
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    group: Mapped[str] = mapped_column(String(4), nullable=False)  # A or B
    section: Mapped[str] = mapped_column(String(32), nullable=False)  # MAKRO A / MIKRO A / etc.
    doses: Mapped[dict] = mapped_column(JSON, default=dict)  # {"1": 172.28, "5": 861.4, ...}
    supplier: Mapped[str] = mapped_column(String(500), default="")

    recipe: Mapped["Recipe"] = relationship(back_populates="ingredients")


class RecipeComment(Base):
    __tablename__ = "recipe_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"))
    author: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    recipe: Mapped["Recipe"] = relationship(back_populates="comments")


# ============================================================
# SETTINGS (singleton-ish)
# ============================================================
class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)


# ============================================================
# HARVEST TRACKING
# ============================================================
class RawMaterial(Base):
    """Master list of raw chemicals/ingredients"""
    __tablename__ = "raw_materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    unit: Mapped[str] = mapped_column(String(50), default="kg")
    category: Mapped[str] = mapped_column(String(100), default="")  # e.g. "Nutrient A base", "pH"
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class RawPurchase(Base):
    """Purchase log for raw materials"""
    __tablename__ = "raw_purchases"

    id: Mapped[int] = mapped_column(primary_key=True)
    raw_material_id: Mapped[int] = mapped_column(ForeignKey("raw_materials.id"))
    date: Mapped[date] = mapped_column(Date)
    supplier: Mapped[str] = mapped_column(String(200), default="")
    qty: Mapped[float] = mapped_column(Float)
    total_cost: Mapped[float] = mapped_column(Float)  # IDR
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class MixedNutrient(Base):
    """Mixed nutrient products (Nutrient A Melon, B Chilli, etc.)"""
    __tablename__ = "mixed_nutrients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))  # e.g. "Nutrient A Melon"
    unit: Mapped[str] = mapped_column(String(50), default="liter")
    crop: Mapped[str] = mapped_column(String(100), default="")  # e.g. "Melon", "Chilli"
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class MixingLog(Base):
    """Log of raw ingredients consumed when mixing a batch"""
    __tablename__ = "mixing_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch: Mapped[int] = mapped_column(Integer)  # batch number
    date: Mapped[date] = mapped_column(Date)
    raw_material_id: Mapped[int] = mapped_column(ForeignKey("raw_materials.id"))
    qty_used: Mapped[float] = mapped_column(Float)  # qty of raw used
    mixed_nutrient_id: Mapped[int] = mapped_column(ForeignKey("mixed_nutrients.id"))
    qty_produced: Mapped[float] = mapped_column(Float, default=0)  # only on first row of batch
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class HarvestUsage(Base):
    """Log of mixed nutrients used on a specific harvest"""
    __tablename__ = "harvest_usage"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date)
    mixed_nutrient_id: Mapped[int] = mapped_column(ForeignKey("mixed_nutrients.id"))
    qty_used: Mapped[float] = mapped_column(Float)
    harvest_name: Mapped[str] = mapped_column(String(200), default="Melon Harvest 1")  # which harvest
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Part(Base):
    """Master list of parts/equipment"""
    __tablename__ = "parts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    unit: Mapped[str] = mapped_column(String(50), default="pcs")
    link: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class PartPurchase(Base):
    """Purchase log for parts"""
    __tablename__ = "part_purchases"

    id: Mapped[int] = mapped_column(primary_key=True)
    part_id: Mapped[int] = mapped_column(ForeignKey("parts.id"))
    date: Mapped[date] = mapped_column(Date)
    supplier: Mapped[str] = mapped_column(String(200), default="")
    qty: Mapped[float] = mapped_column(Float)
    total_cost: Mapped[float] = mapped_column(Float)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class PartUsage(Base):
    """Parts assigned to a specific harvest"""
    __tablename__ = "part_usage"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date)
    part_id: Mapped[int] = mapped_column(ForeignKey("parts.id"))
    qty_used: Mapped[float] = mapped_column(Float)
    harvest_name: Mapped[str] = mapped_column(String(200), default="Melon Harvest 1")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class HarvestExpense(Base):
    """Running costs for a harvest (labour, utilities, etc.)"""
    __tablename__ = "harvest_expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date)
    harvest_name: Mapped[str] = mapped_column(String(200), default="Melon Harvest 1")
    category: Mapped[str] = mapped_column(String(100))  # Labour, Utilities, Pest Prevention, etc.
    description: Mapped[str] = mapped_column(String(500))
    amount: Mapped[float] = mapped_column(Float)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class HarvestIncome(Base):
    """Income from harvest sales"""
    __tablename__ = "harvest_income"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date)
    harvest_name: Mapped[str] = mapped_column(String(200), default="Melon Harvest 1")
    buyer: Mapped[str] = mapped_column(String(200), default="")
    weight_kg: Mapped[float] = mapped_column(Float)
    price_per_kg: Mapped[float] = mapped_column(Float)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
