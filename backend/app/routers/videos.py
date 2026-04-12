from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app.models import Video, User
from app.schemas.videos import VideoCreate, VideoOut
from app.auth import get_current_user, require_owner

router = APIRouter(prefix="/api/videos", tags=["videos"])


def _to_out(v: Video) -> VideoOut:
    return VideoOut(
        id=v.id,
        title=v.title,
        url=v.url,
        category=v.category or "General",
        subcategory=v.subcategory or "",
        notes=v.notes or "",
    )


@router.get("", response_model=list[VideoOut])
def list_videos(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.scalars(select(Video).order_by(Video.id.desc())).all()
    return [_to_out(v) for v in rows]


@router.post("", response_model=VideoOut)
def create_video(
    payload: VideoCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    v = Video(**payload.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return _to_out(v)


@router.patch("/{video_id}", response_model=VideoOut)
def update_video(
    video_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    v = db.get(Video, video_id)
    if not v:
        raise HTTPException(status_code=404, detail="Video not found")
    allowed = {"title", "url", "category", "subcategory", "notes"}
    for key, val in payload.items():
        if key in allowed:
            setattr(v, key, val)
    db.commit()
    db.refresh(v)
    return _to_out(v)


@router.delete("/{video_id}", status_code=204)
def delete_video(
    video_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
):
    v = db.get(Video, video_id)
    if not v:
        raise HTTPException(status_code=404, detail="Video not found")
    db.delete(v)
    db.commit()
