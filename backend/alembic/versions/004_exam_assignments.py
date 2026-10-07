"""exam assignments: candidate ↔ exam allocation

Revision ID: 004_exam_assignments
Revises: 003_institutional_layer
Create Date: 2026-10-05
"""

import sqlalchemy as sa
from alembic import op

revision = "004_exam_assignments"
down_revision = "003_institutional_layer"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "exam_assignments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("exam_id", sa.String(36), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("platform_users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("exam_id", "user_id", name="uq_exam_user"),
    )


def downgrade() -> None:
    op.drop_table("exam_assignments")
