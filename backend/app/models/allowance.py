from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class AllowanceRequest(Base):
    __tablename__ = "allowance_requests"
    id          = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    amount      = Column(Numeric(10, 2), nullable=False)
    reason      = Column(String(300), nullable=False)
    date        = Column(Date, nullable=False)
    status      = Column(String(20), default="pending")  # pending / granted / revoked
    admin_note  = Column(Text, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    employee   = relationship("Employee", foreign_keys=[employee_id])
    reviewer   = relationship("Employee", foreign_keys=[reviewed_by])
