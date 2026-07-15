from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, ForeignKey, Text, Numeric, UniqueConstraint
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

    ledger_entries   = relationship("StockLedger", back_populates="item")
    employee_stocks  = relationship("EmployeeStock", back_populates="item")

class StockLedger(Base):
    __tablename__ = "stock_ledger"
    id               = Column(Integer, primary_key=True, index=True)
    item_id          = Column(Integer, ForeignKey("stock_items.id"))
    transaction_type = Column(String(20))  # receive / transfer / issue / distribute / return / install / purchase
    batch_id         = Column(Integer, ForeignKey("stock_batches.id"), nullable=True)  # null for rows that predate batch tracking
    quantity         = Column(Integer, nullable=False)
    person           = Column(String(100), nullable=True)
    employee_id      = Column(Integer, ForeignKey("employees.id"), nullable=True)  # technician for distribute/return/install
    buy_price        = Column(Numeric(10, 2), nullable=True)
    logistics1       = Column(Numeric(10, 2), nullable=True)
    logistics2       = Column(Numeric(10, 2), nullable=True)
    school_dest      = Column(String(300), nullable=True)
    note             = Column(Text, nullable=True)
    created_by       = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    inspected        = Column(Boolean, default=False)
    inspected_by     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    inspected_at     = Column(DateTime, nullable=True)

    item     = relationship("StockItem", back_populates="ledger_entries")
    employee = relationship("Employee", foreign_keys=[employee_id])
    creator  = relationship("Employee", foreign_keys=[created_by])
    inspector= relationship("Employee", foreign_keys=[inspected_by])
    batch    = relationship("StockBatch")

class StockBatch(Base):
    """A single receipt/purchase event for an item, tracked separately so units
    stay traceable back to their origin through distribution and installation."""
    __tablename__ = "stock_batches"
    id            = Column(Integer, primary_key=True, index=True)
    item_id       = Column(Integer, ForeignKey("stock_items.id"), nullable=False)
    batch_no      = Column(String(30), unique=True, nullable=False)
    source        = Column(String(20), nullable=False)  # receive / purchase / legacy
    source_ref_id = Column(Integer, nullable=True)
    qty_received  = Column(Integer, nullable=False)
    qty_office    = Column(Integer, default=0)  # remaining, unconsumed, sitting in central office
    unit_cost     = Column(Numeric(10, 2), nullable=True)
    buy_price     = Column(Numeric(10, 2), nullable=True)
    person        = Column(String(100), nullable=True)
    received_date = Column(Date, nullable=False)
    note          = Column(Text, nullable=True)
    created_by    = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)

    item = relationship("StockItem")

class EmployeeStockBatch(Base):
    """Which batches a technician currently holds, and how much of each."""
    __tablename__ = "employee_stock_batches"
    id          = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    batch_id    = Column(Integer, ForeignKey("stock_batches.id"), nullable=False)
    qty_in_hand = Column(Integer, default=0)
    updated_at  = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("employee_id", "batch_id", name="uq_emp_batch"),)

    employee = relationship("Employee", foreign_keys=[employee_id])
    batch    = relationship("StockBatch")

class EmployeeStock(Base):
    """Current stock held by each technician (running balance)."""
    __tablename__ = "employee_stock"
    id          = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    item_id     = Column(Integer, ForeignKey("stock_items.id"), nullable=False)
    qty_in_hand = Column(Integer, default=0)
    updated_at  = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("employee_id", "item_id", name="uq_emp_item"),)

    employee = relationship("Employee", foreign_keys=[employee_id])
    item     = relationship("StockItem", back_populates="employee_stocks")

class StockUsage(Base):
    __tablename__ = "stock_usages"
    id       = Column(Integer, primary_key=True, index=True)
    visit_id = Column(Integer, ForeignKey("visits.id"))
    item_id  = Column(Integer, ForeignKey("stock_items.id"))
    quantity = Column(Integer, nullable=False)
