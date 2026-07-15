from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from decimal import Decimal
from datetime import datetime, date, timedelta
from ..database import get_db
from ..models.stock import StockItem, StockLedger, EmployeeStock, StockBatch, EmployeeStockBatch
from ..models.employee import Employee
from ..dependencies import get_current_user, require_admin_or_deskwork

router = APIRouter(prefix="/api/stock", tags=["stock"])

# ── Pydantic models ──────────────────────────────────────────────────────────

class ItemCreate(BaseModel):
    name: str
    category: Optional[str] = None
    unit: str = "pcs"
    min_qty: Optional[int] = None
    min_quantity: Optional[int] = None
    unit_cost: Optional[float] = None
    unit_price: Optional[float] = None
    quantity: Optional[int] = None

class AdjustStock(BaseModel):
    quantity_change: int
    notes: Optional[str] = None
    batch_id: Optional[int] = None  # required when quantity_change < 0

class LedgerCreate(BaseModel):
    item_id: int
    transaction_type: str
    quantity: int
    person: Optional[str] = None
    buy_price: Optional[float] = None
    logistics1: Optional[float] = None
    logistics2: Optional[float] = None
    school_dest: Optional[str] = None
    note: Optional[str] = None
    batch_id: Optional[int] = None  # required for issue/transfer, ignored for receive (a new batch is created instead)

class DistributeStock(BaseModel):
    item_id: int
    employee_id: int
    quantity: int
    batch_id: int
    note: Optional[str] = None

class ReturnStock(BaseModel):
    item_id: int
    quantity: int
    batch_id: int
    note: Optional[str] = None

class InstallStock(BaseModel):
    item_id: int
    quantity: int
    batch_id: int
    school_dest: Optional[str] = None
    note: Optional[str] = None
    task_id: Optional[int] = None

# ── Helpers ──────────────────────────────────────────────────────────────────

def _item_fmt(i: StockItem):
    qty = i.office_qty or 0
    min_q = i.min_qty or 5
    price = float(i.unit_cost or 0)
    return {"id": i.id, "name": i.name, "category": i.category, "unit": i.unit,
            "office_qty": qty, "min_qty": min_q,
            "unit_cost": price, "is_active": i.is_active,
            "quantity": qty, "min_quantity": min_q, "unit_price": price}

def _ledger_fmt(e: StockLedger):
    emp = e.employee
    inspector = e.inspector
    return {
        "id": e.id, "item_id": e.item_id,
        "item_name": e.item.name if e.item else None,
        "item_unit": e.item.unit if e.item else None,
        "transaction_type": e.transaction_type,
        "quantity": e.quantity, "person": e.person,
        "employee_id": e.employee_id,
        "employee_name": emp.name if emp else None,
        "buy_price": float(e.buy_price or 0),
        "logistics1": float(e.logistics1 or 0),
        "logistics2": float(e.logistics2 or 0),
        "school_dest": e.school_dest, "note": e.note,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "inspected": e.inspected or False,
        "inspected_by": e.inspected_by,
        "inspector_name": inspector.name if inspector else None,
        "inspected_at": e.inspected_at.isoformat() if e.inspected_at else None,
        "batch_id": e.batch_id,
        "batch_no": e.batch.batch_no if e.batch else None,
    }

def _batch_fmt(b: StockBatch):
    return {
        "id": b.id, "item_id": b.item_id, "batch_no": b.batch_no,
        "source": b.source, "qty_received": b.qty_received, "qty_office": b.qty_office,
        "unit_cost": float(b.unit_cost or 0), "buy_price": float(b.buy_price or 0),
        "person": b.person, "received_date": b.received_date.isoformat() if b.received_date else None,
        "note": b.note, "created_at": b.created_at.isoformat() if b.created_at else None,
    }

def _upsert_employee_stock(db: Session, employee_id: int, item_id: int, delta: int):
    """Add delta (positive or negative) to technician's in-hand qty."""
    es = db.query(EmployeeStock).filter(
        EmployeeStock.employee_id == employee_id,
        EmployeeStock.item_id == item_id
    ).first()
    if es:
        es.qty_in_hand = max(0, es.qty_in_hand + delta)
        es.updated_at = datetime.utcnow()
    else:
        db.add(EmployeeStock(employee_id=employee_id, item_id=item_id,
                             qty_in_hand=max(0, delta)))

def _upsert_employee_stock_batch(db: Session, employee_id: int, batch_id: int, delta: int):
    """Add delta (positive or negative) to technician's in-hand qty for one specific batch."""
    esb = db.query(EmployeeStockBatch).filter(
        EmployeeStockBatch.employee_id == employee_id,
        EmployeeStockBatch.batch_id == batch_id
    ).first()
    if esb:
        esb.qty_in_hand = max(0, esb.qty_in_hand + delta)
        esb.updated_at = datetime.utcnow()
    else:
        db.add(EmployeeStockBatch(employee_id=employee_id, batch_id=batch_id,
                                  qty_in_hand=max(0, delta)))

def _create_batch(db: Session, item_id: int, quantity: int, source: str,
                   received_date, source_ref_id: int = None, unit_cost: float = None,
                   buy_price: float = None, person: str = None, note: str = None,
                   created_by: int = None) -> StockBatch:
    count = db.query(StockBatch).count()
    batch = StockBatch(
        item_id=item_id, batch_no=f"BATCH-{str(count + 1).zfill(6)}", source=source,
        source_ref_id=source_ref_id, qty_received=quantity, qty_office=quantity,
        unit_cost=unit_cost, buy_price=buy_price, person=person,
        received_date=received_date or date.today(), note=note, created_by=created_by
    )
    db.add(batch)
    db.flush()  # surfaces a clear error on the rare batch_no collision instead of silently duplicating
    return batch

def _reverse_ledger_effect(db: Session, e: StockLedger, item: StockItem):
    """Undo exactly what this ledger row did, batch-aware when e.batch_id is set."""
    if not e.batch_id:
        # Historical row that predates batch tracking — keep the old best-effort reversal.
        if e.transaction_type == "receive":
            item.office_qty = max(0, item.office_qty - e.quantity)
        else:
            item.office_qty += e.quantity
        return

    batch = db.query(StockBatch).filter(StockBatch.id == e.batch_id).first()
    if e.transaction_type == "receive":
        if batch and (batch.qty_office < batch.qty_received):
            raise HTTPException(400, "Can't delete — some of this batch has already been distributed/issued/consumed")
        if batch: batch.qty_office = max(0, batch.qty_office - e.quantity)
        item.office_qty = max(0, item.office_qty - e.quantity)
    elif e.transaction_type in ("issue", "transfer"):
        if batch: batch.qty_office += e.quantity
        item.office_qty += e.quantity
    elif e.transaction_type == "distribute":
        if batch: batch.qty_office += e.quantity
        item.office_qty += e.quantity
        if e.employee_id:
            _upsert_employee_stock_batch(db, e.employee_id, e.batch_id, -e.quantity)
            _upsert_employee_stock(db, e.employee_id, e.item_id, -e.quantity)
    elif e.transaction_type == "return":
        if batch: batch.qty_office = max(0, batch.qty_office - e.quantity)
        item.office_qty = max(0, item.office_qty - e.quantity)
        if e.employee_id:
            _upsert_employee_stock_batch(db, e.employee_id, e.batch_id, e.quantity)
            _upsert_employee_stock(db, e.employee_id, e.item_id, e.quantity)
    elif e.transaction_type == "install":
        if e.employee_id:
            _upsert_employee_stock_batch(db, e.employee_id, e.batch_id, e.quantity)
            _upsert_employee_stock(db, e.employee_id, e.item_id, e.quantity)
    elif e.transaction_type == "purchase":
        # Technician's own external purchase — never touched office_qty, only their personal stock.
        if e.employee_id:
            _upsert_employee_stock_batch(db, e.employee_id, e.batch_id, -e.quantity)
            _upsert_employee_stock(db, e.employee_id, e.item_id, -e.quantity)

# ── Stock Items ──────────────────────────────────────────────────────────────

@router.get("/")
@router.get("/items")
def list_items(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [_item_fmt(i) for i in db.query(StockItem).filter(StockItem.is_active == True).all()]

@router.post("/")
@router.post("/items")
def create_item(data: ItemCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    min_q = data.min_qty if data.min_qty is not None else (data.min_quantity or 5)
    price = data.unit_cost if data.unit_cost is not None else (data.unit_price or 0)
    item = StockItem(name=data.name, category=data.category, unit=data.unit,
                     min_qty=min_q, unit_cost=price, office_qty=data.quantity or 0)
    db.add(item); db.flush()
    if data.quantity and data.quantity > 0:
        batch = _create_batch(db, item_id=item.id, quantity=data.quantity, source="receive",
                              received_date=date.today(), unit_cost=price, created_by=user.id,
                              note="Initial stock on item creation")
        db.add(StockLedger(item_id=item.id, transaction_type="receive", quantity=data.quantity,
                           batch_id=batch.id, note="Initial stock on item creation", created_by=user.id))
    db.commit(); db.refresh(item)
    return _item_fmt(item)

@router.put("/items/{item_id}")
def update_item(item_id: int, data: ItemCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = db.query(StockItem).filter(StockItem.id == item_id).first()
    if not item: raise HTTPException(404, "Item not found")
    item.name = data.name; item.category = data.category; item.unit = data.unit
    item.min_qty = data.min_qty if data.min_qty is not None else (data.min_quantity or item.min_qty)
    item.unit_cost = data.unit_cost if data.unit_cost is not None else (data.unit_price or item.unit_cost)
    db.commit(); db.refresh(item)
    return _item_fmt(item)

@router.post("/{item_id}/adjust")
def adjust_stock(item_id: int, data: AdjustStock, db: Session = Depends(get_db), user=Depends(get_current_user)):
    item = db.query(StockItem).filter(StockItem.id == item_id).first()
    if not item: raise HTTPException(404, "Item not found")

    if data.quantity_change > 0:
        batch = _create_batch(db, item_id=item.id, quantity=data.quantity_change, source="receive",
                              received_date=date.today(), unit_cost=item.unit_cost, created_by=user.id,
                              note=data.notes)
        item.office_qty = (item.office_qty or 0) + data.quantity_change
        db.add(StockLedger(item_id=item.id, transaction_type="receive", quantity=data.quantity_change,
                           batch_id=batch.id, note=data.notes, created_by=user.id))
    elif data.quantity_change < 0:
        qty = abs(data.quantity_change)
        if not data.batch_id:
            raise HTTPException(400, "Select which batch this is being removed from")
        batch = db.query(StockBatch).filter(StockBatch.id == data.batch_id, StockBatch.item_id == item_id).first()
        if not batch: raise HTTPException(404, "Batch not found")
        if batch.qty_office < qty:
            raise HTTPException(400, f"That batch only has {batch.qty_office} left")
        batch.qty_office -= qty
        item.office_qty = max(0, (item.office_qty or 0) - qty)
        db.add(StockLedger(item_id=item.id, transaction_type="issue", quantity=qty,
                           batch_id=batch.id, note=data.notes, created_by=user.id))
    db.commit()
    return {"ok": True, "new_qty": item.office_qty, "quantity": item.office_qty}

# ── Ledger ───────────────────────────────────────────────────────────────────

@router.get("/ledger")
def list_ledger(db: Session = Depends(get_db), _=Depends(get_current_user)):
    entries = db.query(StockLedger).order_by(StockLedger.created_at.desc()).limit(200).all()
    return [_ledger_fmt(e) for e in entries]

@router.post("/ledger")
def add_ledger(data: LedgerCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    item = db.query(StockItem).filter(StockItem.id == data.item_id).first()
    if not item: raise HTTPException(404, "Item not found")

    payload = data.model_dump()
    if data.transaction_type == "receive":
        batch = _create_batch(db, item_id=item.id, quantity=data.quantity, source="receive",
                              received_date=date.today(), buy_price=data.buy_price, person=data.person,
                              created_by=user.id, note=data.note)
        payload["batch_id"] = batch.id
        item.office_qty += data.quantity
    elif data.transaction_type in ("transfer", "issue"):
        if not data.batch_id:
            raise HTTPException(400, "Select which batch this is being issued from")
        batch = db.query(StockBatch).filter(StockBatch.id == data.batch_id, StockBatch.item_id == data.item_id).first()
        if not batch: raise HTTPException(404, "Batch not found")
        if batch.qty_office < data.quantity:
            raise HTTPException(400, f"That batch only has {batch.qty_office} left")
        batch.qty_office -= data.quantity
        item.office_qty = max(0, item.office_qty - data.quantity)

    entry = StockLedger(**payload, created_by=user.id)
    db.add(entry); db.commit()
    return {"ok": True, "new_qty": item.office_qty}

@router.delete("/ledger/{eid}")
def delete_ledger(eid: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    e = db.query(StockLedger).filter(StockLedger.id == eid).first()
    if not e: raise HTTPException(404, "Not found")
    item = db.query(StockItem).filter(StockItem.id == e.item_id).first()
    if item:
        _reverse_ledger_effect(db, e, item)
    db.delete(e); db.commit()
    return {"ok": True}

# ── Distribution (Admin/Deskwork → Technician) ───────────────────────────────

@router.post("/distribute")
def distribute_stock(data: DistributeStock, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Only admin or deskwork can distribute stock")
    item = db.query(StockItem).filter(StockItem.id == data.item_id).first()
    if not item: raise HTTPException(404, "Item not found")
    emp = db.query(Employee).filter(Employee.id == data.employee_id).first()
    if not emp: raise HTTPException(404, "Employee not found")
    batch = db.query(StockBatch).filter(StockBatch.id == data.batch_id, StockBatch.item_id == data.item_id).first()
    if not batch: raise HTTPException(404, "Batch not found")
    if batch.qty_office < data.quantity:
        raise HTTPException(400, f"That batch only has {batch.qty_office} left in office")

    batch.qty_office -= data.quantity
    item.office_qty = max(0, (item.office_qty or 0) - data.quantity)
    _upsert_employee_stock(db, data.employee_id, data.item_id, data.quantity)
    _upsert_employee_stock_batch(db, data.employee_id, data.batch_id, data.quantity)
    db.add(StockLedger(
        item_id=data.item_id, transaction_type="distribute", batch_id=data.batch_id,
        quantity=data.quantity, employee_id=data.employee_id,
        person=emp.name, note=data.note, created_by=user.id
    ))
    db.commit()
    return {"ok": True, "office_qty": item.office_qty, "distributed_to": emp.name}

@router.post("/inspect/{ledger_id}")
def inspect_stock(ledger_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Only admin or deskwork can inspect stock")
    e = db.query(StockLedger).filter(StockLedger.id == ledger_id).first()
    if not e: raise HTTPException(404, "Ledger entry not found")
    e.inspected = True
    e.inspected_by = user.id
    e.inspected_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "inspected_at": e.inspected_at.isoformat()}

# ── Return (Technician → Office) ─────────────────────────────────────────────

@router.post("/return")
def return_stock(data: ReturnStock, db: Session = Depends(get_db), user=Depends(get_current_user)):
    item = db.query(StockItem).filter(StockItem.id == data.item_id).first()
    if not item: raise HTTPException(404, "Item not found")
    es = db.query(EmployeeStock).filter(
        EmployeeStock.employee_id == user.id, EmployeeStock.item_id == data.item_id
    ).first()
    in_hand = es.qty_in_hand if es else 0
    if in_hand < data.quantity:
        raise HTTPException(400, f"You only have {in_hand} in hand")
    esb = db.query(EmployeeStockBatch).filter(
        EmployeeStockBatch.employee_id == user.id, EmployeeStockBatch.batch_id == data.batch_id
    ).first()
    if not esb or esb.qty_in_hand < data.quantity:
        raise HTTPException(400, f"You only have {esb.qty_in_hand if esb else 0} of that batch in hand")

    _upsert_employee_stock(db, user.id, data.item_id, -data.quantity)
    _upsert_employee_stock_batch(db, user.id, data.batch_id, -data.quantity)
    batch = db.query(StockBatch).filter(StockBatch.id == data.batch_id).first()
    if batch: batch.qty_office += data.quantity
    item.office_qty += data.quantity
    db.add(StockLedger(
        item_id=data.item_id, transaction_type="return", batch_id=data.batch_id,
        quantity=data.quantity, employee_id=user.id,
        person=user.name, note=data.note, created_by=user.id
    ))
    db.commit()
    return {"ok": True, "returned": data.quantity}

# ── Install (Technician marks stock as installed at site) ────────────────────

@router.post("/install")
def install_stock(data: InstallStock, db: Session = Depends(get_db), user=Depends(get_current_user)):
    item = db.query(StockItem).filter(StockItem.id == data.item_id).first()
    if not item: raise HTTPException(404, "Item not found")
    es = db.query(EmployeeStock).filter(
        EmployeeStock.employee_id == user.id, EmployeeStock.item_id == data.item_id
    ).first()
    in_hand = es.qty_in_hand if es else 0
    if in_hand < data.quantity:
        raise HTTPException(400, f"You only have {in_hand} in hand")
    esb = db.query(EmployeeStockBatch).filter(
        EmployeeStockBatch.employee_id == user.id, EmployeeStockBatch.batch_id == data.batch_id
    ).first()
    if not esb or esb.qty_in_hand < data.quantity:
        raise HTTPException(400, f"You only have {esb.qty_in_hand if esb else 0} of that batch in hand")

    # Duplicate check: same item + batch + school + qty by same employee within last 3 minutes
    cutoff = datetime.utcnow() - timedelta(minutes=3)
    duplicate = db.query(StockLedger).filter(
        StockLedger.employee_id == user.id,
        StockLedger.item_id == data.item_id,
        StockLedger.transaction_type == "install",
        StockLedger.batch_id == data.batch_id,
        StockLedger.school_dest == data.school_dest,
        StockLedger.quantity == data.quantity,
        StockLedger.created_at >= cutoff,
    ).first()
    if duplicate:
        raise HTTPException(400, "Duplicate install detected — same item, batch, school and quantity were already recorded within the last 3 minutes. Please wait before submitting again.")

    _upsert_employee_stock(db, user.id, data.item_id, -data.quantity)
    _upsert_employee_stock_batch(db, user.id, data.batch_id, -data.quantity)
    db.add(StockLedger(
        item_id=data.item_id, transaction_type="install", batch_id=data.batch_id,
        quantity=data.quantity, employee_id=user.id,
        person=user.name, school_dest=data.school_dest,
        note=data.note, created_by=user.id
    ))
    db.commit()
    return {"ok": True, "installed": data.quantity}

# ── My Stock (Technician view) ───────────────────────────────────────────────

@router.get("/my-stock")
def my_stock(db: Session = Depends(get_db), user=Depends(get_current_user)):
    in_hand = db.query(EmployeeStock).filter(EmployeeStock.employee_id == user.id).all()
    received = db.query(StockLedger).filter(
        StockLedger.employee_id == user.id,
        StockLedger.transaction_type == "distribute"
    ).order_by(StockLedger.created_at.desc()).limit(50).all()
    installed = db.query(StockLedger).filter(
        StockLedger.employee_id == user.id,
        StockLedger.transaction_type == "install"
    ).order_by(StockLedger.created_at.desc()).limit(50).all()
    my_batches = db.query(EmployeeStockBatch).filter(
        EmployeeStockBatch.employee_id == user.id, EmployeeStockBatch.qty_in_hand > 0
    ).all()

    return {
        "in_hand": [{
            "item_id": s.item_id,
            "item_name": s.item.name if s.item else None,
            "category": s.item.category if s.item else None,
            "unit": s.item.unit if s.item else None,
            "qty_in_hand": s.qty_in_hand,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        } for s in in_hand if s.qty_in_hand > 0],
        "received": [_ledger_fmt(e) for e in received],
        "installed": [_ledger_fmt(e) for e in installed],
        "batches": [{
            "item_id": b.batch.item_id if b.batch else None,
            "batch_id": b.batch_id,
            "batch_no": b.batch.batch_no if b.batch else None,
            "qty_in_hand": b.qty_in_hand,
            "received_date": b.batch.received_date.isoformat() if b.batch and b.batch.received_date else None,
        } for b in my_batches],
    }

# ── Employee Stock (Admin view — all or specific technician) ─────────────────

@router.get("/employee-stock")
def all_employee_stock(db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Access denied")
    rows = db.query(EmployeeStock).filter(EmployeeStock.qty_in_hand > 0).all()
    result = {}
    for s in rows:
        emp_id = s.employee_id
        if emp_id not in result:
            result[emp_id] = {
                "employee_id": emp_id,
                "employee_name": s.employee.name if s.employee else None,
                "items": []
            }
        result[emp_id]["items"].append({
            "item_id": s.item_id,
            "item_name": s.item.name if s.item else None,
            "category": s.item.category if s.item else None,
            "unit": s.item.unit if s.item else None,
            "qty_in_hand": s.qty_in_hand,
        })
    return list(result.values())

@router.get("/employee/{emp_id}/stock")
def employee_stock(emp_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role not in ("admin", "deskwork") and user.id != emp_id:
        raise HTTPException(403, "Access denied")
    in_hand = db.query(EmployeeStock).filter(EmployeeStock.employee_id == emp_id).all()
    history = db.query(StockLedger).filter(
        StockLedger.employee_id == emp_id
    ).order_by(StockLedger.created_at.desc()).limit(100).all()
    return {
        "in_hand": [{
            "item_id": s.item_id,
            "item_name": s.item.name if s.item else None,
            "category": s.item.category if s.item else None,
            "unit": s.item.unit if s.item else None,
            "qty_in_hand": s.qty_in_hand,
        } for s in in_hand if s.qty_in_hand > 0],
        "history": [_ledger_fmt(e) for e in history],
    }

@router.get("/distributions")
def list_distributions(db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Access denied")
    entries = db.query(StockLedger).filter(
        StockLedger.transaction_type == "distribute"
    ).order_by(StockLedger.created_at.desc()).limit(200).all()
    return [_ledger_fmt(e) for e in entries]

# ── Batches ──────────────────────────────────────────────────────────────────

@router.get("/batches")
def list_batches(item_id: int, include_depleted: bool = False, db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = db.query(StockBatch).filter(StockBatch.item_id == item_id)
    if not include_depleted:
        q = q.filter(StockBatch.qty_office > 0)
    batches = q.order_by(StockBatch.received_date.asc(), StockBatch.id.asc()).all()
    return [_batch_fmt(b) for b in batches]

@router.get("/employee-batches")
def list_employee_batches(item_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = db.query(EmployeeStockBatch).join(StockBatch, EmployeeStockBatch.batch_id == StockBatch.id).filter(
        EmployeeStockBatch.employee_id == user.id,
        StockBatch.item_id == item_id,
        EmployeeStockBatch.qty_in_hand > 0
    ).order_by(StockBatch.received_date.asc()).all()
    return [{
        "id": r.batch_id, "batch_no": r.batch.batch_no if r.batch else None,
        "qty_office": r.qty_in_hand,  # reused field name so the frontend picker can treat this like a batch option uniformly
        "received_date": r.batch.received_date.isoformat() if r.batch and r.batch.received_date else None,
    } for r in rows]

@router.get("/batches/{batch_id}/trace")
def trace_batch(batch_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Access denied")
    batch = db.query(StockBatch).filter(StockBatch.id == batch_id).first()
    if not batch: raise HTTPException(404, "Batch not found")
    movements = db.query(StockLedger).filter(
        StockLedger.batch_id == batch_id
    ).order_by(StockLedger.created_at.asc()).all()
    return {
        "batch": _batch_fmt(batch),
        "item_name": batch.item.name if batch.item else None,
        "movements": [_ledger_fmt(e) for e in movements],
    }
