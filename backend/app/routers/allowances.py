from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from ..database import get_db
from ..models.allowance import AllowanceRequest
from ..models.employee import Employee
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/allowances", tags=["allowances"])

class AllowanceCreate(BaseModel):
    amount: float
    reason: str
    date: str

class AllowanceReview(BaseModel):
    status: str   # granted / revoked
    admin_note: Optional[str] = None

def _fmt(r: AllowanceRequest):
    return {
        "id": r.id,
        "employee_id": r.employee_id,
        "employee_name": r.employee.name if r.employee else None,
        "amount": float(r.amount),
        "reason": r.reason,
        "date": r.date.isoformat() if r.date else None,
        "status": r.status,
        "admin_note": r.admin_note,
        "reviewed_by": r.reviewed_by,
        "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }

@router.post("/")
def submit_allowance(data: AllowanceCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    req = AllowanceRequest(
        employee_id=user.id,
        amount=data.amount,
        reason=data.reason,
        date=date.fromisoformat(data.date),
        status="pending"
    )
    db.add(req); db.flush()

    # Notify all admins
    from ..models.notification import Notification
    admins = db.query(Employee).filter(Employee.role == "admin", Employee.is_active == True).all()
    for admin in admins:
        db.add(Notification(
            recipient_id=admin.id,
            sender_id=user.id,
            type="ALLOWANCE_REQUEST",
            message=f"{user.name} submitted an allowance request of ₹{data.amount:.0f} — {data.reason}"
        ))
    db.commit(); db.refresh(req)
    return _fmt(req)

@router.get("/")
def list_allowances(db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(AllowanceRequest)
    if user.role not in ("admin", "deskwork"):
        q = q.filter(AllowanceRequest.employee_id == user.id)
    return [_fmt(r) for r in q.order_by(AllowanceRequest.created_at.desc()).all()]

@router.patch("/{req_id}")
def review_allowance(req_id: int, data: AllowanceReview, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Not authorized")
    if data.status not in ("granted", "revoked"):
        raise HTTPException(400, "Status must be granted or revoked")
    req = db.query(AllowanceRequest).filter(AllowanceRequest.id == req_id).first()
    if not req:
        raise HTTPException(404, "Not found")
    req.status = data.status
    req.admin_note = data.admin_note
    req.reviewed_by = user.id
    req.reviewed_at = datetime.utcnow()

    # Notify the technician
    from ..models.notification import Notification
    db.add(Notification(
        recipient_id=req.employee_id,
        sender_id=user.id,
        type="ALLOWANCE_REVIEWED",
        message=f"Your allowance request of ₹{float(req.amount):.0f} was {data.status} by {user.name}."
        + (f" Note: {data.admin_note}" if data.admin_note else "")
    ))
    db.commit(); db.refresh(req)
    return _fmt(req)
