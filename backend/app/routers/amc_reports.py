from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from ..database import get_db
from ..models.amc_report import AMCReport
from ..models.school import School
from ..models.employee import Employee

router = APIRouter(prefix="/amc-reports", tags=["amc-reports"])


class AMCReportCreate(BaseModel):
    report_no: Optional[str] = None
    complaint_no: Optional[str] = None
    school_id: Optional[int] = None
    school_name_manual: Optional[str] = None
    visit_date: str
    unit_type: Optional[str] = "AMC"
    problem_reported: Optional[str] = None
    observation_action: Optional[str] = None
    spares_required: Optional[str] = None
    plant_location: Optional[str] = None
    plant_capacity: Optional[str] = None
    design_rw_tds: Optional[str] = None
    free_chlorine_rw: Optional[str] = None
    hours_running: Optional[str] = None
    membrane_condition: Optional[str] = "OK"
    uv_lamp_condition: Optional[str] = "OK"
    raw_water_tds: Optional[str] = None
    product_water_tds: Optional[str] = None
    product_water_flow_lph: Optional[str] = None
    sensors_condition: Optional[str] = "OK"
    pre_filter_condition: Optional[str] = "OK"
    voltage: Optional[str] = None
    current_amps: Optional[str] = None
    spares_consumed: Optional[str] = None
    customer_name: Optional[str] = None
    customer_mobile: Optional[str] = None
    customer_remarks: Optional[str] = None
    service_engineer_id: Optional[int] = None
    service_engineer_name: Optional[str] = None
    problem_resolved: Optional[str] = "resolved"


def report_to_dict(r: AMCReport, db: Session):
    school_name = None
    if r.school_id:
        s = db.query(School).filter(School.id == r.school_id).first()
        school_name = s.name if s else None
    return {
        "id": r.id,
        "report_no": r.report_no,
        "complaint_no": r.complaint_no,
        "school_id": r.school_id,
        "school_name": school_name or r.school_name_manual,
        "school_name_manual": r.school_name_manual,
        "visit_date": r.visit_date,
        "unit_type": r.unit_type,
        "problem_reported": r.problem_reported,
        "observation_action": r.observation_action,
        "spares_required": r.spares_required,
        "plant_location": r.plant_location,
        "plant_capacity": r.plant_capacity,
        "design_rw_tds": r.design_rw_tds,
        "free_chlorine_rw": r.free_chlorine_rw,
        "hours_running": r.hours_running,
        "membrane_condition": r.membrane_condition,
        "uv_lamp_condition": r.uv_lamp_condition,
        "raw_water_tds": r.raw_water_tds,
        "product_water_tds": r.product_water_tds,
        "product_water_flow_lph": r.product_water_flow_lph,
        "sensors_condition": r.sensors_condition,
        "pre_filter_condition": r.pre_filter_condition,
        "voltage": r.voltage,
        "current_amps": r.current_amps,
        "spares_consumed": r.spares_consumed,
        "customer_name": r.customer_name,
        "customer_mobile": r.customer_mobile,
        "customer_remarks": r.customer_remarks,
        "service_engineer_id": r.service_engineer_id,
        "service_engineer_name": r.service_engineer_name,
        "problem_resolved": r.problem_resolved,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/")
def list_reports(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    reports = db.query(AMCReport).order_by(AMCReport.created_at.desc()).offset(skip).limit(limit).all()
    return [report_to_dict(r, db) for r in reports]


@router.get("/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db)):
    r = db.query(AMCReport).filter(AMCReport.id == report_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    return report_to_dict(r, db)


@router.post("/")
def create_report(data: AMCReportCreate, db: Session = Depends(get_db)):
    r = AMCReport(**data.dict())
    db.add(r)
    db.commit()
    db.refresh(r)
    return report_to_dict(r, db)


@router.put("/{report_id}")
def update_report(report_id: int, data: AMCReportCreate, db: Session = Depends(get_db)):
    r = db.query(AMCReport).filter(AMCReport.id == report_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    for k, v in data.dict().items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return report_to_dict(r, db)


@router.delete("/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db)):
    r = db.query(AMCReport).filter(AMCReport.id == report_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    db.delete(r)
    db.commit()
    return {"ok": True}
