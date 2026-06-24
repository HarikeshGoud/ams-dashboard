from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date
from ..database import get_db
from ..models.travel import TravelTrip
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/travel", tags=["travel"])

class TripCreate(BaseModel):
    employee_id: int
    trip_date: str
    from_location: str
    to_location: str
    purpose: Optional[str] = None
    distance_km: Optional[float] = None
    transport_mode: str = "bike"
    amount: float = 0
    notes: Optional[str] = None

def _fmt(t: TravelTrip):
    return {
        "id": t.id, "employee_id": t.employee_id,
        "employee_name": t.employee.name if t.employee else None,
        "trip_date": t.trip_date.isoformat() if t.trip_date else None,
        "from_location": t.from_location, "to_location": t.to_location,
        "purpose": t.purpose, "distance_km": float(t.distance_km or 0),
        "transport_mode": t.transport_mode, "amount": float(t.amount or 0),
        "status": t.status
    }

@router.get("/")
def list_trips(employee_id: int = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(TravelTrip)
    if user.role != "admin":
        q = q.filter(TravelTrip.employee_id == user.id)
    elif employee_id:
        q = q.filter(TravelTrip.employee_id == employee_id)
    return [_fmt(t) for t in q.order_by(TravelTrip.trip_date.desc()).all()]

@router.post("/")
def create_trip(data: TripCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    t = TravelTrip(**{k: v for k, v in data.model_dump().items() if k != "trip_date"},
                   trip_date=date.fromisoformat(data.trip_date))
    db.add(t); db.commit(); db.refresh(t)
    return _fmt(t)

@router.patch("/{tid}/approve")
def approve_trip(tid: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    t = db.query(TravelTrip).filter(TravelTrip.id == tid).first()
    if not t: raise HTTPException(404, "Not found")
    t.status = "approved"; t.approved_by = user.id
    db.commit()
    return _fmt(t)

@router.delete("/{tid}")
def delete_trip(tid: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    t = db.query(TravelTrip).filter(TravelTrip.id == tid).first()
    if not t: raise HTTPException(404, "Not found")
    db.delete(t); db.commit()
    return {"ok": True}
