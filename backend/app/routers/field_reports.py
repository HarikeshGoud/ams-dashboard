import os, shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel
from ..database import get_db
from ..models.field_report import FieldReport, WorkProof
from ..models.attendance import Attendance
from ..models.task import Task
from ..dependencies import get_current_user, require_admin

router = APIRouter(prefix="/api/field-reports", tags=["field-reports"])

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")

class VerifyRequest(BaseModel):
    status: str          # verified / rejected
    note: Optional[str] = None

def _fmt_report(r: FieldReport, base_url: str = "http://localhost:8000"):
    school = r.school if hasattr(r, 'school') and r.school_id else None
    return {
        "id": r.id,
        "task_id": r.task_id,
        "employee_id": r.employee_id,
        "school_id": r.school_id,
        "report_date": r.report_date.isoformat() if r.report_date else None,
        "item_installed": r.item_installed,
        "remarks": r.remarks,
        "latitude": r.latitude,
        "longitude": r.longitude,
        "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
        "status": r.status,
        "verification_status": r.verification_status or "pending",
        "verification_note": r.verification_note,
        "verified_at": r.verified_at.isoformat() if r.verified_at else None,
        "whatsapp_sent_at": r.whatsapp_sent_at.isoformat() if r.whatsapp_sent_at else None,
        "school_name": r.school.name if r.school_id and hasattr(r, 'school') and r.school else None,
        "school_phone": r.school.phone if r.school_id and hasattr(r, 'school') and r.school else None,
        "school_contact": r.school.contact_person if r.school_id and hasattr(r, 'school') and r.school else None,
        "photos": [_fmt_photo(p, base_url) for p in r.work_photos]
    }

def _fmt_photo(p: WorkProof, base_url: str = "http://localhost:8000"):
    return {
        "id": p.id,
        "photo_type": p.photo_type,
        "url": f"{base_url}/uploads/{p.file_path}",
        "latitude": p.latitude,
        "longitude": p.longitude,
        "uploaded_at": p.uploaded_at.isoformat() if p.uploaded_at else None,
    }

@router.get("/")
def list_reports(db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(FieldReport)
    if user.role != "admin":
        q = q.filter(FieldReport.employee_id == user.id)
    reports = q.order_by(FieldReport.created_at.desc()).limit(100).all()
    return [_fmt_report(r) for r in reports]

@router.get("/employee/{emp_id}")
def reports_by_employee(emp_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role != "admin" and user.id != emp_id:
        raise HTTPException(403, "Access denied")
    reports = db.query(FieldReport).filter(FieldReport.employee_id == emp_id).order_by(FieldReport.created_at.desc()).all()
    return [_fmt_report(r) for r in reports]

@router.post("/submit")
async def submit_field_report(
    task_id: int = Form(...),
    item_installed: str = Form(""),
    remarks: str = Form(""),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    before_photo: Optional[UploadFile] = File(None),
    after_photo: Optional[UploadFile] = File(None),
    item_photo: Optional[UploadFile] = File(None),
    item_photo_1: Optional[UploadFile] = File(None),
    item_photo_2: Optional[UploadFile] = File(None),
    item_photo_3: Optional[UploadFile] = File(None),
    item_photo_4: Optional[UploadFile] = File(None),
    item_photo_5: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    today = date.today()

    # Get task info
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")

    # Create the field report
    report = FieldReport(
        task_id=task_id,
        employee_id=user.id,
        school_id=task.school_id,
        report_date=today,
        item_installed=item_installed,
        remarks=remarks,
        latitude=latitude,
        longitude=longitude,
        submitted_at=datetime.utcnow(),
        status="submitted"
    )
    db.add(report)
    db.flush()  # get report.id

    # Save photos
    os.makedirs(os.path.join(UPLOADS_DIR, str(today.year), str(today.month)), exist_ok=True)

    async def save_photo(upload: UploadFile, photo_type: str, lat, lng):
        if not upload:
            return
        ext = upload.filename.rsplit(".", 1)[-1] if "." in upload.filename else "jpg"
        fname = f"{today.year}/{today.month}/emp{user.id}_task{task_id}_{photo_type}_{report.id}.{ext}"
        fpath = os.path.join(UPLOADS_DIR, fname)
        with open(fpath, "wb") as f:
            shutil.copyfileobj(upload.file, f)
        db.add(WorkProof(
            field_report_id=report.id,
            employee_id=user.id,
            task_id=task_id,
            file_path=fname,
            photo_type=photo_type,
            latitude=lat,
            longitude=lng
        ))

    await save_photo(before_photo, "before", latitude, longitude)
    await save_photo(after_photo,  "after",  latitude, longitude)
    # item photos: item, item_1 … item_5 (one per selected item)
    for idx, photo in enumerate([item_photo, item_photo_1, item_photo_2, item_photo_3, item_photo_4, item_photo_5]):
        if photo:
            await save_photo(photo, "item" if idx == 0 else f"item_{idx}", latitude, longitude)

    # Mark task as completed
    task.status = "completed"
    task.completed_at = datetime.utcnow()

    # Auto-mark attendance as Present for today
    existing_att = db.query(Attendance).filter(
        Attendance.employee_id == user.id,
        Attendance.date == today
    ).first()
    if not existing_att:
        db.add(Attendance(
            employee_id=user.id,
            date=today,
            status="present",
            check_in=datetime.utcnow().strftime("%H:%M"),
            notes="Auto-marked via field report submission"
        ))

    db.commit()
    db.refresh(report)
    return _fmt_report(report)

@router.get("/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    r = db.query(FieldReport).filter(FieldReport.id == report_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    if user.role != "admin" and r.employee_id != user.id:
        raise HTTPException(403, "Access denied")
    return _fmt_report(r)

@router.patch("/{report_id}/verify")
def verify_report(report_id: int, req: VerifyRequest, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(FieldReport).filter(FieldReport.id == report_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    if req.status not in ("verified", "rejected", "pending"):
        raise HTTPException(400, "Status must be verified / rejected / pending")
    r.verification_status = req.status
    r.verification_note = req.note
    r.verified_at = datetime.utcnow() if req.status in ("verified", "rejected") else None

    # Sync attendance: rejected proof → mark absent; verified proof → ensure present
    if r.report_date and r.employee_id:
        att = db.query(Attendance).filter(
            Attendance.employee_id == r.employee_id,
            Attendance.date == r.report_date
        ).first()
        if req.status == "rejected":
            note_text = f"Auto: proof rejected — {req.note or 'rejected by admin'}"
            if att:
                att.status = "absent"
                att.notes = note_text
            else:
                db.add(Attendance(
                    employee_id=r.employee_id,
                    date=r.report_date,
                    status="absent",
                    notes=note_text
                ))
            # Reopen the linked task so employee can resubmit
            if r.task_id:
                from ..models.task import Task
                task = db.query(Task).filter(Task.id == r.task_id).first()
                if task:
                    task.status = "pending"
                    task.completed_at = None
        elif req.status == "verified" and att and att.status == "absent":
            att.status = "present"
            att.notes = "Auto: proof verified by admin"

    db.commit()
    db.refresh(r)
    return _fmt_report(r)

@router.patch("/{report_id}/whatsapp-sent")
def mark_whatsapp_sent(report_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(FieldReport).filter(FieldReport.id == report_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    r.whatsapp_sent_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "sent_at": r.whatsapp_sent_at.isoformat()}
