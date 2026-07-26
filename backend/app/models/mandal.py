from sqlalchemy import Column, Integer, String, Boolean
from sqlalchemy.orm import relationship
from ..database import Base

class Mandal(Base):
    __tablename__ = "mandals"
    id       = Column(Integer, primary_key=True, index=True)
    name     = Column(String(100), unique=True, nullable=False)
    district = Column(String(100), default="Nalgonda")
    # When False, technicians in this mandal get no travel allowance and lose the Travel page.
    travel_eligible = Column(Boolean, default=True)

    employees = relationship("Employee", back_populates="mandal")
    schools   = relationship("School", back_populates="mandal")
