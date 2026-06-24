from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
from ..database import get_db
from ..models.billing import Invoice, InvoiceLineItem, Payment
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/billing", tags=["billing"])

class LineItemIn(BaseModel):
    description: str
    quantity: int = 1
    unit_price: float

class InvoiceCreate(BaseModel):
    client_id: Optional[int] = None
    invoice_date: str
    due_date: Optional[str] = None
    invoice_type: str = "amc"
    gst_percent: float = 18.0
    notes: Optional[str] = None
    line_items: List[LineItemIn] = []

class WorkBillCreate(BaseModel):
    school_name: str
    invoice_date: str
    gst_percent: float = 18.0
    notes: Optional[str] = None
    line_items: List[LineItemIn] = []

class PaymentCreate(BaseModel):
    amount: float
    payment_date: str
    payment_mode: str = "bank_transfer"
    reference_no: Optional[str] = None
    notes: Optional[str] = None

def _fmt(inv: Invoice):
    return {
        "id": inv.id, "invoice_no": inv.invoice_no,
        "client_id": inv.client_id,
        "client_name": inv.client.name if inv.client_id and inv.client else inv.school_name,
        "employee_id": inv.employee_id,
        "school_name": inv.school_name,
        "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
        "due_date": inv.due_date.isoformat() if inv.due_date else None,
        "invoice_type": inv.invoice_type,
        "subtotal": float(inv.subtotal or 0),
        "gst_percent": float(inv.gst_percent or 18),
        "gst_amount": float(inv.gst_amount or 0),
        "total_amount": float(inv.total_amount or 0),
        "paid_amount": float(inv.paid_amount or 0),
        "status": inv.status, "notes": inv.notes,
        "line_items": [{"description": li.description, "quantity": li.quantity,
                        "unit_price": float(li.unit_price), "total": float(li.total)}
                       for li in inv.line_items]
    }

@router.get("/")
def list_invoices(db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(Invoice)
    if user.role != "admin":
        q = q.filter(Invoice.employee_id == user.id)
    return [_fmt(inv) for inv in q.order_by(Invoice.invoice_date.desc()).all()]

@router.post("/")
def create_invoice(data: InvoiceCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    count = db.query(Invoice).count()
    inv_no = f"INV-{str(count+1).zfill(4)}"
    subtotal = sum(li.quantity * li.unit_price for li in data.line_items)
    gst = subtotal * data.gst_percent / 100
    inv = Invoice(
        invoice_no=inv_no, client_id=data.client_id,
        invoice_date=date.fromisoformat(data.invoice_date),
        due_date=date.fromisoformat(data.due_date) if data.due_date else None,
        invoice_type=data.invoice_type, gst_percent=data.gst_percent,
        subtotal=subtotal, gst_amount=gst, total_amount=subtotal+gst, notes=data.notes
    )
    db.add(inv); db.flush()
    for li in data.line_items:
        db.add(InvoiceLineItem(invoice_id=inv.id, description=li.description,
                               quantity=li.quantity, unit_price=li.unit_price,
                               total=li.quantity*li.unit_price))
    db.commit(); db.refresh(inv)
    return _fmt(inv)

@router.post("/work-bill")
def create_work_bill(data: WorkBillCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    count = db.query(Invoice).count()
    inv_no = f"WB-{str(count+1).zfill(4)}"
    subtotal = sum(li.quantity * li.unit_price for li in data.line_items)
    gst = subtotal * data.gst_percent / 100
    inv = Invoice(
        invoice_no=inv_no,
        client_id=None,
        employee_id=user.id,
        school_name=data.school_name,
        invoice_date=date.fromisoformat(data.invoice_date),
        invoice_type="work_bill",
        gst_percent=data.gst_percent,
        subtotal=subtotal, gst_amount=gst, total_amount=subtotal+gst,
        notes=data.notes, status="submitted"
    )
    db.add(inv); db.flush()
    for li in data.line_items:
        db.add(InvoiceLineItem(invoice_id=inv.id, description=li.description,
                               quantity=li.quantity, unit_price=li.unit_price,
                               total=li.quantity*li.unit_price))
    db.commit(); db.refresh(inv)
    return _fmt(inv)

@router.patch("/{inv_id}/status")
def update_status(inv_id: int, status: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.id == inv_id).first()
    if not inv: raise HTTPException(404, "Not found")
    inv.status = status; db.commit()
    return {"ok": True}

@router.post("/{inv_id}/payments")
def add_payment(inv_id: int, data: PaymentCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.id == inv_id).first()
    if not inv: raise HTTPException(404, "Not found")
    p = Payment(invoice_id=inv_id, amount=data.amount,
                payment_date=date.fromisoformat(data.payment_date),
                payment_mode=data.payment_mode, reference_no=data.reference_no, notes=data.notes)
    db.add(p)
    inv.paid_amount = float(inv.paid_amount or 0) + data.amount
    if inv.paid_amount >= float(inv.total_amount): inv.status = "paid"
    elif inv.paid_amount > 0: inv.status = "partial"
    db.commit()
    return {"ok": True, "paid_amount": float(inv.paid_amount)}
