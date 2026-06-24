from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.salary import SalaryRecord
from ..models.employee import Employee
from ..dependencies import get_current_user, require_admin

router = APIRouter(prefix="/api/salary", tags=["salary"])

class SalaryCreate(BaseModel):
    employee_id: int
    month: int
    year: int
    basic_salary: float
    allowances: float = 0
    deductions: float = 0

@router.get("/")
def list_salary(month: int = None, year: int = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(SalaryRecord)
    if user.role != "admin":
        q = q.filter(SalaryRecord.employee_id == user.id)
    if month: q = q.filter(SalaryRecord.month == month)
    if year: q = q.filter(SalaryRecord.year == year)
    records = q.all()
    return [{
        "id": r.id, "employee_id": r.employee_id,
        "employee_name": r.employee.name if r.employee else None,
        "month": r.month, "year": r.year,
        "basic_salary": float(r.basic_salary or 0),
        "allowances": float(r.allowances or 0),
        "deductions": float(r.deductions or 0),
        "net_salary": float(r.net_salary or 0),
        "status": r.status
    } for r in records]

@router.post("/")
def create_salary(data: SalaryCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    net = data.basic_salary + data.allowances - data.deductions
    r = SalaryRecord(employee_id=data.employee_id, month=data.month, year=data.year,
                     basic_salary=data.basic_salary, allowances=data.allowances,
                     deductions=data.deductions, net_salary=net)
    db.add(r); db.commit(); db.refresh(r)
    return {"id": r.id, "net_salary": float(r.net_salary)}

@router.patch("/{rid}/status")
def update_status(rid: int, status: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(SalaryRecord).filter(SalaryRecord.id == rid).first()
    if not r: raise HTTPException(404, "Not found")
    r.status = status; db.commit()
    return {"ok": True}
