from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..models.complaint import Complaint
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/complaints", tags=["complaints"])

class ComplaintCreate(BaseModel):
    school_id: int
    reported_by: Optional[str] = None
    phone: Optional[str] = None
    issue_type: Optional[str] = None
    description: Optional[str] = None
    priority: str = "medium"

def _fmt(c: Complaint):
    return {
        "id": c.id, "school_id": c.school_id,
        "school_name": c.school.name if c.school else None,
        "reported_by": c.reported_by, "issue_type": c.issue_type,
        "description": c.description, "priority": c.priority,
        "status": c.status, "assigned_to": c.assigned_to,
        "reported_at": c.reported_at.isoformat() if c.reported_at else None,
        "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
    }

@router.get("/")
def list_complaints(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [_fmt(c) for c in db.query(Complaint).order_by(Complaint.reported_at.desc()).all()]

@router.post("/")
def create_complaint(data: ComplaintCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    c = Complaint(**data.model_dump())
    db.add(c); db.commit(); db.refresh(c)
    return _fmt(c)

@router.patch("/{cid}/resolve")
def resolve_complaint(cid: int, notes: str = "", db: Session = Depends(get_db), _=Depends(get_current_user)):
    c = db.query(Complaint).filter(Complaint.id == cid).first()
    if not c: raise HTTPException(404, "Not found")
    c.status = "resolved"; c.resolved_at = datetime.utcnow(); c.resolution_notes = notes
    db.commit(); db.refresh(c)
    return _fmt(c)

@router.delete("/{cid}")
def delete_complaint(cid: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    c = db.query(Complaint).filter(Complaint.id == cid).first()
    if not c: raise HTTPException(404, "Not found")
    db.delete(c); db.commit()
    return {"ok": True}
