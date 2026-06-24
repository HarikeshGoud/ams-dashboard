from sqlalchemy import Column, Integer, String, Date, Time, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class Attendance(Base):
    __tablename__ = "attendance"
    id          = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"))
    date        = Column(Date, nullable=False)
    status      = Column(String(20), default="present")  # present/absent/half_day/leave
    check_in    = Column(String(10), nullable=True)
    check_out   = Column(String(10), nullable=True)
    notes       = Column(Text, nullable=True)
    marked_by          = Column(Integer, ForeignKey("employees.id"), nullable=True)
    tasks_assigned     = Column(Integer, nullable=True)     # for auto-calculation
    tasks_completed    = Column(Integer, nullable=True)
    attendance_value   = Column(Float, nullable=True)       # 1.0=full, 0.5=half, fraction
    attendance_label   = Column(String(20), nullable=True)  # "Full Day", "Half Day", "2/5"
    created_at         = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="attendance", foreign_keys=[employee_id])
