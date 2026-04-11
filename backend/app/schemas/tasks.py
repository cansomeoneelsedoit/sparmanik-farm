from pydantic import BaseModel
from datetime import date as date_type, datetime


class TaskBase(BaseModel):
    title: str
    due_date: date_type
    priority: str = "medium"  # high, medium, low
    category: str = ""
    notes: str = ""
    done: bool = False
    assignees: list[str] = []


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = None
    due_date: date_type | None = None
    priority: str | None = None
    category: str | None = None
    notes: str | None = None
    done: bool | None = None
    assignees: list[str] | None = None


class TaskOut(TaskBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class TaskStats:
    overdue: int
    today_count: int
    upcoming: int
    completed: int
