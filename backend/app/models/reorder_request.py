from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class ReorderRequest(Base):
    __tablename__ = "reorder_requests"
    id             = Column(Integer, primary_key=True, index=True)
    item_id        = Column(Integer, ForeignKey("stock_items.id"), nullable=False)
    requested_qty  = Column(Integer, nullable=False)
    status         = Column(String(20), default="pending")  # pending / ordered / received / cancelled
    note           = Column(Text, nullable=True)
    requested_by   = Column(Integer, ForeignKey("employees.id"), nullable=True)
    requested_at   = Column(DateTime, default=datetime.utcnow)
    resolved_by    = Column(Integer, ForeignKey("employees.id"), nullable=True)
    resolved_at    = Column(DateTime, nullable=True)

    item      = relationship("StockItem")
    requester = relationship("Employee", foreign_keys=[requested_by])
    resolver  = relationship("Employee", foreign_keys=[resolved_by])
