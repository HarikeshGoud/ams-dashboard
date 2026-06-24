from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class SalaryRecord(Base):
    __tablename__ = "salary_records"
    id           = Column(Integer, primary_key=True, index=True)
    employee_id  = Column(Integer, ForeignKey("employees.id"))
    month        = Column(Integer)
    year         = Column(Integer)
    basic_salary = Column(Numeric(10, 2), default=0)
    allowances   = Column(Numeric(10, 2), default=0)
    deductions   = Column(Numeric(10, 2), default=0)
    net_salary   = Column(Numeric(10, 2), default=0)
    paid_amount  = Column(Numeric(10, 2), default=0)
    payment_date = Column(Date, nullable=True)
    payment_mode = Column(String(50), nullable=True)
    status       = Column(String(20), default="pending")
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="salary_records")
