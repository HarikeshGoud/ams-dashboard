import os, shutil
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Request
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.school import School
from ..models.mandal import Mandal
from ..models.employee import Employee
from ..models.visit import Visit
from ..models.field_report import FieldReport
from ..models.service_report import ServiceReport
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/schools", tags=["schools"])

class SchoolCreate(BaseModel):
    name: str
    client_id: Optional[int] = None
    model: str = "school"
    mandal: Optional[str] = None
    capacity: Optional[str] = None
    plant_model: Optional[str] = None
    unit_number: Optional[str] = None
    amc_status: Optional[str] = "amc"

def _fmt(s: School):
    tech_obj = s.technician if s.technician_id else None
    return {
        "id": s.id, "name": s.name, "mandal_id": s.mandal_id,
        "mandal_name": s.mandal.name if s.mandal else None,
        "client_id": s.client_id,
        "client_name": s.client.name if s.client else None,
        "technician_id": s.technician_id,
        "technician_name": tech_obj.name if tech_obj else None,
        "model": s.model, "capacity": s.capacity, "plant_model": s.plant_model,
        "unit_number": s.unit_number,
        "plant_condition": s.plant_condition,
        "amc_status": s.amc_status, "last_visit_date": s.last_visit_date.isoformat() if s.last_visit_date else None,
        "is_active": s.is_active
    }

@router.get("/")
def list_schools(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=2000),
    search: Optional[str] = None,
    mandal_id: Optional[int] = None,
    client_id: Optional[int] = None,
    technician_id: Optional[int] = None,
    unit_number: Optional[str] = None,
    segment: Optional[str] = None,
    contract_type: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    q = db.query(School).options(
        joinedload(School.mandal),
        joinedload(School.client),
        joinedload(School.technician),
    ).filter(School.is_active == True)
    if search:
        q = q.filter(School.name.ilike(f"%{search}%"))
    if mandal_id:
        q = q.filter(School.mandal_id == mandal_id)
    if client_id:
        q = q.filter(School.client_id == client_id)
    if technician_id:
        q = q.filter(School.technician_id == technician_id)
    if unit_number:
        q = q.filter(School.unit_number == unit_number)
    if segment:
        q = q.filter(School.model == segment)
    if contract_type:
        q = q.filter(School.amc_status == contract_type)
    total = q.count()
    schools = q.offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "items": [_fmt(s) for s in schools]}

@router.post("/")
def create_school(data: SchoolCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    mandal = db.query(Mandal).filter(Mandal.name == data.mandal).first() if data.mandal else None
    s = School(name=data.name, client_id=data.client_id, model=data.model,
               mandal_id=mandal.id if mandal else None,
               capacity=data.capacity, plant_model=data.plant_model,
               unit_number=data.unit_number, amc_status=data.amc_status or "amc")
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
    s.unit_number = data.unit_number; s.amc_status = data.amc_status or s.amc_status
    db.commit(); db.refresh(s)
    return _fmt(s)

@router.delete("/{sid}")
def delete_school(sid: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    s = db.query(School).filter(School.id == sid).first()
    if not s: raise HTTPException(404, "Not found")
    s.is_active = False; db.commit()
    return {"ok": True}


@router.patch("/{sid}/coords")
def update_school_coords(sid: int, lat: float, lng: float, db: Session = Depends(get_db), _=Depends(get_current_user)):
    s = db.query(School).filter(School.id == sid).first()
    if not s: raise HTTPException(404, "Not found")
    s.latitude = lat
    s.longitude = lng
    db.commit()
    return {"ok": True, "id": sid, "latitude": lat, "longitude": lng}


@router.post("/sync-coords-from-reports")
def sync_coords_from_reports(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Update school lat/lng from the most recent field report GPS submitted at that school."""
    from ..models.field_report import FieldReport
    from sqlalchemy import func

    # Get latest GPS per school from field reports
    subq = (
        db.query(
            FieldReport.school_id,
            FieldReport.latitude,
            FieldReport.longitude,
        )
        .filter(
            FieldReport.school_id.isnot(None),
            FieldReport.latitude.isnot(None),
            FieldReport.longitude.isnot(None),
        )
        .order_by(FieldReport.school_id, FieldReport.created_at.desc())
        .all()
    )

    seen = {}
    for row in subq:
        if row.school_id not in seen:
            seen[row.school_id] = (row.latitude, row.longitude)

    updated = 0
    for school_id, (lat, lng) in seen.items():
        school = db.query(School).filter(School.id == school_id).first()
        if school:
            school.latitude = lat
            school.longitude = lng
            updated += 1

    db.commit()
    return {"ok": True, "updated": updated, "total_schools": db.query(School).count()}


from ..storage import UPLOADS_DIR

@router.post("/{sid}/stamp")
async def upload_school_stamp(sid: int, request: Request, file: UploadFile = File(...), db: Session = Depends(get_db), _=Depends(get_current_user)):
    s = db.query(School).filter(School.id == sid).first()
    if not s:
        raise HTTPException(404, "School not found")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "png"
    if ext not in ("png", "jpg", "jpeg"):
        raise HTTPException(400, "Only PNG/JPG allowed")
    stamp_dir = os.path.join(UPLOADS_DIR, "stamps")
    os.makedirs(stamp_dir, exist_ok=True)
    # Save as {school_id}.png (always PNG naming regardless)
    dest = os.path.join(stamp_dir, f"{sid}.{ext}")
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    base_url = str(request.base_url).rstrip("/")
    return {"ok": True, "school_id": sid, "stamp_url": f"{base_url}/uploads/stamps/{sid}.{ext}"}


@router.get("/{sid}/stamp")
def get_school_stamp(sid: int, request: Request):
    stamp_dir = os.path.join(UPLOADS_DIR, "stamps")
    base_url = str(request.base_url).rstrip("/")
    for ext in ("png", "jpg", "jpeg"):
        path = os.path.join(stamp_dir, f"{sid}.{ext}")
        if os.path.exists(path):
            return {"ok": True, "stamp_url": f"{base_url}/uploads/stamps/{sid}.{ext}"}
    return {"ok": False, "stamp_url": None}


@router.get("/{sid}/reports")
def school_reports(sid: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    s = db.query(School).filter(School.id == sid).first()
    if not s:
        raise HTTPException(404, "School not found")

    visits = db.query(Visit).filter(Visit.school_id == sid).order_by(Visit.visit_date.desc()).all()
    field_reports = db.query(FieldReport).filter(FieldReport.school_id == sid).order_by(FieldReport.report_date.desc()).all()
    service_reports = db.query(ServiceReport).filter(ServiceReport.school_id == sid).order_by(ServiceReport.report_date.desc()).all()

    BASE = "http://localhost:8000"

    def fmt_visit(v):
        return {
            "type": "visit", "id": v.id,
            "date": v.visit_date.isoformat() if v.visit_date else None,
            "technician": v.employee.name if v.employee else None,
            "plant_condition": v.plant_condition,
            "tds_reading": v.tds_reading, "ph_reading": v.ph_reading,
            "mcf_used": v.mcf_used, "antiscalant_used": float(v.antiscalant_used or 0),
            "filters_used": v.filters_used, "spares_used": v.spares_used,
            "work_done": v.work_done, "remarks": v.remarks,
            "visit_type": v.visit_type,
        }

    def fmt_field(r):
        photos = []
        if hasattr(r, 'work_photos'):
            photos = [{"type": p.photo_type, "url": f"{BASE}/uploads/{p.file_path}"} for p in r.work_photos]
        emp = r.employee if hasattr(r, 'employee') else None
        return {
            "type": "field_report", "id": r.id,
            "date": r.report_date.isoformat() if r.report_date else None,
            "technician": emp.name if emp else None,
            "item_installed": r.item_installed,
            "remarks": r.remarks,
            "site_condition": r.site_condition if hasattr(r, 'site_condition') else None,
            "machines_working": r.machines_working if hasattr(r, 'machines_working') else None,
            "machines_total": r.machines_total if hasattr(r, 'machines_total') else None,
            "filters_replaced": r.filters_replaced if hasattr(r, 'filters_replaced') else None,
            "verification_status": r.verification_status,
            "photos": photos,
        }

    def fmt_service(r):
        emp = r.employee if hasattr(r, 'employee') else None
        return {
            "type": "service_report", "id": r.id,
            "date": r.report_date.isoformat() if r.report_date else None,
            "technician": emp.name if emp else None,
            "problem_description": r.problem_description,
            "observation": r.observation,
            "action_taken": r.action_taken,
            "spare_parts": r.spare_parts,
            "tds_input": r.tds_input, "tds_output": r.tds_output,
            "voltage": r.voltage, "flow_rate": r.flow_rate,
            "status": r.status,
            "unit_type": r.unit_type,
        }

    all_reports = (
        [fmt_visit(v) for v in visits] +
        [fmt_field(r) for r in field_reports] +
        [fmt_service(r) for r in service_reports]
    )
    all_reports.sort(key=lambda x: x["date"] or "", reverse=True)

    return {
        "school_id": sid,
        "school_name": s.name,
        "total": len(all_reports),
        "reports": all_reports,
    }

