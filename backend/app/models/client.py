from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class Client(Base):
    __tablename__ = "clients"
    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String(200), nullable=False)
    contact_person = Column(String(100), nullable=True)
    phone          = Column(String(15), nullable=True)
    email          = Column(String(100), nullable=True)
    address        = Column(Text, nullable=True)
    gst_no         = Column(String(20), nullable=True)
    amc_start      = Column(DateTime, nullable=True)
    amc_end        = Column(DateTime, nullable=True)
    notes          = Column(Text, nullable=True)
    is_active      = Column(Boolean, default=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    schools  = relationship("School", back_populates="client")
    invoices = relationship("Invoice", back_populates="client")
