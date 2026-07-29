import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.employee import Employee
from ..dependencies import get_current_user, require_admin, require_admin_or_deskwork
from ..services.auth_service import hash_password

router = APIRouter(prefix="/api/employees", tags=["employees"])

# Employee-code prefix per role (matches the existing data: EMP031…, DSK001…, ADMIN01)
ROLE_PREFIX = {"technician": "EMP", "deskwork": "DSK", "admin": "ADMIN"}

# Roles a deskwork user is allowed to CREATE. They may add technicians and other
# deskwork staff, but never an admin — and they can only ever EDIT technicians.
DESKWORK_CREATABLE = ("technician", "deskwork")


def _next_code(db: Session, role: str) -> str:
    """Next free employee code for a role, e.g. EMP048 / DSK004."""
    prefix = ROLE_PREFIX.get(role, "EMP")
    pad = 2 if prefix == "ADMIN" else 3
    highest = 0
    for (code,) in db.query(Employee.employee_code).filter(
        Employee.employee_code.ilike(f"{prefix}%")
    ).all():
        m = re.match(rf"^{prefix}(\d+)$", (code or "").upper())
        if m:
            highest = max(highest, int(m.group(1)))
    return f"{prefix}{str(highest + 1).zfill(pad)}"


def _default_password(code: str) -> str:
    """Default password convention: LETTERS + '@' + NUMBERS (EMP048 -> EMP@048)."""
    m = re.match(r"^([A-Za-z]+)(\d+)$", code or "")
    return (m.group(1) + "@" + m.group(2)) if m else f"{code}@pass"


def _clean(data: dict) -> dict:
    """Blank phone/email must be NULL — both columns are UNIQUE, so two employees
    saved with '' would collide on the second insert."""
    for key in ("phone", "email", "designation"):
        if key in data and isinstance(data[key], str) and not data[key].strip():
            data[key] = None
    return data


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
def list_employees(db: Session = Depends(get_db), user=Depends(require_admin_or_deskwork)):
    q = db.query(Employee).options(
        joinedload(Employee.mandal),
        selectinload(Employee.mandals),
    ).filter(Employee.is_active == True)
    # Deskwork staff may only see technicians — never admins or other deskwork users.
    if user.role == "deskwork":
        q = q.filter(Employee.role == "technician")
    emps = q.order_by(Employee.employee_code).all()
    return [{"id": e.id, "employee_code": e.employee_code, "name": e.name,
             "phone": e.phone, "email": e.email, "role": e.role,
             "designation": e.designation, "mandal_id": e.mandal_id,
             "mandal_name": e.mandal.name if e.mandal else None,
             "mandals": [{"id": m.id, "name": m.name} for m in e.mandals]} for e in emps]


@router.post("/")
def create_employee(data: EmployeeCreate, db: Session = Depends(get_db),
                    user=Depends(require_admin_or_deskwork)):
    if user.role == "deskwork" and data.role not in DESKWORK_CREATABLE:
        raise HTTPException(403, "You can only add technicians or deskwork staff")

    payload = _clean(data.model_dump())
    emp = Employee(**payload)
    # Give every new employee a working login — without a code and password they
    # could never sign in (login matches on employee_code + password_hash).
    emp.employee_code = _next_code(db, emp.role or "technician")
    default_pw = _default_password(emp.employee_code)
    emp.password_hash = hash_password(default_pw)
    db.add(emp); db.commit(); db.refresh(emp)
    return {"id": emp.id, "name": emp.name, "role": emp.role,
            "employee_code": emp.employee_code, "default_password": default_pw}


@router.put("/{emp_id}")
def update_employee(emp_id: int, data: EmployeeUpdate, db: Session = Depends(get_db),
                    user=Depends(require_admin_or_deskwork)):
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp: raise HTTPException(404, "Not found")

    if user.role == "deskwork":
        # Deskwork staff may only edit technicians, and may not re-assign the role
        # (that would let them convert someone into a deskwork/admin account).
        if emp.role != "technician":
            raise HTTPException(403, "You can only edit technicians")
        if data.role and data.role != "technician":
            raise HTTPException(403, "You cannot change an employee's role")

    for k, v in _clean(data.model_dump(exclude_unset=True)).items():
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
