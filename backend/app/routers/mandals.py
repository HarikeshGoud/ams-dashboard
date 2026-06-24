from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.mandal import Mandal
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/mandals", tags=["mandals"])

@router.get("/")
def list_mandals(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [{"id": m.id, "name": m.name, "district": m.district} for m in db.query(Mandal).all()]
