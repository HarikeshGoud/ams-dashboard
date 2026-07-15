from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from ..database import get_db
from ..models.field_report import FieldReport
from ..models.service_report import ServiceReport
from ..models.stock import StockLedger
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.get("/stock-usage")
def stock_usage_report(date_from: date, date_to: date, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Real replacement for the old Visit-based MCF/antiscalant/plant-condition figures,
    which were always zero since nothing ever populated those Visit fields.
    Sourced from ServiceReport (real per-site outcomes) and StockLedger (real stock consumed)."""
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Access denied")

    visit_count = db.query(FieldReport).filter(
        FieldReport.report_date >= date_from, FieldReport.report_date <= date_to
    ).count()

    service_reports = db.query(ServiceReport).filter(
        ServiceReport.report_date >= date_from, ServiceReport.report_date <= date_to
    ).order_by(ServiceReport.report_date.asc()).all()
    working_count = sum(1 for s in service_reports if s.status == "PROBLEM RESOLVED")
    not_working_count = sum(1 for s in service_reports if s.status != "PROBLEM RESOLVED")

    movements = db.query(StockLedger).filter(
        StockLedger.transaction_type == "install",
        StockLedger.created_at >= date_from,
        StockLedger.created_at < date.fromordinal(date_to.toordinal() + 1),
    ).order_by(StockLedger.created_at.asc()).all()

    by_item = {}
    by_technician = {}
    for m in movements:
        item_name = m.item.name if m.item else "Unknown"
        unit = m.item.unit if m.item else ""
        by_item.setdefault(item_name, {"item_name": item_name, "unit": unit, "total_qty": 0})
        by_item[item_name]["total_qty"] += m.quantity

        emp_name = m.employee.name if m.employee else (m.person or "Unknown")
        by_technician.setdefault(emp_name, {"employee_name": emp_name, "items_used_qty": 0})
        by_technician[emp_name]["items_used_qty"] += m.quantity

    return {
        "visit_count": visit_count,
        "working_count": working_count,
        "not_working_count": not_working_count,
        "service_reports": [{
            "id": s.id,
            "report_date": s.report_date.isoformat() if s.report_date else None,
            "school_name": s.school.name if s.school else None,
            "mandal_name": s.school.mandal.name if s.school and s.school.mandal else None,
            "employee_name": s.employee.name if s.employee else None,
            "status": s.status,
            "tds_input": s.tds_input,
            "tds_output": s.tds_output,
            "complaint_no": s.complaint_no,
            "observation": s.observation,
            "customer_remarks": s.customer_remarks,
        } for s in service_reports],
        "movements": [{
            "date": m.created_at.isoformat() if m.created_at else None,
            "item_name": m.item.name if m.item else "Unknown",
            "unit": m.item.unit if m.item else "",
            "quantity": m.quantity,
            "employee_name": m.employee.name if m.employee else (m.person or "Unknown"),
            "school_dest": m.school_dest,
            "note": m.note,
        } for m in movements],
        "by_item": sorted(by_item.values(), key=lambda x: -x["total_qty"]),
        "by_technician": sorted(by_technician.values(), key=lambda x: -x["items_used_qty"]),
    }
