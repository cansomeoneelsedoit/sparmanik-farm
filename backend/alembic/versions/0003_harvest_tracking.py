"""harvest tracking tables

Revision ID: 0003_harvest_tracking
Revises: 0002_inventory_adjustments
Create Date: 2026-04-12 14:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "0003_harvest_tracking"
down_revision = "0002_inventory_adjustments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "raw_materials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("unit", sa.String(50), server_default="kg"),
        sa.Column("category", sa.String(100), server_default=""),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "raw_purchases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("raw_material_id", sa.Integer(), sa.ForeignKey("raw_materials.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("supplier", sa.String(200), server_default=""),
        sa.Column("qty", sa.Float(), nullable=False),
        sa.Column("total_cost", sa.Float(), nullable=False),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "mixed_nutrients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("unit", sa.String(50), server_default="liter"),
        sa.Column("crop", sa.String(100), server_default=""),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "mixing_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("batch", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("raw_material_id", sa.Integer(), sa.ForeignKey("raw_materials.id", ondelete="CASCADE"), nullable=False),
        sa.Column("qty_used", sa.Float(), nullable=False),
        sa.Column("mixed_nutrient_id", sa.Integer(), sa.ForeignKey("mixed_nutrients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("qty_produced", sa.Float(), server_default="0"),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "harvest_usage",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("mixed_nutrient_id", sa.Integer(), sa.ForeignKey("mixed_nutrients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("qty_used", sa.Float(), nullable=False),
        sa.Column("harvest_name", sa.String(200), server_default="Melon Harvest 1"),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "parts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("unit", sa.String(50), server_default="pcs"),
        sa.Column("link", sa.Text(), server_default=""),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "part_purchases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("supplier", sa.String(200), server_default=""),
        sa.Column("qty", sa.Float(), nullable=False),
        sa.Column("total_cost", sa.Float(), nullable=False),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "part_usage",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("qty_used", sa.Float(), nullable=False),
        sa.Column("harvest_name", sa.String(200), server_default="Melon Harvest 1"),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "harvest_expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("harvest_name", sa.String(200), server_default="Melon Harvest 1"),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "harvest_income",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("harvest_name", sa.String(200), server_default="Melon Harvest 1"),
        sa.Column("buyer", sa.String(200), server_default=""),
        sa.Column("weight_kg", sa.Float(), nullable=False),
        sa.Column("price_per_kg", sa.Float(), nullable=False),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("harvest_income")
    op.drop_table("harvest_expenses")
    op.drop_table("part_usage")
    op.drop_table("part_purchases")
    op.drop_table("parts")
    op.drop_table("harvest_usage")
    op.drop_table("mixing_log")
    op.drop_table("mixed_nutrients")
    op.drop_table("raw_purchases")
    op.drop_table("raw_materials")
