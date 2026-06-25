from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date
import calendar
from ..database import get_db
from ..models.attendance import Attendance
from ..models.employee import Employee
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/attendance", tags=["attendance"])

class AttendanceMark(BaseModel):
    employee_id: int
    date: str
    status: str = "present"
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    notes: Optional[str] = None

def _fmt(r: Attendance):
    return {
        "id": r.id, "employee_id": r.employee_id,
        "employee_name": r.employee.name if r.employee else None,
        "date": r.date.isoformat() if r.date else None,
        "status": r.status, "check_in": r.check_in, "check_out": r.check_out,
        "notes": r.notes,
        "tasks_assigned": getattr(r, "tasks_assigned", None),
        "tasks_completed": getattr(r, "tasks_completed", None),
        "attendance_value": getattr(r, "attendance_value", None),
        "attendance_label": getattr(r, "attendance_label", None),
    }

@router.get("/monthly-summary")
def monthly_summary(month: int, year: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Per-technician attendance summary for a month with calculated salary. Admin/deskwork only."""
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Not authorized")

    from sqlalchemy import extract
    technicians = db.query(Employee).filter(
        Employee.role == "technician", Employee.is_active == True
    ).all()

    # Mon-Sat = 6-day working week for field workers
    working_days = sum(
        1 for d in range(1, calendar.monthrange(year, month)[1] + 1)
        if date(year, month, d).weekday() < 6
    )

    result = []
    for emp in technicians:
        records = db.query(Attendance).filter(
            Attendance.employee_id == emp.id,
            extract("month", Attendance.date) == month,
            extract("year", Attendance.date) == year
        ).all()

        present  = sum(1 for r in records if r.status == "present")
        half_day = sum(1 for r in records if r.status == "half_day")
        absent   = sum(1 for r in records if r.status == "absent")
        leave    = sum(1 for r in records if r.status == "leave")

        effective   = present + half_day * 0.5
        base        = float(getattr(emp, "base_salary", None) or 10000)
        pct         = round(effective / working_days * 100, 1) if working_days else 0
        calc_salary = round(base * effective / working_days, 2) if working_days else 0

        result.append({
            "employee_id":       emp.id,
            "employee_name":     emp.name,
            "employee_code":     emp.employee_code,
            "base_salary":       base,
            "working_days":      working_days,
            "present":           present,
            "half_day":          half_day,
            "absent":            absent,
            "leave":             leave,
            "effective_days":    effective,
            "attendance_pct":    pct,
            "calculated_salary": calc_salary,
        })

    return {"month": month, "year": year, "working_days": working_days, "technicians": result}

@router.get("/my-summary")
def my_monthly_summary(month: int, year: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Technician's own monthly summary with salary calculation."""
    from sqlalchemy import extract
    emp = db.query(Employee).filter(Employee.id == user.id).first()
    records = db.query(Attendance).filter(
        Attendance.employee_id == user.id,
        extract("month", Attendance.date) == month,
        extract("year", Attendance.date) == year
    ).all()

    working_days = sum(
        1 for d in range(1, calendar.monthrange(year, month)[1] + 1)
        if date(year, month, d).weekday() < 6
    )
    present  = sum(1 for r in records if r.status == "present")
    half_day = sum(1 for r in records if r.status == "half_day")
    absent   = sum(1 for r in records if r.status == "absent")
    leave    = sum(1 for r in records if r.status == "leave")
    effective = present + half_day * 0.5
    base = float(getattr(emp, "base_salary", None) or 10000)
    pct = round(effective / working_days * 100, 1) if working_days else 0
    calc_salary = round(base * effective / working_days, 2) if working_days else 0

    return {
        "month": month, "year": year,
        "base_salary": base, "working_days": working_days,
        "present": present, "half_day": half_day, "absent": absent, "leave": leave,
        "effective_days": effective, "attendance_pct": pct, "calculated_salary": calc_salary,
        "daily_records": [_fmt(r) for r in sorted(records, key=lambda r: r.date)]
    }

@router.get("/")
def list_attendance(employee_id: int = None, month: int = None, year: int = None,
                    db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(Attendance)
    if user.role == "technician":
        q = q.filter(Attendance.employee_id == user.id)
    elif employee_id:
        q = q.filter(Attendance.employee_id == employee_id)
    if month and year:
        from sqlalchemy import extract
        q = q.filter(extract("month", Attendance.date) == month,
                     extract("year", Attendance.date) == year)
    return [_fmt(r) for r in q.order_by(Attendance.date.desc()).all()]

@router.post("/mark")
def mark_attendance(data: AttendanceMark, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role == "technician" and data.employee_id != user.id:
        raise HTTPException(403, "Cannot mark attendance for other employees")
    d = date.fromisoformat(data.date)
    existing = db.query(Attendance).filter(
        Attendance.employee_id == data.employee_id, Attendance.date == d
    ).first()
    if existing:
        existing.status = data.status; existing.check_in = data.check_in
        existing.check_out = data.check_out; existing.notes = data.notes
        db.commit()
        return {"id": existing.id, "updated": True}
    a = Attendance(employee_id=data.employee_id, date=d, status=data.status,
                   check_in=data.check_in, check_out=data.check_out, notes=data.notes)
    db.add(a); db.commit(); db.refresh(a)
    return {"id": a.id, "updated": False}

@router.patch("/base-salary/{emp_id}")
def update_base_salary(emp_id: int, salary: float, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role not in ("admin",):
        raise HTTPException(403, "Admin only")
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")
    emp.base_salary = salary
    db.commit()
    return {"employee_id": emp_id, "base_salary": salary}
