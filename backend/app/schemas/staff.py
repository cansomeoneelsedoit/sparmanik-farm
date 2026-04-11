from pydantic import BaseModel
from datetime import date as date_type, datetime


class StaffWageBase(BaseModel):
    name: str
    role: str
    week: int
    date: date_type
    hours: float
    hourly_rate: float


class StaffWageCreate(StaffWageBase):
    pass


class StaffWageOut(StaffWageBase):
    id: int
    wage_total: float

    class Config:
        from_attributes = True


class StaffProfile(BaseModel):
    name: str
    role: str
    total_hours: float
    total_earned: float
    weeks_worked: int
    entries: list[StaffWageOut]
