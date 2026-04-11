from pydantic import BaseModel
from datetime import date as date_type


class PlantingBase(BaseModel):
    variety: str
    planting_date: date_type
    harvest_estimate: date_type
    beds: str = ""
    stage: str = "seed"  # seed, veg, flower, fruit, harvest
    notes: str = ""


class PlantingCreate(PlantingBase):
    pass


class PlantingUpdate(BaseModel):
    variety: str | None = None
    planting_date: date_type | None = None
    harvest_estimate: date_type | None = None
    beds: str | None = None
    stage: str | None = None
    notes: str | None = None


class PlantingOut(PlantingBase):
    id: int
    days_to_harvest: int

    class Config:
        from_attributes = True
