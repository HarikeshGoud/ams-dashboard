from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.salary_override import SalaryOverride
from ..models.employee import Employee
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/salary-overrides", tags=["salary_overrides"])

class OverrideIn(BaseModel):
    employee_id: int
    month: int
    year: int
    final_amount: float
    note: Optional[str] = None

def _fmt(r: SalaryOverride):
    return {
        "id": r.id,
        "employee_id": r.employee_id,
        "month": r.month,
        "year": r.year,
        "final_amount": float(r.final_amount),
        "note": r.note,
        "set_by": r.set_by,
    }

@router.post("/")
def upsert_override(data: OverrideIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    existing = db.query(SalaryOverride).filter(
        SalaryOverride.employee_id == data.employee_id,
        SalaryOverride.month == data.month,
        SalaryOverride.year == data.year,
    ).first()
    if existing:
        existing.final_amount = data.final_amount
        existing.note = data.note
        existing.set_by = user.id
        db.commit()
        return _fmt(existing)
    ov = SalaryOverride(
        employee_id=data.employee_id, month=data.month, year=data.year,
        final_amount=data.final_amount, note=data.note, set_by=user.id
    )
    db.add(ov); db.commit(); db.refresh(ov)
    return _fmt(ov)

@router.delete("/")
def delete_override(employee_id: int, month: int, year: int,
                    db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    ov = db.query(SalaryOverride).filter(
        SalaryOverride.employee_id == employee_id,
        SalaryOverride.month == month,
        SalaryOverride.year == year,
    ).first()
    if ov:
        db.delete(ov); db.commit()
    return {"deleted": bool(ov)}

@router.get("/")
def list_overrides(month: int, year: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    rows = db.query(SalaryOverride).filter(
        SalaryOverride.month == month, SalaryOverride.year == year
    ).all()
    return [_fmt(r) for r in rows]
