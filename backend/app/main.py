from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging

logger = logging.getLogger("ams")

# today_ist, SessionLocal and os were imported here only for the startup task generator that
# was removed above — see the note there before adding anything like it back.
from .database import engine, Base
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
from .routers import data_health
from .routers import mapping
from .routers import consumption


# Daily tasks are NOT generated here any more. Do not put that back.
#
# There used to be an _auto_generate_daily_tasks() call in the lifespan below, so every time
# this process started it handed each active technician five visits. Startup is not once a day:
# it happens on every deploy, and whenever Azure recycles the app for idle timeout, scaling or
# platform maintenance. Three deploys in one evening meant three generation runs.
#
# It only ever added. Nothing expired or cancelled the tasks nobody got to, so the backlog grew
# on its own — one technician reached 107 pending, 102 of them overdue, and because a school
# with an open task was still eligible the next day, the same school was re-issued up to three
# times. 82% of all tasks in the database were created this way (the startup job left
# assigned_by_id NULL; a human pressing the button stamps their own id).
#
# Tasks now come only from POST /api/tasks/generate-daily — the "Generate Daily Tasks" button
# on the admin and deskwork Tasks pages — or from assigning one by hand. If scheduled
# generation is wanted, schedule it ONCE A DAY against that endpoint; don't tie it to boot.


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables
    Base.metadata.create_all(bind=engine)
    # create_all adds missing TABLES but never a missing COLUMN on an existing one, so a
    # new field would deploy green and then 500 on every query that touches it. This adds
    # the handful of known-missing columns, additively and idempotently.
    from .schema_guard import ensure_columns
    ensure_columns(engine)
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
from .storage import UPLOADS_DIR
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

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
app.include_router(data_health.router)
app.include_router(mapping.router)
app.include_router(consumption.router)

@app.get("/")
def root():
    return {"status": "AMS API running", "docs": "/docs"}
