from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class Task(Base):
    __tablename__ = "tasks"
    id             = Column(Integer, primary_key=True, index=True)
    title          = Column(String(300), nullable=False)
    description    = Column(Text, nullable=True)
    assigned_to_id = Column(Integer, ForeignKey("employees.id"))
    assigned_by_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    school_id      = Column(Integer, ForeignKey("schools.id"), nullable=True)
    priority       = Column(String(20), default="medium")
    status         = Column(String(20), default="pending")
    due_date       = Column(Date, nullable=True)
    completed_at   = Column(DateTime, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    assigned_to = relationship("Employee", back_populates="tasks", foreign_keys=[assigned_to_id])
    school      = relationship("School", foreign_keys=[school_id], lazy="joined")
