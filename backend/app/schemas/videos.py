from pydantic import BaseModel


class VideoBase(BaseModel):
    title: str
    url: str
    category: str
    subcategory: str = ""
    notes: str = ""


class VideoCreate(VideoBase):
    pass


class VideoOut(VideoBase):
    id: int

    class Config:
        from_attributes = True
