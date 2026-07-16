from sqlalchemy import Column, Integer, String, Boolean, Float, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class School(Base):
    __tablename__ = "schools"
    id                = Column(Integer, primary_key=True, index=True)
    name              = Column(String(300), nullable=False)
    udise_code        = Column(String(50), unique=True, nullable=True)
    mandal_id         = Column(Integer, ForeignKey("mandals.id"), nullable=True)
    client_id         = Column(Integer, ForeignKey("clients.id"), nullable=True)
    address           = Column(Text, nullable=True)
    latitude          = Column(Float, nullable=True)
    longitude         = Column(Float, nullable=True)
    contact_person    = Column(String(100), nullable=True)
    phone             = Column(String(15), nullable=True)
    unit_number       = Column(String(20), nullable=True)
    technician_id     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    model             = Column(String(20), default="normal")  # normal / temple / village
    capacity          = Column(String(50), nullable=True)
    plant_model       = Column(String(100), nullable=True)
    plant_condition   = Column(String(20), default="working")  # working / not_working
    total_purifiers   = Column(Integer, default=1)
    working_purifiers = Column(Integer, default=1)
    amc_status        = Column(String(20), default="active")
    amc_expiry        = Column(Date, nullable=True)
    installation_date = Column(Date, nullable=True)
    last_visit_date   = Column(Date, nullable=True)
    is_active         = Column(Boolean, default=True)
    created_at        = Column(DateTime, default=datetime.utcnow)

    mandal     = relationship("Mandal", back_populates="schools")
    client     = relationship("Client", back_populates="schools")
    technician = relationship("Employee", foreign_keys=[technician_id])
    visits     = relationship("Visit", back_populates="school")
    complaints = relationship("Complaint", back_populates="school")
