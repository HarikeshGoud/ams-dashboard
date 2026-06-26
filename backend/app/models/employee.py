from sqlalchemy import Column, Integer, String, Boolean, Date, Float, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .employee_mandal import employee_mandals

class Employee(Base):
    __tablename__ = "employees"
    id             = Column(Integer, primary_key=True, index=True)
    employee_code  = Column(String(20), unique=True, nullable=True)  # e.g. EMP001
    name           = Column(String(100), nullable=False)
    phone          = Column(String(15), unique=True, nullable=True)
    email          = Column(String(100), unique=True, nullable=True)
    role           = Column(String(20), default="technician")  # admin / technician
    designation    = Column(String(100), nullable=True)
    mandal_id      = Column(Integer, ForeignKey("mandals.id"), nullable=True)
    joining_date   = Column(Date, nullable=True)
    is_active      = Column(Boolean, default=True)
    password_hash  = Column(String(255), nullable=True)
    base_salary    = Column(Float, default=10000.0, nullable=True)
    bike_mileage   = Column(Float, default=45.0, nullable=True)   # km per litre
    home_location  = Column(String(300), nullable=True)           # home address text
    home_lat       = Column(Float, nullable=True)                 # home GPS lat
    home_lng       = Column(Float, nullable=True)                 # home GPS lng

    mandal         = relationship("Mandal", back_populates="employees")
    mandals        = relationship("Mandal", secondary="employee_mandals", backref="technicians")
    visits         = relationship("Visit", back_populates="employee")
    attendance     = relationship("Attendance", back_populates="employee", foreign_keys="Attendance.employee_id")
    tasks          = relationship("Task", back_populates="assigned_to", foreign_keys="Task.assigned_to_id")
    travel_trips   = relationship("TravelTrip", back_populates="employee", foreign_keys="TravelTrip.employee_id")
    salary_records = relationship("SalaryRecord", back_populates="employee")
