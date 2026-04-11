"""inventory adjustments audit table

Revision ID: 0002_inventory_adjustments
Revises: 0001_initial
Create Date: 2026-04-10 14:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "0002_inventory_adjustments"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inventory_adjustments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "item_id",
            sa.Integer(),
            sa.ForeignKey("inventory_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("user_name", sa.String(255), nullable=False),
        sa.Column("old_quantity", sa.Float(), nullable=False),
        sa.Column("new_quantity", sa.Float(), nullable=False),
        sa.Column("delta", sa.Float(), nullable=False),
        sa.Column("reason", sa.String(32), server_default="correction"),
        sa.Column("note", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_inventory_adjustments_item_id",
        "inventory_adjustments",
        ["item_id"],
    )
    op.create_index(
        "ix_inventory_adjustments_created_at",
        "inventory_adjustments",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_inventory_adjustments_created_at", table_name="inventory_adjustments")
    op.drop_index("ix_inventory_adjustments_item_id", table_name="inventory_adjustments")
    op.drop_table("inventory_adjustments")
