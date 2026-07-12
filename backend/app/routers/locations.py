from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
from ..database import get_db
from ..models.employee_location import EmployeeLocation
from ..models.employee import Employee
from ..dependencies import get_current_user, require_admin_or_deskwork

router = APIRouter(prefix="/api/locations", tags=["locations"])

IST = timezone(timedelta(hours=5, minutes=30))
LIVE_WINDOW_SECONDS = 90  # considered "live" if pinged within this window

class LocationPing(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None

@router.post("/ping")
def ping_location(data: LocationPing, db: Session = Depends(get_db), user=Depends(get_current_user)):
    loc = db.query(EmployeeLocation).filter(EmployeeLocation.employee_id == user.id).first()
    now = datetime.utcnow()
    if loc:
        loc.latitude = data.latitude
        loc.longitude = data.longitude
        loc.accuracy = data.accuracy
        loc.updated_at = now
    else:
        loc = EmployeeLocation(
            employee_id=user.id, latitude=data.latitude,
            longitude=data.longitude, accuracy=data.accuracy, updated_at=now
        )
        db.add(loc)
    db.commit()
    return {"ok": True}

@router.get("/live")
def live_locations(db: Session = Depends(get_db), _=Depends(require_admin_or_deskwork)):
    technicians = db.query(Employee).filter(
        Employee.role == "technician", Employee.is_active == True
    ).all()
    tech_ids = [t.id for t in technicians]
    locs = {
        l.employee_id: l for l in
        db.query(EmployeeLocation).filter(EmployeeLocation.employee_id.in_(tech_ids)).all()
    }
    now = datetime.utcnow()
    results = []
    for t in technicians:
        loc = locs.get(t.id)
        entry = {
            "employee_id": t.id,
            "name": t.name,
            "employee_code": t.employee_code,
            "designation": t.designation,
            "latitude": None, "longitude": None, "accuracy": None,
            "updated_at": None, "seconds_ago": None, "is_live": False,
        }
        if loc:
            seconds_ago = (now - loc.updated_at).total_seconds()
            entry.update({
                "latitude": loc.latitude, "longitude": loc.longitude, "accuracy": loc.accuracy,
                "updated_at": (loc.updated_at.replace(tzinfo=timezone.utc)).astimezone(IST).isoformat(),
                "seconds_ago": int(seconds_ago),
                "is_live": seconds_ago <= LIVE_WINDOW_SECONDS,
            })
        results.append(entry)
    return results
