from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from datetime import date, timedelta, timezone, datetime

IST = timezone(timedelta(hours=5, minutes=30))
def today_ist(): return datetime.now(IST).date()
from ..database import get_db
from ..models.school import School
from ..models.employee import Employee
from ..models.visit import Visit
from ..models.complaint import Complaint
from ..models.stock import StockItem
from ..models.billing import Invoice
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/stats")
def get_stats(db: Session = Depends(get_db), _=Depends(get_current_user)):
    total_schools   = db.query(School).filter(School.is_active == True).count()
    total_employees = db.query(Employee).filter(Employee.is_active == True).count()
    open_complaints = db.query(Complaint).filter(Complaint.status == "open").count()
    today = today_ist()
    visits_month    = db.query(Visit).filter(Visit.visit_date >= date(today.year, today.month, 1)).count()
    low_stock       = db.query(StockItem).filter(StockItem.office_qty <= StockItem.min_qty, StockItem.is_active == True).count()
    pending_invoices= db.query(Invoice).filter(Invoice.status.in_(["draft", "sent"])).count()
    overdue_schools = db.query(School).filter(
        School.is_active == True,
        School.last_visit_date <= today_ist() - timedelta(days=90)
    ).count()
    return {
        "total_schools": total_schools,
        "total_employees": total_employees,
        "open_complaints": open_complaints,
        "visits_this_month": visits_month,
        "low_stock_items": low_stock,
        "pending_invoices": pending_invoices,
        "overdue_schools": overdue_schools,
    }

@router.get("/recent-visits")
def recent_visits(db: Session = Depends(get_db), _=Depends(get_current_user)):
    visits = db.query(Visit).order_by(Visit.visit_date.desc()).limit(10).all()
    return [{
        "id": v.id, "school": v.school.name if v.school else "—",
        "employee": v.employee.name if v.employee else "—",
        "date": v.visit_date.isoformat() if v.visit_date else None,
        "tds": v.tds_reading, "ph": v.ph_reading, "type": v.visit_type
    } for v in visits]

@router.get("/alerts")
def get_alerts(db: Session = Depends(get_db), _=Depends(get_current_user)):
    alerts = []
    low_stock = db.query(StockItem).filter(StockItem.office_qty <= StockItem.min_qty, StockItem.is_active == True).all()
    for item in low_stock:
        alerts.append({"type": "warning", "message": f"Low stock: {item.name} — {item.office_qty} left"})
    open_comp = db.query(Complaint).filter(Complaint.status == "open", Complaint.priority == "high").all()
    for c in open_comp:
        alerts.append({"type": "error", "message": f"High priority complaint: {c.school.name if c.school else 'Unknown'}"})
    return alerts

@router.get("/technician-coverage")
def technician_coverage(db: Session = Depends(get_db), _=Depends(get_current_user)):
    technicians = db.query(Employee).filter(
        Employee.is_active == True,
        Employee.role == "technician"
    ).order_by(Employee.employee_code).all()

    result = []
    for tech in technicians:
        mandal_names = sorted([m.name for m in tech.mandals])
        school_count = db.query(School).filter(
            School.is_active == True,
            School.technician_id == tech.id
        ).count()
        result.append({
            "id": tech.id,
            "name": tech.name,
            "employee_code": tech.employee_code,
            "mandals": mandal_names,
            "school_count": school_count,
        })
    return result
