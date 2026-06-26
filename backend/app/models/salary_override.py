from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class SalaryOverride(Base):
    __tablename__ = "salary_overrides"
    id          = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    month       = Column(Integer, nullable=False)
    year        = Column(Integer, nullable=False)
    final_amount = Column(Float, nullable=False)
    note        = Column(String(300), nullable=True)
    set_by      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    employee    = relationship("Employee", foreign_keys=[employee_id])
    setter      = relationship("Employee", foreign_keys=[set_by])
