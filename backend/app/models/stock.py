from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class StockItem(Base):
    __tablename__ = "stock_items"
    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(200), nullable=False)
    category    = Column(String(100), nullable=True)
    unit        = Column(String(20), default="pcs")
    office_qty  = Column(Integer, default=0)
    min_qty     = Column(Integer, default=5)
    unit_cost   = Column(Numeric(10, 2), default=0)
    is_active   = Column(Boolean, default=True)

    ledger_entries = relationship("StockLedger", back_populates="item")

class StockLedger(Base):
    __tablename__ = "stock_ledger"
    id               = Column(Integer, primary_key=True, index=True)
    item_id          = Column(Integer, ForeignKey("stock_items.id"))
    transaction_type = Column(String(20))  # receive / transfer / issue
    quantity         = Column(Integer, nullable=False)
    person           = Column(String(100), nullable=True)
    buy_price        = Column(Numeric(10, 2), nullable=True)
    logistics1       = Column(Numeric(10, 2), nullable=True)
    logistics2       = Column(Numeric(10, 2), nullable=True)
    school_dest      = Column(String(300), nullable=True)
    note             = Column(Text, nullable=True)
    created_by       = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)

    item = relationship("StockItem", back_populates="ledger_entries")

class StockUsage(Base):
    __tablename__ = "stock_usages"
    id       = Column(Integer, primary_key=True, index=True)
    visit_id = Column(Integer, ForeignKey("visits.id"))
    item_id  = Column(Integer, ForeignKey("stock_items.id"))
    quantity = Column(Integer, nullable=False)
