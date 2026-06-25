from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.school import School
from ..models.mandal import Mandal
from ..models.employee import Employee
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/schools", tags=["schools"])

class SchoolCreate(BaseModel):
    name: str
    client_id: Optional[int] = None
    model: str = "normal"
    mandal: Optional[str] = None
    capacity: Optional[str] = None
    plant_model: Optional[str] = None
    unit_number: Optional[str] = None

def _fmt(s: School):
    return {
        "id": s.id, "name": s.name, "mandal_id": s.mandal_id,
        "mandal_name": s.mandal.name if s.mandal else None,
        "client_id": s.client_id,
        "client_name": s.client.name if s.client else None,
        "model": s.model, "capacity": s.capacity, "plant_model": s.plant_model,
        "unit_number": s.unit_number,
        "plant_condition": s.plant_condition,
        "amc_status": s.amc_status, "last_visit_date": s.last_visit_date.isoformat() if s.last_visit_date else None,
        "is_active": s.is_active
    }

@router.get("/")
def list_schools(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    mandal_id: Optional[int] = None,
    client_id: Optional[int] = None,
    technician_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    q = db.query(School).filter(School.is_active == True)
    if search:
        q = q.filter(School.name.ilike(f"%{search}%"))
    if mandal_id:
        q = q.filter(School.mandal_id == mandal_id)
    if client_id:
        q = q.filter(School.client_id == client_id)
    if technician_id:
        tech = db.query(Employee).filter(Employee.id == technician_id).first()
        if tech:
            tech_mandal_ids = [m.id for m in tech.mandals]
            if tech_mandal_ids:
                q = q.filter(School.mandal_id.in_(tech_mandal_ids))
            else:
                q = q.filter(False)
    total = q.count()
    schools = q.offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "items": [_fmt(s) for s in schools]}

@router.post("/")
def create_school(data: SchoolCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    mandal = db.query(Mandal).filter(Mandal.name == data.mandal).first() if data.mandal else None
    s = School(name=data.name, client_id=data.client_id, model=data.model,
               mandal_id=mandal.id if mandal else None,
               capacity=data.capacity, plant_model=data.plant_model)
    db.add(s); db.commit(); db.refresh(s)
    return _fmt(s)

@router.put("/{sid}")
def update_school(sid: int, data: SchoolCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    s = db.query(School).filter(School.id == sid).first()
    if not s: raise HTTPException(404, "Not found")
    mandal = db.query(Mandal).filter(Mandal.name == data.mandal).first() if data.mandal else None
    s.name = data.name; s.client_id = data.client_id; s.model = data.model
    s.mandal_id = mandal.id if mandal else s.mandal_id
    s.capacity = data.capacity; s.plant_model = data.plant_model
    db.commit(); db.refresh(s)
    return _fmt(s)

@router.delete("/{sid}")
def delete_school(sid: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    s = db.query(School).filter(School.id == sid).first()
    if not s: raise HTTPException(404, "Not found")
    s.is_active = False; db.commit()
    return {"ok": True}
