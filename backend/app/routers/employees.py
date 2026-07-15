from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.employee import Employee
from ..dependencies import get_current_user, require_admin, require_admin_or_deskwork

router = APIRouter(prefix="/api/employees", tags=["employees"])

class EmployeeCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    role: str = "technician"
    designation: Optional[str] = None
    mandal_id: Optional[int] = None

class EmployeeUpdate(EmployeeCreate):
    pass

@router.get("/")
def list_employees(db: Session = Depends(get_db), _=Depends(require_admin_or_deskwork)):
    emps = db.query(Employee).options(
        joinedload(Employee.mandal),
        selectinload(Employee.mandals),
    ).filter(Employee.is_active == True).order_by(Employee.employee_code).all()
    return [{"id": e.id, "employee_code": e.employee_code, "name": e.name,
             "phone": e.phone, "email": e.email, "role": e.role,
             "designation": e.designation, "mandal_id": e.mandal_id,
             "mandal_name": e.mandal.name if e.mandal else None,
             "mandals": [{"id": m.id, "name": m.name} for m in e.mandals]} for e in emps]

@router.post("/")
def create_employee(data: EmployeeCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    emp = Employee(**data.model_dump())
    db.add(emp); db.commit(); db.refresh(emp)
    return {"id": emp.id, "name": emp.name}

@router.put("/{emp_id}")
def update_employee(emp_id: int, data: EmployeeUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp: raise HTTPException(404, "Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(emp, k, v)
    db.commit(); db.refresh(emp)
    return {"id": emp.id, "name": emp.name}

@router.delete("/{emp_id}")
def delete_employee(emp_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp: raise HTTPException(404, "Not found")
    emp.is_active = False
    db.commit()
    return {"ok": True}
