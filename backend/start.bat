@echo off
REM Start the KENPIN FastAPI backend
REM Run from the backend/ directory

cd /d %~dp0

if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

call .venv\Scripts\activate

echo Installing dependencies...
pip install -r requirements.txt --quiet

echo.
echo Starting FastAPI server at http://localhost:8000
echo API docs: http://localhost:8000/docs
echo.

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
