from pydantic import BaseModel, Field
from datetime import datetime
from typing import Literal

RecipeGroup = Literal["A", "B"]
RecipeSection = Literal["MAKRO A", "MIKRO A", "MAKRO B", "MIKRO B"]


class RecipeIngredientBase(BaseModel):
    position: int = 0
    name: str
    group: RecipeGroup
    section: RecipeSection
    doses: dict[str, float] = Field(default_factory=dict)  # e.g. {"1": 172.28, "5": 861.4, ...}
    supplier: str = ""


class RecipeIngredientIn(RecipeIngredientBase):
    pass


class RecipeIngredientOut(RecipeIngredientBase):
    id: int

    class Config:
        from_attributes = True


class RecipeCommentOut(BaseModel):
    id: int
    author: str
    text: str
    created_at: datetime

    class Config:
        from_attributes = True


class RecipeCommentCreate(BaseModel):
    text: str


class RecipeBase(BaseModel):
    name_en: str
    name_id: str = ""
    crop_target_en: str
    crop_target_id: str = ""
    stage_en: str = ""
    stage_id: str = ""
    ec_target: float
    ph_target: float
    concentrates: list[int] = [1, 5, 25, 50]
    instructions_en: str = ""
    instructions_id: str = ""
    notes_en: str = ""
    notes_id: str = ""
    author: str = ""


class RecipeCreate(RecipeBase):
    ingredients: list[RecipeIngredientIn] = []


class RecipeUpdate(BaseModel):
    name_en: str | None = None
    name_id: str | None = None
    crop_target_en: str | None = None
    crop_target_id: str | None = None
    stage_en: str | None = None
    stage_id: str | None = None
    ec_target: float | None = None
    ph_target: float | None = None
    concentrates: list[int] | None = None
    instructions_en: str | None = None
    instructions_id: str | None = None
    notes_en: str | None = None
    notes_id: str | None = None
    author: str | None = None
    ingredients: list[RecipeIngredientIn] | None = None


class RecipeOut(RecipeBase):
    id: int
    locked: bool
    version: int
    created_at: datetime
    modified_at: datetime
    ingredients: list[RecipeIngredientOut]
    comments: list[RecipeCommentOut]

    class Config:
        from_attributes = True


class RecipeListItem(BaseModel):
    id: int
    name_en: str
    name_id: str
    crop_target_en: str
    crop_target_id: str
    stage_en: str
    stage_id: str
    ec_target: float
    ph_target: float
    author: str
    locked: bool
    version: int
    ingredient_count: int

    class Config:
        from_attributes = True
