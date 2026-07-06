import os, aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel
from ..database import get_db
from ..models.field_report import FieldReport, WorkProof
from ..models.attendance import Attendance
from ..models.task import Task
from ..dependencies import get_current_user, require_admin, require_admin_or_deskwork

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
    if user.role not in ("admin", "deskwork"):
        q = q.filter(FieldReport.employee_id == user.id)
    reports = q.order_by(FieldReport.created_at.desc()).limit(100).all()
    return [_fmt_report(r) for r in reports]

@router.get("/employee/{emp_id}")
def reports_by_employee(emp_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role != "admin" and user.id != emp_id:
        raise HTTPException(403, "Access denied")
    reports = db.query(FieldReport).filter(FieldReport.employee_id == emp_id).order_by(FieldReport.created_at.desc()).all()
    return [_fmt_report(r) for r in reports]


def _auto_mark_attendance(employee_id: int, today: date, db: Session):
    """Recalculate and upsert attendance based on today's task completion ratio.
    Only runs if no manual override exists (notes != 'manual').
    """
    # Count total tasks assigned to this employee due today
    total_tasks = db.query(Task).filter(
        Task.assigned_to_id == employee_id,
        Task.due_date == today,
    ).count()

    # Count distinct tasks submitted today via field reports
    from sqlalchemy import func
    submitted_tasks = db.query(func.count(FieldReport.id)).filter(
        FieldReport.employee_id == employee_id,
        FieldReport.report_date == today,
    ).scalar() or 0

    if total_tasks == 0:
        return  # No tasks assigned today — don't touch attendance

    # Determine status based on ratio
    if submitted_tasks >= total_tasks:
        status = "present"
        note = f"Auto: {submitted_tasks}/{total_tasks} tasks submitted (Full day)"
    elif submitted_tasks >= total_tasks / 2:
        status = "half_day"
        note = f"Auto: {submitted_tasks}/{total_tasks} tasks submitted (Half day)"
    elif submitted_tasks > 0:
        status = "absent"
        note = f"Auto: {submitted_tasks}/{total_tasks} tasks submitted (Partial — less than half)"
    else:
        status = "absent"
        note = f"Auto: 0/{total_tasks} tasks submitted"

    existing = db.query(Attendance).filter(
        Attendance.employee_id == employee_id,
        Attendance.date == today,
    ).first()

    # Don't override manually set attendance (check notes prefix)
    if existing and existing.notes and not existing.notes.startswith("Auto:"):
        return  # Manual record — leave it alone

    if existing:
        existing.status = status
        existing.notes = note
    else:
        db.add(Attendance(
            employee_id=employee_id,
            date=today,
            status=status,
            check_in=datetime.utcnow().strftime("%H:%M"),
            notes=note,
        ))
    db.commit()

@router.post("/submit")
async def submit_field_report(
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    try:
        form = await request.form()

        task_id_raw = form.get("task_id")
        if not task_id_raw:
            raise HTTPException(400, "task_id is required")
        task_id = int(task_id_raw)
        item_installed = form.get("item_installed", "")
        remarks = form.get("remarks", "")
        lat_raw = form.get("latitude")
        lng_raw = form.get("longitude")
        latitude  = float(lat_raw)  if lat_raw  else None
        longitude = float(lng_raw) if lng_raw else None

        today = date.today()

        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(404, "Task not found")

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
        db.flush()

        os.makedirs(os.path.join(UPLOADS_DIR, str(today.year), str(today.month)), exist_ok=True)

        for key, value in form.multi_items():
            if not hasattr(value, "filename") or not value.filename:
                continue
            photo_type = key  # field name becomes photo_type (e.g. before_photo_0, extra_photo_0)
            ext = value.filename.rsplit(".", 1)[-1] if value.filename and "." in value.filename else "jpg"
            fname = f"{today.year}/{today.month}/emp{user.id}_task{task_id}_{photo_type}_{report.id}.{ext}"
            fpath = os.path.join(UPLOADS_DIR, fname)
            try:
                contents = await value.read()
                if contents:
                    async with aiofiles.open(fpath, "wb") as f:
                        await f.write(contents)
                    db.add(WorkProof(
                        field_report_id=report.id,
                        employee_id=user.id,
                        task_id=task_id,
                        file_path=fname,
                        photo_type=photo_type,
                        latitude=latitude,
                        longitude=longitude
                    ))
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(500, f"Photo save failed ({photo_type}): {e}")

        task.status = "submitted"
        db.commit()

        _auto_mark_attendance(user.id, today, db)

        if latitude and longitude:
            try:
                from .travel import auto_trip_from_reports
                await auto_trip_from_reports(
                    trip_date=str(today), employee_id=user.id, db=db, user=user
                )
            except Exception:
                pass

        db.refresh(report)
        base_url = str(request.base_url).rstrip("/")
        return _fmt_report(report, base_url=base_url)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Submission failed: {str(e)}")

@router.get("/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    r = db.query(FieldReport).filter(FieldReport.id == report_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    if user.role != "admin" and r.employee_id != user.id:
        raise HTTPException(403, "Access denied")
    return _fmt_report(r)

@router.patch("/{report_id}/verify")
def verify_report(report_id: int, req: VerifyRequest, db: Session = Depends(get_db), _=Depends(require_admin_or_deskwork)):
    r = db.query(FieldReport).filter(FieldReport.id == report_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    if req.status not in ("verified", "rejected", "pending"):
        raise HTTPException(400, "Status must be verified / rejected / pending")
    r.verification_status = req.status
    r.verification_note = req.note
    r.verified_at = datetime.utcnow() if req.status in ("verified", "rejected") else None

    # Sync task status and attendance based on verification result
    if r.task_id:
        from ..models.task import Task
        task = db.query(Task).filter(Task.id == r.task_id).first()
        if task:
            if req.status == "verified":
                task.status = "completed"
                task.completed_at = datetime.utcnow()
                # Stamp school.last_visit_date on verification
                if task.school_id:
                    from ..models.school import School
                    school = db.query(School).filter(School.id == task.school_id).first()
                    if school:
                        visit_date = task.due_date if task.due_date else datetime.utcnow().date()
                        if not school.last_visit_date or visit_date >= school.last_visit_date:
                            school.last_visit_date = visit_date
            elif req.status == "rejected":
                task.status = "pending"
                task.completed_at = None

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
        elif req.status == "verified":
            if att:
                att.status = "present"
                att.notes = "Auto: proof verified by admin"
            else:
                db.add(Attendance(
                    employee_id=r.employee_id,
                    date=r.report_date,
                    status="present",
                    notes="Auto: proof verified by admin"
                ))

    db.commit()
    db.refresh(r)
    return _fmt_report(r)

@router.patch("/{report_id}/whatsapp-sent")
def mark_whatsapp_sent(report_id: int, db: Session = Depends(get_db), _=Depends(require_admin_or_deskwork)):
    r = db.query(FieldReport).filter(FieldReport.id == report_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    r.whatsapp_sent_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "sent_at": r.whatsapp_sent_at.isoformat()}
