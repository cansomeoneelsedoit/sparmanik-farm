from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, insert, delete

from app.database import get_db
from app.models import Task, task_assignees, User
from app.schemas.tasks import TaskCreate, TaskUpdate, TaskOut
from app.auth import get_current_user, require_owner

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _load_assignees(db: Session, task_id: int) -> list[str]:
    rows = db.execute(
        select(task_assignees.c.assignee_name).where(task_assignees.c.task_id == task_id)
    ).all()
    return [r[0] for r in rows]


def _to_out(db: Session, t: Task) -> TaskOut:
    return TaskOut(
        id=t.id,
        title=t.title,
        due_date=t.due_date,
        priority=t.priority,
        category=t.category or "",
        notes=t.notes or "",
        done=t.done,
        assignees=_load_assignees(db, t.id),
        created_at=t.created_at,
    )


def _set_assignees(db: Session, task_id: int, names: list[str]) -> None:
    db.execute(delete(task_assignees).where(task_assignees.c.task_id == task_id))
    for name in names:
        if name and name.strip():
            db.execute(
                insert(task_assignees).values(task_id=task_id, assignee_name=name.strip())
            )


@router.get("", response_model=list[TaskOut])
def list_tasks(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tasks = db.scalars(select(Task).order_by(Task.due_date)).all()
    return [_to_out(db, t) for t in tasks]


@router.post("", response_model=TaskOut)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not payload.assignees:
        raise HTTPException(status_code=400, detail="At least one assignee required")
    data = payload.model_dump(exclude={"assignees"})
    task = Task(**data)
    db.add(task)
    db.flush()
    _set_assignees(db, task.id, payload.assignees)
    db.commit()
    db.refresh(task)
    return _to_out(db, task)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    data = payload.model_dump(exclude_unset=True, exclude={"assignees"})
    for k, v in data.items():
        setattr(task, k, v)
    if payload.assignees is not None:
        _set_assignees(db, task.id, payload.assignees)
    db.commit()
    db.refresh(task)
    return _to_out(db, task)


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.execute(delete(task_assignees).where(task_assignees.c.task_id == task_id))
    db.delete(task)
    db.commit()
