# AMS Dashboard — Team Guide

## Setup (do this once)

1. Install Git: https://git-scm.com
2. Install Node.js: https://nodejs.org
3. Install Python 3.11+: https://python.org

Clone the repo:
```
git clone https://github.com/HarikeshGoud/ams-dashboard.git
cd ams-dashboard
```

Install frontend:
```
cd frontend
npm install
```

Install backend:
```
cd backend
pip install -r requirements.txt
```

Create backend `.env` file (copy this exactly):
```
DATABASE_URL=postgresql://neondb_owner:npg_uKZr0B6gyCeS@ep-fancy-wildflower-aokefnrg.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
SECRET_KEY=ams-super-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

---

## Every day — Starting work

**Terminal 1 — Backend:**
```
cd ams-dashboard/backend
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```
cd ams-dashboard/frontend
npm run dev
```

Open: http://localhost:5173

---

## Every day — Get latest changes from team

```
git pull origin master
```
Run this before you start working. If someone added new packages:
- `npm install` (frontend)
- `pip install -r requirements.txt` (backend)

---

## Pushing your changes

```
git add .
git commit -m "describe what you changed"
git push origin master
```

---

## Logins

| Role | Code | Password |
|------|------|----------|
| Admin | ADMIN01 | ADMIN@01 |
| Supervisor | SUP001 | SUP@001 |
| Employee | EMP001 | EMP@001 |
| Deskwork | DSK001 | DSK@001 |

