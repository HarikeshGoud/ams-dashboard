from sqlalchemy import Column, Integer, ForeignKey, Table
from ..database import Base

employee_mandals = Table(
    "employee_mandals", Base.metadata,
    Column("employee_id", Integer, ForeignKey("employees.id"), primary_key=True),
    Column("mandal_id", Integer, ForeignKey("mandals.id"), primary_key=True),
)
