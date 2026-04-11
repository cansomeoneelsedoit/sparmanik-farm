from pydantic import BaseModel
from datetime import date as date_type
from typing import Literal

EntryType = Literal["income", "expense"]
EntrySource = Literal["manual", "auto"]


class AccountingEntryBase(BaseModel):
    date: date_type
    type: str  # income or expense
    description: str
    amount: float
    category: str
    source: str = "manual"


class AccountingEntryCreate(BaseModel):
    date: date_type
    type: str
    description: str
    amount: float
    category: str


class AccountingEntryOut(AccountingEntryBase):
    id: int

    class Config:
        from_attributes = True


class AccountingTotals(BaseModel):
    income: float
    expense: float
    net: float
    entry_count: int


class SyncResult(BaseModel):
    sales_added: int
    wages_added: int
    message: str
