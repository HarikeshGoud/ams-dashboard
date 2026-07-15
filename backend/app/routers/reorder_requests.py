from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..models.reorder_request import ReorderRequest
from ..models.stock import StockItem
from ..models.employee import Employee
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/reorder", tags=["reorder"])

class ReorderCreate(BaseModel):
    item_id: int
    requested_qty: int
    note: Optional[str] = None

class ReorderUpdate(BaseModel):
    status: str  # ordered / received / cancelled
    note: Optional[str] = None

def _fmt(r: ReorderRequest):
    return {
        "id": r.id, "item_id": r.item_id,
        "item_name": r.item.name if r.item else None,
        "item_unit": r.item.unit if r.item else None,
        "office_qty": r.item.office_qty if r.item else None,
        "min_qty": r.item.min_qty if r.item else None,
        "requested_qty": r.requested_qty,
        "status": r.status,
        "note": r.note,
        "requested_by": r.requested_by,
        "requester_name": r.requester.name if r.requester else None,
        "requested_at": r.requested_at.isoformat() if r.requested_at else None,
        "resolved_by": r.resolved_by,
        "resolver_name": r.resolver.name if r.resolver else None,
        "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
    }

@router.get("/")
def list_reorders(db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Access denied")
    rows = db.query(ReorderRequest).order_by(ReorderRequest.requested_at.desc()).all()
    return [_fmt(r) for r in rows]

@router.post("/")
def create_reorder(data: ReorderCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Access denied")
    item = db.query(StockItem).filter(StockItem.id == data.item_id).first()
    if not item: raise HTTPException(404, "Item not found")
    existing = db.query(ReorderRequest).filter(
        ReorderRequest.item_id == data.item_id,
        ReorderRequest.status.in_(("pending", "ordered"))
    ).first()
    if existing:
        raise HTTPException(400, f"There's already an open reorder request for {item.name} ({existing.status})")

    req = ReorderRequest(item_id=data.item_id, requested_qty=data.requested_qty,
                         note=data.note, requested_by=user.id)
    db.add(req); db.flush()

    from ..models.notification import Notification
    others = db.query(Employee).filter(
        Employee.role.in_(["admin", "deskwork"]), Employee.is_active == True, Employee.id != user.id
    ).all()
    for o in others:
        db.add(Notification(
            recipient_id=o.id, sender_id=user.id, type="REORDER_REQUESTED",
            message=f"{user.name} flagged {item.name} for reorder ({data.requested_qty} {item.unit})"
        ))

    db.commit(); db.refresh(req)
    return _fmt(req)

@router.patch("/{reorder_id}")
def update_reorder(reorder_id: int, data: ReorderUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Access denied")
    if data.status not in ("ordered", "received", "cancelled"):
        raise HTTPException(400, "status must be ordered, received, or cancelled")
    r = db.query(ReorderRequest).filter(ReorderRequest.id == reorder_id).first()
    if not r: raise HTTPException(404, "Not found")

    r.status = data.status
    if data.note: r.note = data.note
    if data.status in ("received", "cancelled"):
        r.resolved_by = user.id
        r.resolved_at = datetime.utcnow()

    db.commit(); db.refresh(r)
    return _fmt(r)
