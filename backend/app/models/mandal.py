from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from ..database import Base

class Mandal(Base):
    __tablename__ = "mandals"
    id       = Column(Integer, primary_key=True, index=True)
    name     = Column(String(100), unique=True, nullable=False)
    district = Column(String(100), default="Nalgonda")

    employees = relationship("Employee", back_populates="mandal")
    schools   = relationship("School", back_populates="mandal")
