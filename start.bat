@echo off
echo Starting AMS Dashboard...
echo.

echo [1/2] Starting FastAPI backend (port 8000)...
start "AMS Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --reload --port 8000"

timeout /t 3 /nobreak >nul

echo [2/2] Starting React frontend (port 5173)...
start "AMS Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Both servers starting...
echo Backend API:  http://localhost:8000
echo Frontend App: http://localhost:5173
echo API Docs:     http://localhost:8000/docs
echo.
pause
