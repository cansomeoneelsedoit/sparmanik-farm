"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-10 00:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), server_default="worker"),
        sa.Column("permissions", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("language", sa.String(8), server_default="en"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "sales",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("species", sa.String(64), nullable=False),
        sa.Column("grade", sa.String(8), nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=False),
        sa.Column("price_per_kg", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "staff_wages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(64)),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("hours", sa.Float(), nullable=False),
        sa.Column("hourly_rate", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_staff_wages_name", "staff_wages", ["name"])

    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("priority", sa.String(16), server_default="medium"),
        sa.Column("category", sa.String(64), server_default=""),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("done", sa.Boolean(), server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "task_assignees",
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("assignee_name", sa.String(255), primary_key=True),
    )

    op.create_table(
        "inventory_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("quantity", sa.Float(), server_default="0"),
        sa.Column("unit", sa.String(32), server_default="pcs"),
        sa.Column("reorder_level", sa.Float(), server_default="0"),
        sa.Column("location", sa.String(255), server_default=""),
        sa.Column("cost_per_unit", sa.Float(), server_default="0"),
        sa.Column("photo_url", sa.Text(), server_default=""),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_inventory_items_name", "inventory_items", ["name"])
    op.create_index("ix_inventory_items_category", "inventory_items", ["category"])

    op.create_table(
        "plantings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("variety", sa.String(128), nullable=False),
        sa.Column("planting_date", sa.Date(), nullable=False),
        sa.Column("harvest_estimate", sa.Date(), nullable=False),
        sa.Column("beds", sa.String(255), server_default=""),
        sa.Column("stage", sa.String(32), server_default="seed"),
        sa.Column("notes", sa.Text(), server_default=""),
    )

    op.create_table(
        "sops",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("title_key", sa.String(500)),
        sa.Column("category", sa.String(64)),
        sa.Column("description", sa.Text(), server_default=""),
        sa.Column("steps", sa.JSON(), server_default="[]"),
        sa.Column("safety_notes", sa.Text(), server_default=""),
        sa.Column("frequency", sa.String(128), server_default=""),
        sa.Column("image_url", sa.Text(), server_default=""),
        sa.Column("photos", sa.JSON(), server_default="[]"),
        sa.Column("version", sa.Integer(), server_default="1"),
        sa.Column("archived", sa.Boolean(), server_default=sa.false()),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_sops_title_key", "sops", ["title_key"])

    op.create_table(
        "videos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("category", sa.String(64)),
        sa.Column("subcategory", sa.String(64)),
        sa.Column("notes", sa.Text(), server_default=""),
    )

    op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("supplier_name", sa.String(255), nullable=False),
        sa.Column("product_name", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), server_default=""),
        sa.Column("price", sa.Float(), server_default="0"),
        sa.Column("shipping_cost", sa.Float(), server_default="0"),
        sa.Column("total_cost", sa.Float(), server_default="0"),
        sa.Column("category", sa.String(64)),
        sa.Column("image_url", sa.Text(), server_default=""),
        sa.Column("source_url", sa.Text(), server_default=""),
        sa.Column("notes", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_suppliers_category", "suppliers", ["category"])

    op.create_table(
        "accounting_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("type", sa.String(16), nullable=False),
        sa.Column("description", sa.String(500)),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("category", sa.String(128)),
        sa.Column("source", sa.String(32), server_default="manual"),
    )
    op.create_index("ix_accounting_entries_category", "accounting_entries", ["category"])

    op.create_table(
        "forecast_budgets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category", sa.String(128), nullable=False),
        sa.Column("budgeted", sa.Float(), nullable=False),
        sa.Column("period", sa.String(16)),
    )

    op.create_table(
        "recipes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name_en", sa.String(500), nullable=False),
        sa.Column("name_id", sa.String(500), server_default=""),
        sa.Column("crop_target_en", sa.String(128), nullable=False),
        sa.Column("crop_target_id", sa.String(128), server_default=""),
        sa.Column("stage_en", sa.String(64)),
        sa.Column("stage_id", sa.String(64), server_default=""),
        sa.Column("ec_target", sa.Float(), nullable=False),
        sa.Column("ph_target", sa.Float(), nullable=False),
        sa.Column("concentrates", sa.JSON(), server_default="[1, 5, 25, 50]"),
        sa.Column("instructions_en", sa.Text(), server_default=""),
        sa.Column("instructions_id", sa.Text(), server_default=""),
        sa.Column("notes_en", sa.Text(), server_default=""),
        sa.Column("notes_id", sa.Text(), server_default=""),
        sa.Column("author", sa.String(255), server_default=""),
        sa.Column("locked", sa.Boolean(), server_default=sa.false()),
        sa.Column("version", sa.Integer(), server_default="1"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("modified_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "recipe_ingredients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("recipe_id", sa.Integer(), sa.ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("group", sa.String(4), nullable=False),
        sa.Column("section", sa.String(32), nullable=False),
        sa.Column("doses", sa.JSON(), server_default="{}"),
        sa.Column("supplier", sa.String(500), server_default=""),
    )

    op.create_table(
        "recipe_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("recipe_id", sa.Integer(), sa.ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author", sa.String(255), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "settings",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", sa.JSON(), server_default="{}"),
    )


def downgrade() -> None:
    op.drop_table("settings")
    op.drop_table("recipe_comments")
    op.drop_table("recipe_ingredients")
    op.drop_table("recipes")
    op.drop_table("forecast_budgets")
    op.drop_index("ix_accounting_entries_category", table_name="accounting_entries")
    op.drop_table("accounting_entries")
    op.drop_index("ix_suppliers_category", table_name="suppliers")
    op.drop_table("suppliers")
    op.drop_table("videos")
    op.drop_index("ix_sops_title_key", table_name="sops")
    op.drop_table("sops")
    op.drop_table("plantings")
    op.drop_index("ix_inventory_items_category", table_name="inventory_items")
    op.drop_index("ix_inventory_items_name", table_name="inventory_items")
    op.drop_table("inventory_items")
    op.drop_table("task_assignees")
    op.drop_table("tasks")
    op.drop_index("ix_staff_wages_name", table_name="staff_wages")
    op.drop_table("staff_wages")
    op.drop_table("sales")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
