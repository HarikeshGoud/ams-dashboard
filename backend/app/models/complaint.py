from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class Complaint(Base):
    __tablename__ = "complaints"
    id               = Column(Integer, primary_key=True, index=True)
    school_id        = Column(Integer, ForeignKey("schools.id"))
    reported_by      = Column(String(100), nullable=True)
    phone            = Column(String(15), nullable=True)
    issue_type       = Column(String(100), nullable=True)
    description      = Column(Text, nullable=True)
    priority         = Column(String(20), default="medium")
    status           = Column(String(20), default="open")
    assigned_to      = Column(Integer, ForeignKey("employees.id"), nullable=True)
    reported_at      = Column(DateTime, default=datetime.utcnow)
    resolved_at      = Column(DateTime, nullable=True)
    resolution_notes = Column(Text, nullable=True)

    school = relationship("School", back_populates="complaints")
