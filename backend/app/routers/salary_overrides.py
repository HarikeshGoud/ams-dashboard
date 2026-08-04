from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.salary_override import SalaryOverride
from ..models.employee import Employee
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/salary-overrides", tags=["salary_overrides"])

# Deskwork has the same access here as admin, so the Salary page works for both roles.
#
# With one limit: deskwork may only touch a TECHNICIAN's override. The Salary page is driven by
# attendance/monthly-summary, which lists active technicians only, so that costs the page
# nothing — but these endpoints take an arbitrary employee_id, and without the check a
# deskworker could hand-craft a request setting their own final pay, or the admin's. Admin keeps
# full reach. `set_by` records who set each override either way.


def _guard(user, db, employee_id: int):
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Admin or deskwork only")
    if user.role == "deskwork":
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(404, "Employee not found")
        if emp.role != "technician":
            raise HTTPException(403, "Deskwork can only override a technician's salary")

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
    _guard(user, db, data.employee_id)
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
    _guard(user, db, employee_id)
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
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Admin or deskwork only")
    # There's no employee_id to guard on here, so deskwork is narrowed to technicians the same
    # way — the Salary page only renders technician rows, so nothing is lost, and an override
    # on a non-technician stays out of view.
    if user.role == "deskwork":
        tech_ids = [i for (i,) in db.query(Employee.id).filter(Employee.role == "technician").all()]
        rows = db.query(SalaryOverride).filter(
            SalaryOverride.month == month, SalaryOverride.year == year,
            SalaryOverride.employee_id.in_(tech_ids) if tech_ids else False,
        ).all()
        return [_fmt(r) for r in rows]
    rows = db.query(SalaryOverride).filter(
        SalaryOverride.month == month, SalaryOverride.year == year
    ).all()
    return [_fmt(r) for r in rows]
