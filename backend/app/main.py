from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import os
from datetime import date

logger = logging.getLogger("ams")

from .database import engine, Base, SessionLocal
from . import models  # ensure all models are registered

from .routers import auth, employees, clients, schools, visits, complaints
from .routers import stock, billing, salary, attendance, tasks, travel, dashboard, mandals, field_reports
from .routers import notifications, allowances, salary_overrides
from .routers import amc_reports
from .routers import service_reports
from .routers import locations
from .routers import stock_purchases
from .routers import reorder_requests
from .routers import reports as reports_router


def _auto_generate_daily_tasks():
    """On startup: generate 5 daily tasks for every active technician if not already done today."""
    from .models.employee import Employee
    from .models.task import Task
    from .routers.tasks import _technician_rotation_schools, DAILY_DEFAULT

    db = SessionLocal()
    try:
        today = date.today()
        technicians = db.query(Employee).filter(
            Employee.role == "technician", Employee.is_active == True
        ).all()

        for emp in technicians:
            existing = db.query(Task).filter(
                Task.assigned_to_id == emp.id,
                Task.due_date == today,
                Task.status != "cancelled"
            ).count()

            if existing >= DAILY_DEFAULT:
                continue

            slots_needed = DAILY_DEFAULT - existing
            already_today = {
                t.school_id for t in db.query(Task).filter(
                    Task.assigned_to_id == emp.id,
                    Task.due_date == today,
                    Task.status != "cancelled"
                ).all() if t.school_id
            }

            eligible, _, _, _ = _technician_rotation_schools(
                db, emp.id, exclude_school_ids=already_today
            )

            for school in eligible[:slots_needed]:
                db.add(Task(
                    title=f"Visit {school.name}",
                    description="Daily scheduled visit",
                    assigned_to_id=emp.id,
                    assigned_by_id=None,
                    school_id=school.id,
                    priority="medium",
                    status="pending",
                    due_date=today
                ))

        db.commit()
        print(f"[startup] Daily tasks auto-generated for {today}")
    except Exception as e:
        print(f"[startup] Daily task generation failed: {e}")
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables
    Base.metadata.create_all(bind=engine)
    _auto_generate_daily_tasks()
    yield


app = FastAPI(title="AMS — Water Purifier Management", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Without this, Starlette's default handler returns a plain-text "Internal Server Error"
    # body — the frontend reads err.response.data.detail on every failure, so a non-JSON body
    # silently looks identical to "no detail provided" and gets mislabeled by generic catch
    # blocks (e.g. login showing "Invalid Employee ID or password" for what was really a 500).
    logger.exception(f"Unhandled error on {request.method} {request.url.path}")
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on our end — please try again."})

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
app.include_router(salary_overrides.router)
app.include_router(amc_reports.router)
app.include_router(service_reports.router)
app.include_router(locations.router)
app.include_router(stock_purchases.router)
app.include_router(reorder_requests.router)
app.include_router(reports_router.router)

@app.get("/")
def root():
    return {"status": "AMS API running", "docs": "/docs"}
