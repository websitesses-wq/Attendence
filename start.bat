@echo off
title Zudent Attendance Analyzer
echo ========================================================
echo        Starting Zudent Attendance Analyzer Web App
echo ========================================================
echo.

IF NOT EXIST ".venv\Scripts\python.exe" (
    echo Setting up Python virtual environment...
    python -m venv .venv
    .venv\Scripts\pip install fastapi uvicorn httpx requests pydantic playwright
)

echo Launching web application on http://localhost:8000 ...
.venv\Scripts\python run.py
pause

