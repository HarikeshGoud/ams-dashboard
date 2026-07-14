from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class StockPurchase(Base):
    __tablename__ = "stock_purchases"
    id              = Column(Integer, primary_key=True, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=False)
    item_id         = Column(Integer, ForeignKey("stock_items.id"), nullable=True)  # null when "Other" custom item
    item_name       = Column(String(200), nullable=False)
    quantity        = Column(Integer, nullable=False)
    amount_paid     = Column(Numeric(10, 2), nullable=False)
    bill_photo_path = Column(String(255), nullable=True)
    purchase_date   = Column(Date, nullable=False)
    status          = Column(String(20), default="pending")  # pending / approved / rejected
    admin_note      = Column(Text, nullable=True)
    reviewed_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    reviewed_at     = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", foreign_keys=[employee_id])
    reviewer = relationship("Employee", foreign_keys=[reviewed_by])
    item     = relationship("StockItem", foreign_keys=[item_id])
