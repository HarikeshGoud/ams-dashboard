from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.notification import Notification
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

def _fmt(n: Notification):
    return {
        "id": n.id, "type": n.type, "message": n.message,
        "is_read": n.is_read,
        "sender_name": n.sender.name if n.sender else None,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }

@router.get("/")
def list_notifications(db: Session = Depends(get_db), user=Depends(get_current_user)):
    notifs = db.query(Notification).filter(
        Notification.recipient_id == user.id
    ).order_by(Notification.created_at.desc()).limit(50).all()
    return [_fmt(n) for n in notifs]

@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user=Depends(get_current_user)):
    count = db.query(Notification).filter(
        Notification.recipient_id == user.id,
        Notification.is_read == False
    ).count()
    return {"count": count}

@router.patch("/{nid}/read")
def mark_read(nid: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    n = db.query(Notification).filter(Notification.id == nid, Notification.recipient_id == user.id).first()
    if not n: raise HTTPException(404, "Not found")
    n.is_read = True; db.commit()
    return {"ok": True}

@router.patch("/mark-all-read")
def mark_all_read(db: Session = Depends(get_db), user=Depends(get_current_user)):
    db.query(Notification).filter(
        Notification.recipient_id == user.id, Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"ok": True}
