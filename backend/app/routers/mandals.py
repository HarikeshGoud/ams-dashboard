from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.mandal import Mandal
from ..dependencies import get_current_user, require_admin_or_deskwork

router = APIRouter(prefix="/api/mandals", tags=["mandals"])

@router.get("/")
def list_mandals(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [{
        "id": m.id, "name": m.name, "district": m.district,
        "state": m.state or "Telangana",
        "travel_eligible": True if m.travel_eligible is None else bool(m.travel_eligible),
    } for m in db.query(Mandal).order_by(Mandal.name).all()]


class MandalUpdate(BaseModel):
    travel_eligible: Optional[bool] = None
    state: Optional[str] = None

@router.patch("/{mandal_id}")
def update_mandal(mandal_id: int, data: MandalUpdate, db: Session = Depends(get_db),
                  user=Depends(require_admin_or_deskwork)):
    m = db.query(Mandal).filter(Mandal.id == mandal_id).first()
    if not m:
        raise HTTPException(404, "Mandal not found")
    if data.travel_eligible is not None:
        m.travel_eligible = data.travel_eligible
    if data.state is not None:
        m.state = data.state
    db.commit()
    return {"id": m.id, "name": m.name, "state": m.state, "travel_eligible": bool(m.travel_eligible)}


class StateEligibility(BaseModel):
    state: str
    travel_eligible: bool

@router.post("/state-eligibility")
def set_state_eligibility(data: StateEligibility, db: Session = Depends(get_db),
                          user=Depends(require_admin_or_deskwork)):
    """Bulk-set travel eligibility for every mandal in a state."""
    ms = db.query(Mandal).filter(Mandal.state == data.state).all()
    for m in ms:
        m.travel_eligible = data.travel_eligible
    db.commit()
    return {"state": data.state, "travel_eligible": data.travel_eligible, "count": len(ms)}
