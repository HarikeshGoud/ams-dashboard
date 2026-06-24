from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..models.client import Client
from ..dependencies import get_current_user, require_admin

router = APIRouter(prefix="/api/clients", tags=["clients"])

class ClientCreate(BaseModel):
    name: str
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    gst_no: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    amc_start: Optional[str] = None
    amc_end: Optional[str] = None

def _fmt(c: Client):
    return {
        "id": c.id, "name": c.name, "contact_person": c.contact_person,
        "phone": c.phone, "email": c.email, "gst_no": c.gst_no,
        "address": c.address, "notes": c.notes,
        "amc_start": c.amc_start.isoformat() if c.amc_start else None,
        "amc_end": c.amc_end.isoformat() if c.amc_end else None,
        "is_active": c.is_active,
        "sites_count": len(c.schools)
    }

@router.get("/")
def list_clients(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [_fmt(c) for c in db.query(Client).filter(Client.is_active == True).all()]

@router.post("/")
def create_client(data: ClientCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    c = Client(
        name=data.name, contact_person=data.contact_name, phone=data.contact_phone,
        email=data.contact_email, gst_no=data.gst_no, address=data.address, notes=data.notes,
        amc_start=datetime.fromisoformat(data.amc_start) if data.amc_start else None,
        amc_end=datetime.fromisoformat(data.amc_end) if data.amc_end else None,
    )
    db.add(c); db.commit(); db.refresh(c)
    return _fmt(c)

@router.put("/{cid}")
def update_client(cid: int, data: ClientCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    c = db.query(Client).filter(Client.id == cid).first()
    if not c: raise HTTPException(404, "Not found")
    c.name = data.name; c.contact_person = data.contact_name; c.phone = data.contact_phone
    c.email = data.contact_email; c.gst_no = data.gst_no; c.address = data.address; c.notes = data.notes
    c.amc_start = datetime.fromisoformat(data.amc_start) if data.amc_start else None
    c.amc_end = datetime.fromisoformat(data.amc_end) if data.amc_end else None
    db.commit(); db.refresh(c)
    return _fmt(c)

@router.delete("/{cid}")
def delete_client(cid: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    c = db.query(Client).filter(Client.id == cid).first()
    if not c: raise HTTPException(404, "Not found")
    c.is_active = False; db.commit()
    return {"ok": True}
