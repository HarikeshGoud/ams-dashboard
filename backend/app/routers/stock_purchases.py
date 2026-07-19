import os, aiofiles
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from ..database import get_db
from ..models.stock_purchase import StockPurchase
from ..models.stock import StockItem, StockLedger
from ..models.employee import Employee
from ..dependencies import get_current_user, require_admin_or_deskwork
from .stock import _upsert_employee_stock, _upsert_employee_stock_batch, _create_batch
from ..ist_time import today_ist
from ..storage import UPLOADS_DIR

router = APIRouter(prefix="/api/stock-purchases", tags=["stock-purchases"])

class PurchaseReview(BaseModel):
    status: str  # approved / rejected
    admin_note: Optional[str] = None

class PurchaseRepay(BaseModel):
    method: str  # paid_separately / added_to_salary
    note: Optional[str] = None
    month: Optional[int] = None
    year: Optional[int] = None

def _fmt(p: StockPurchase, base_url: str = "http://localhost:8000"):
    return {
        "id": p.id,
        "employee_id": p.employee_id,
        "employee_name": p.employee.name if p.employee else None,
        "item_id": p.item_id,
        "item_name": p.item_name,
        "quantity": p.quantity,
        "amount_paid": float(p.amount_paid),
        "bill_photo_url": f"{base_url}/uploads/{p.bill_photo_path}" if p.bill_photo_path else None,
        "purchase_date": p.purchase_date.isoformat() if p.purchase_date else None,
        "status": p.status,
        "admin_note": p.admin_note,
        "reviewed_by": p.reviewed_by,
        "reviewer_name": p.reviewer.name if p.reviewer else None,
        "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "reimbursement_status": p.reimbursement_status or "unpaid",
        "reimbursed_at": p.reimbursed_at.isoformat() if p.reimbursed_at else None,
        "reimbursement_note": p.reimbursement_note,
        "reimbursed_month": p.reimbursed_month,
        "reimbursed_year": p.reimbursed_year,
    }

@router.post("/")
async def submit_purchase(request: Request, db: Session = Depends(get_db), user=Depends(get_current_user)):
    try:
        form = await request.form()
        item_id_raw = form.get("item_id")
        item_name = (form.get("item_name") or "").strip()
        quantity_raw = form.get("quantity")
        amount_raw = form.get("amount_paid")
        purchase_date_raw = form.get("purchase_date")

        if not quantity_raw or not amount_raw:
            raise HTTPException(400, "Quantity and amount paid are required")

        item_id = int(item_id_raw) if item_id_raw else None
        if item_id:
            item = db.query(StockItem).filter(StockItem.id == item_id).first()
            if not item:
                raise HTTPException(404, "Stock item not found")
            item_name = item.name
        if not item_name:
            raise HTTPException(400, "Item name is required")

        purchase_date = date.fromisoformat(purchase_date_raw) if purchase_date_raw else today_ist()

        purchase = StockPurchase(
            employee_id=user.id,
            item_id=item_id,
            item_name=item_name,
            quantity=int(quantity_raw),
            amount_paid=float(amount_raw),
            purchase_date=purchase_date,
            status="pending",
        )
        db.add(purchase); db.flush()

        bill_photo = form.get("bill_photo")
        if bill_photo is not None and hasattr(bill_photo, "filename") and bill_photo.filename:
            today = today_ist()
            os.makedirs(os.path.join(UPLOADS_DIR, "purchases", str(today.year), str(today.month)), exist_ok=True)
            ext = bill_photo.filename.rsplit(".", 1)[-1] if "." in bill_photo.filename else "jpg"
            fname = f"purchases/{today.year}/{today.month}/emp{user.id}_purchase{purchase.id}.{ext}"
            fpath = os.path.join(UPLOADS_DIR, fname)
            contents = await bill_photo.read()
            if contents:
                async with aiofiles.open(fpath, "wb") as f:
                    await f.write(contents)
                purchase.bill_photo_path = fname

        from ..models.notification import Notification
        admins = db.query(Employee).filter(Employee.role.in_(["admin", "deskwork"]), Employee.is_active == True).all()
        for admin in admins:
            db.add(Notification(
                recipient_id=admin.id,
                sender_id=user.id,
                type="STOCK_PURCHASE",
                message=f"{user.name} bought {purchase.quantity} x {item_name} for ₹{float(purchase.amount_paid):.0f} (external purchase)"
            ))

        db.commit(); db.refresh(purchase)
        base_url = str(request.base_url).rstrip("/")
        return _fmt(purchase, base_url=base_url)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Submission failed: {str(e)}")

@router.get("/")
def list_purchases(request: Request, db: Session = Depends(get_db), user=Depends(get_current_user)):
    base_url = str(request.base_url).rstrip("/")
    q = db.query(StockPurchase)
    if user.role not in ("admin", "deskwork"):
        q = q.filter(StockPurchase.employee_id == user.id)
    return [_fmt(p, base_url=base_url) for p in q.order_by(StockPurchase.created_at.desc()).all()]

@router.patch("/{purchase_id}")
def review_purchase(purchase_id: int, data: PurchaseReview, request: Request, db: Session = Depends(get_db), user=Depends(require_admin_or_deskwork)):
    if data.status not in ("approved", "rejected"):
        raise HTTPException(400, "Status must be approved or rejected")
    p = db.query(StockPurchase).filter(StockPurchase.id == purchase_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    if p.status != "pending":
        raise HTTPException(400, f"Already {p.status}")

    p.status = data.status
    p.admin_note = data.admin_note
    p.reviewed_by = user.id
    p.reviewed_at = datetime.utcnow()

    if data.status == "approved" and p.item_id:
        batch = _create_batch(
            db, item_id=p.item_id, quantity=p.quantity, source="purchase", source_ref_id=p.id,
            received_date=p.purchase_date, buy_price=p.amount_paid, person=p.employee.name if p.employee else None,
            created_by=user.id, note=f"External purchase by {p.employee.name if p.employee else 'technician'}"
        )
        batch.qty_office = 0  # went straight to the technician, never sat in the office
        _upsert_employee_stock(db, p.employee_id, p.item_id, p.quantity)
        _upsert_employee_stock_batch(db, p.employee_id, batch.id, p.quantity)
        db.add(StockLedger(
            item_id=p.item_id, transaction_type="purchase", batch_id=batch.id, quantity=p.quantity,
            employee_id=p.employee_id, buy_price=p.amount_paid,
            note=f"External purchase approved by {user.name}", created_by=user.id
        ))

    from ..models.notification import Notification
    db.add(Notification(
        recipient_id=p.employee_id,
        sender_id=user.id,
        type="STOCK_PURCHASE_REVIEWED",
        message=f"Your purchase of {p.quantity} x {p.item_name} (₹{float(p.amount_paid):.0f}) was {data.status} by {user.name}."
        + (f" Note: {data.admin_note}" if data.admin_note else "")
    ))

    db.commit(); db.refresh(p)
    base_url = str(request.base_url).rstrip("/")
    return _fmt(p, base_url=base_url)

@router.patch("/{purchase_id}/repay")
def repay_purchase(purchase_id: int, data: PurchaseRepay, request: Request, db: Session = Depends(get_db), user=Depends(require_admin_or_deskwork)):
    if data.method not in ("paid_separately", "added_to_salary"):
        raise HTTPException(400, "method must be paid_separately or added_to_salary")
    p = db.query(StockPurchase).filter(StockPurchase.id == purchase_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    if p.status != "approved":
        raise HTTPException(400, "Only approved purchases can be reimbursed")
    if p.reimbursement_status != "unpaid":
        raise HTTPException(400, f"Already {p.reimbursement_status}")

    p.reimbursement_status = data.method
    p.reimbursement_note = data.note
    p.reimbursed_at = datetime.utcnow()
    if data.method == "added_to_salary":
        p.reimbursed_month = data.month
        p.reimbursed_year = data.year

    from ..models.notification import Notification
    how = f"added to your {data.month}/{data.year} salary" if data.method == "added_to_salary" else "paid to you separately"
    db.add(Notification(
        recipient_id=p.employee_id,
        sender_id=user.id,
        type="STOCK_PURCHASE_REPAID",
        message=f"Your ₹{float(p.amount_paid):.0f} purchase of {p.item_name} was {how} by {user.name}."
        + (f" Note: {data.note}" if data.note else "")
    ))

    db.commit(); db.refresh(p)
    base_url = str(request.base_url).rstrip("/")
    return _fmt(p, base_url=base_url)
