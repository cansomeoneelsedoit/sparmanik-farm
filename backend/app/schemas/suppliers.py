from pydantic import BaseModel
from datetime import datetime


class SupplierBase(BaseModel):
    supplier_name: str
    product_name: str
    description: str = ""
    price: float = 0
    shipping_cost: float = 0
    category: str = "General"
    image_url: str = ""
    source_url: str = ""
    notes: str = ""


class SupplierCreate(SupplierBase):
    pass


class SupplierOut(SupplierBase):
    id: int
    total_cost: float
    created_at: datetime

    class Config:
        from_attributes = True


class ShippingAddress(BaseModel):
    name: str
    phone: str
    address: str
    city: str
    region: str
    postcode: str
    country: str = "Indonesia"
