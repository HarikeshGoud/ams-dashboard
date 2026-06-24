from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from decimal import Decimal
from ..database import get_db
from ..models.stock import StockItem, StockLedger
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/stock", tags=["stock"])

class ItemCreate(BaseModel):
    name: str
    category: Optional[str] = None
    unit: str = "pcs"
    min_qty: Optional[int] = None
    min_quantity: Optional[int] = None  # alias
    unit_cost: Optional[float] = None
    unit_price: Optional[float] = None  # alias
    quantity: Optional[int] = None

class AdjustStock(BaseModel):
    quantity_change: int
    notes: Optional[str] = None

class LedgerCreate(BaseModel):
    item_id: int
    transaction_type: str  # receive / transfer / issue
    quantity: int
    person: Optional[str] = None
    buy_price: Optional[float] = None
    logistics1: Optional[float] = None
    logistics2: Optional[float] = None
    school_dest: Optional[str] = None
    note: Optional[str] = None

def _item_fmt(i: StockItem):
    qty = i.office_qty or 0
    min_q = i.min_qty or 5
    price = float(i.unit_cost or 0)
    return {"id": i.id, "name": i.name, "category": i.category, "unit": i.unit,
            "office_qty": qty, "min_qty": min_q,
            "unit_cost": price, "is_active": i.is_active,
            # frontend-friendly aliases
            "quantity": qty, "min_quantity": min_q, "unit_price": price}

@router.get("/")
@router.get("/items")
def list_items(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [_item_fmt(i) for i in db.query(StockItem).filter(StockItem.is_active == True).all()]

@router.post("/")
@router.post("/items")
def create_item(data: ItemCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    min_q = data.min_qty if data.min_qty is not None else (data.min_quantity if data.min_quantity is not None else 5)
    price = data.unit_cost if data.unit_cost is not None else (data.unit_price if data.unit_price is not None else 0)
    initial_qty = data.quantity or 0
    item = StockItem(name=data.name, category=data.category, unit=data.unit,
                     min_qty=min_q, unit_cost=price, office_qty=initial_qty)
    db.add(item); db.commit(); db.refresh(item)
    return _item_fmt(item)

@router.post("/{item_id}/adjust")
def adjust_stock(item_id: int, data: AdjustStock, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = db.query(StockItem).filter(StockItem.id == item_id).first()
    if not item: raise HTTPException(404, "Item not found")
    item.office_qty = max(0, (item.office_qty or 0) + data.quantity_change)
    txn_type = "receive" if data.quantity_change > 0 else "issue"
    entry = StockLedger(item_id=item.id, transaction_type=txn_type,
                        quantity=abs(data.quantity_change), note=data.notes)
    db.add(entry); db.commit()
    return {"ok": True, "new_qty": item.office_qty, "quantity": item.office_qty}

@router.get("/ledger")
def list_ledger(db: Session = Depends(get_db), _=Depends(get_current_user)):
    entries = db.query(StockLedger).order_by(StockLedger.created_at.desc()).limit(200).all()
    return [{
        "id": e.id, "item_id": e.item_id,
        "item_name": e.item.name if e.item else None,
        "transaction_type": e.transaction_type,
        "quantity": e.quantity, "person": e.person,
        "buy_price": float(e.buy_price or 0),
        "logistics1": float(e.logistics1 or 0),
        "logistics2": float(e.logistics2 or 0),
        "school_dest": e.school_dest, "note": e.note,
        "created_at": e.created_at.isoformat() if e.created_at else None
    } for e in entries]

@router.post("/ledger")
def add_ledger(data: LedgerCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = db.query(StockItem).filter(StockItem.id == data.item_id).first()
    if not item: raise HTTPException(404, "Item not found")
    entry = StockLedger(**data.model_dump())
    if data.transaction_type == "receive":
        item.office_qty += data.quantity
    elif data.transaction_type in ("transfer", "issue"):
        item.office_qty = max(0, item.office_qty - data.quantity)
    db.add(entry); db.commit(); db.refresh(entry)
    return {"ok": True, "new_qty": item.office_qty}

@router.delete("/ledger/{eid}")
def delete_ledger(eid: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    e = db.query(StockLedger).filter(StockLedger.id == eid).first()
    if not e: raise HTTPException(404, "Not found")
    item = db.query(StockItem).filter(StockItem.id == e.item_id).first()
    if item:
        if e.transaction_type == "receive":
            item.office_qty = max(0, item.office_qty - e.quantity)
        else:
            item.office_qty += e.quantity
    db.delete(e); db.commit()
    return {"ok": True}
