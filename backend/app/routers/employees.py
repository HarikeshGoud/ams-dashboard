import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload
from pydantic import BaseModel
from typing import Optional, List
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
    # mandal_id is the PRIMARY mandal and drives travel-allowance eligibility
    # (_travel_enabled_for_employee reads it). mandal_ids is the full list that daily task
    # rotation works from. Send both; if only mandal_ids is sent the first becomes primary.
    mandal_id: Optional[int] = None
    mandal_ids: Optional[List[int]] = None
    # Set to pin this technician to ONE site they service every day instead of rotating.
    dedicated_school_id: Optional[int] = None

class EmployeeUpdate(EmployeeCreate):
    pass


def _apply_mandals(db: Session, emp: Employee, mandal_ids, primary_id):
    """Attach a mandal list and keep the legacy primary in step.

    Writing only the many-to-many looks right on the Tasks screen and quietly costs the
    technician their travel allowance, because eligibility is read from mandal_id alone.
    """
    from ..models.mandal import Mandal
    wanted = list(dict.fromkeys(mandal_ids or []))
    mandals = db.query(Mandal).filter(Mandal.id.in_(wanted)).all() if wanted else []
    if len(mandals) != len(wanted):
        missing = sorted(set(wanted) - {m.id for m in mandals})
        raise HTTPException(404, f"Unknown mandal id(s): {missing}")

    by_id = {m.id: m for m in mandals}
    emp.mandals = [by_id[mid] for mid in wanted]

    if primary_id is not None and primary_id not in wanted and wanted:
        raise HTTPException(400, "The primary mandal must be one of the selected mandals.")
    emp.mandal_id = primary_id if primary_id in by_id else (wanted[0] if wanted else None)


def _validate_dedicated(db: Session, school_id):
    from ..models.school import School
    site = db.query(School).filter(School.id == school_id, School.is_active == True).first()
    if not site:
        raise HTTPException(404, "That site was not found.")
    # Rotation skips a parent that has sub-locations, because technicians report on each
    # child individually. Pinning someone to the parent would generate a daily task they
    # can't file a proper report against.
    kids = db.query(School).filter(School.parent_school_id == site.id,
                                   School.is_active == True).count()
    if kids:
        raise HTTPException(400,
            f"'{site.name}' has {kids} sub-location(s), so it's a container rather than a "
            f"place to visit. Pin the technician to one of its sub-locations instead.")
    return site


@router.get("/")
def list_employees(db: Session = Depends(get_db), user=Depends(require_admin_or_deskwork)):
    q = db.query(Employee).options(
        joinedload(Employee.mandal),
        selectinload(Employee.mandals),
        joinedload(Employee.dedicated_school),
    ).filter(Employee.is_active == True)
    # Deskwork staff may only see technicians — never admins or other deskwork users.
    if user.role == "deskwork":
        q = q.filter(Employee.role == "technician")
    emps = q.order_by(Employee.employee_code).all()
    return [{"id": e.id, "employee_code": e.employee_code, "name": e.name,
             "phone": e.phone, "email": e.email, "role": e.role,
             "designation": e.designation, "mandal_id": e.mandal_id,
             "mandal_name": e.mandal.name if e.mandal else None,
             "mandals": [{"id": m.id, "name": m.name} for m in e.mandals],
             "dedicated_school_id": e.dedicated_school_id,
             "dedicated_school_name": e.dedicated_school.name if e.dedicated_school else None,
             "dedicated_school_model": e.dedicated_school.model if e.dedicated_school else None,
             } for e in emps]


@router.post("/")
def create_employee(data: EmployeeCreate, db: Session = Depends(get_db),
                    user=Depends(require_admin_or_deskwork)):
    if user.role == "deskwork" and data.role not in DESKWORK_CREATABLE:
        raise HTTPException(403, "You can only add technicians or deskwork staff")

    payload = _clean(data.model_dump())
    # mandal_ids is a relationship, not a column — it can't go through Employee(**payload).
    mandal_ids = payload.pop("mandal_ids", None)
    dedicated_id = payload.pop("dedicated_school_id", None)

    emp = Employee(**payload)
    # Give every new employee a working login — without a code and password they
    # could never sign in (login matches on employee_code + password_hash).
    emp.employee_code = _next_code(db, emp.role or "technician")
    default_pw = _default_password(emp.employee_code)
    emp.password_hash = hash_password(default_pw)
    db.add(emp); db.flush()

    if mandal_ids is not None:
        _apply_mandals(db, emp, mandal_ids, data.mandal_id)
    elif emp.mandal_id:
        # Only a single mandal was sent. Mirror it into the list too, or rotation would
        # fall back to the legacy path and the Mapping page would show "legacy only".
        _apply_mandals(db, emp, [emp.mandal_id], emp.mandal_id)

    if dedicated_id is not None:
        if (emp.role or "technician") != "technician":
            raise HTTPException(400, "Only a technician can be pinned to a single site.")
        _validate_dedicated(db, dedicated_id)
        emp.dedicated_school_id = dedicated_id

    db.commit(); db.refresh(emp)
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

    payload = _clean(data.model_dump(exclude_unset=True))
    mandal_ids   = payload.pop("mandal_ids", None)
    has_dedicated = "dedicated_school_id" in payload
    dedicated_id  = payload.pop("dedicated_school_id", None)

    for k, v in payload.items():
        setattr(emp, k, v)

    if mandal_ids is not None:
        _apply_mandals(db, emp, mandal_ids, payload.get("mandal_id", emp.mandal_id))

    # Only touched when the field was actually sent, so a partial update can't silently
    # unpin a technician from their site.
    if has_dedicated:
        if dedicated_id:
            if emp.role != "technician":
                raise HTTPException(400, "Only a technician can be pinned to a single site.")
            _validate_dedicated(db, dedicated_id)
        emp.dedicated_school_id = dedicated_id or None

    db.commit(); db.refresh(emp)
    return {"id": emp.id, "name": emp.name,
            "dedicated_school_id": emp.dedicated_school_id}


@router.delete("/{emp_id}")
def delete_employee(emp_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp: raise HTTPException(404, "Not found")
    emp.is_active = False
    db.commit()
    return {"ok": True}
