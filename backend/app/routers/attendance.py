from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
from ..database import get_db
from ..models.attendance import Attendance
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/attendance", tags=["attendance"])

class AttendanceMark(BaseModel):
    employee_id: int
    date: str
    status: str = "present"
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    notes: Optional[str] = None

@router.get("/")
def list_attendance(employee_id: int = None, month: int = None, year: int = None,
                    db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(Attendance)
    if user.role != "admin":
        q = q.filter(Attendance.employee_id == user.id)
    elif employee_id:
        q = q.filter(Attendance.employee_id == employee_id)
    if month and year:
        from sqlalchemy import extract
        q = q.filter(extract("month", Attendance.date) == month,
                     extract("year", Attendance.date) == year)
    records = q.order_by(Attendance.date.desc()).all()
    return [{
        "id": r.id, "employee_id": r.employee_id,
        "employee_name": r.employee.name if r.employee else None,
        "date": r.date.isoformat() if r.date else None,
        "status": r.status, "check_in": r.check_in, "check_out": r.check_out, "notes": r.notes
    } for r in records]

@router.post("/mark")
def mark_attendance(data: AttendanceMark, db: Session = Depends(get_db), _=Depends(get_current_user)):
    d = date.fromisoformat(data.date)
    existing = db.query(Attendance).filter(Attendance.employee_id == data.employee_id,
                                           Attendance.date == d).first()
    if existing:
        existing.status = data.status; existing.check_in = data.check_in
        existing.check_out = data.check_out; existing.notes = data.notes
        db.commit()
        return {"id": existing.id, "updated": True}
    a = Attendance(employee_id=data.employee_id, date=d, status=data.status,
                   check_in=data.check_in, check_out=data.check_out, notes=data.notes)
    db.add(a); db.commit(); db.refresh(a)
    return {"id": a.id, "updated": False}
