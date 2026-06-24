from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Text, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class Invoice(Base):
    __tablename__ = "invoices"
    id           = Column(Integer, primary_key=True, index=True)
    invoice_no   = Column(String(50), unique=True)
    client_id    = Column(Integer, ForeignKey("clients.id"), nullable=True)
    employee_id  = Column(Integer, ForeignKey("employees.id"), nullable=True)
    school_name  = Column(String(200), nullable=True)   # for employee-generated work bills
    invoice_date = Column(Date, nullable=False)
    due_date     = Column(Date, nullable=True)
    invoice_type = Column(String(30), default="amc")
    subtotal     = Column(Numeric(12, 2), default=0)
    gst_percent  = Column(Numeric(5, 2), default=18.0)
    gst_amount   = Column(Numeric(12, 2), default=0)
    total_amount = Column(Numeric(12, 2), default=0)
    paid_amount  = Column(Numeric(12, 2), default=0)
    status       = Column(String(20), default="draft")
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    client     = relationship("Client", back_populates="invoices")
    line_items = relationship("InvoiceLineItem", back_populates="invoice", cascade="all, delete-orphan")
    payments   = relationship("Payment", back_populates="invoice", cascade="all, delete-orphan")

class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_items"
    id          = Column(Integer, primary_key=True, index=True)
    invoice_id  = Column(Integer, ForeignKey("invoices.id"))
    description = Column(String(300))
    quantity    = Column(Integer, default=1)
    unit_price  = Column(Numeric(10, 2))
    total       = Column(Numeric(10, 2))

    invoice = relationship("Invoice", back_populates="line_items")

class Payment(Base):
    __tablename__ = "payments"
    id           = Column(Integer, primary_key=True, index=True)
    invoice_id   = Column(Integer, ForeignKey("invoices.id"))
    amount       = Column(Numeric(12, 2))
    payment_date = Column(Date)
    payment_mode = Column(String(30), default="bank_transfer")
    reference_no = Column(String(100), nullable=True)
    notes        = Column(Text, nullable=True)

    invoice = relationship("Invoice", back_populates="payments")
