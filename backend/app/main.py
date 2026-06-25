from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .database import engine, Base
from . import models  # ensure all models are registered

from .routers import auth, employees, clients, schools, visits, complaints
from .routers import stock, billing, salary, attendance, tasks, travel, dashboard, mandals, field_reports
from .routers import notifications, allowances

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AMS — Water Purifier Management", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files
uploads_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# Register routers
app.include_router(auth.router)
app.include_router(employees.router)
app.include_router(clients.router)
app.include_router(schools.router)
app.include_router(visits.router)
app.include_router(complaints.router)
app.include_router(stock.router)
app.include_router(billing.router)
app.include_router(salary.router)
app.include_router(attendance.router)
app.include_router(tasks.router)
app.include_router(travel.router)
app.include_router(dashboard.router)
app.include_router(mandals.router)
app.include_router(field_reports.router)
app.include_router(notifications.router)
app.include_router(allowances.router)

@app.get("/")
def root():
    return {"status": "AMS API running", "docs": "/docs"}
