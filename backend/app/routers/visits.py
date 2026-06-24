from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date
from ..database import get_db
from ..models.visit import Visit
from ..models.school import School
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/visits", tags=["visits"])

class VisitCreate(BaseModel):
    school_id: int
    employee_id: int
    visit_date: str
    visit_type: str = "routine"
    tds_reading: Optional[float] = None
    ph_reading: Optional[float] = None
    filters_used: int = 0
    plant_condition: str = "working"
    not_working_reason: Optional[str] = None
    mcf_used: int = 0
    antiscalant_used: float = 0
    spares_used: Optional[str] = None
    work_done: Optional[str] = None
    remarks: Optional[str] = None

def _fmt(v: Visit):
    return {
        "id": v.id, "school_id": v.school_id,
        "school_name": v.school.name if v.school else None,
        "employee_id": v.employee_id,
        "employee_name": v.employee.name if v.employee else None,
        "visit_date": v.visit_date.isoformat() if v.visit_date else None,
        "visit_type": v.visit_type, "status": v.status,
        "tds_reading": v.tds_reading, "ph_reading": v.ph_reading,
        "filters_used": v.filters_used,
        "plant_condition": v.plant_condition,
        "not_working_reason": v.not_working_reason,
        "mcf_used": v.mcf_used,
        "antiscalant_used": float(v.antiscalant_used) if v.antiscalant_used else 0,
        "spares_used": v.spares_used,
        "work_done": v.work_done, "remarks": v.remarks,
    }

@router.get("/")
def list_visits(
    page: int = Query(1, ge=1), limit: int = Query(50),
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db), user=Depends(get_current_user)
):
    q = db.query(Visit)
    if user.role != "admin":
        q = q.filter(Visit.employee_id == user.id)
    elif employee_id:
        q = q.filter(Visit.employee_id == employee_id)
    total = q.count()
    visits = q.order_by(Visit.visit_date.desc()).offset((page-1)*limit).limit(limit).all()
    return {"total": total, "items": [_fmt(v) for v in visits]}

@router.post("/")
def create_visit(data: VisitCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    v = Visit(
        school_id=data.school_id, employee_id=data.employee_id,
        visit_date=date.fromisoformat(data.visit_date),
        visit_type=data.visit_type, tds_reading=data.tds_reading,
        ph_reading=data.ph_reading, filters_used=data.filters_used,
        plant_condition=data.plant_condition,
        not_working_reason=data.not_working_reason,
        mcf_used=data.mcf_used, antiscalant_used=data.antiscalant_used,
        spares_used=data.spares_used,
        work_done=data.work_done, remarks=data.remarks, status="completed"
    )
    # Update plant condition on the school record
    school_obj = db.query(School).filter(School.id == data.school_id).first()
    if school_obj:
        school_obj.plant_condition = data.plant_condition
    db.add(v); db.commit()
    school = db.query(School).filter(School.id == data.school_id).first()
    if school:
        school.last_visit_date = v.visit_date
        db.commit()
    db.refresh(v)
    return _fmt(v)

@router.delete("/{vid}")
def delete_visit(vid: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    v = db.query(Visit).filter(Visit.id == vid).first()
    if not v: raise HTTPException(404, "Not found")
    db.delete(v); db.commit()
    return {"ok": True}
