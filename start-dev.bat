@echo off
setlocal

cd /d "%~dp0"

REM --- Python FastAPI backend (別ウィンドウで起動) ---
start "KENPIN Backend" cmd /k "cd /d %~dp0backend && start.bat"

REM --- Next.js フロントエンド ---
if exist "C:\Program Files\nodejs\npm.cmd" (
  call "C:\Program Files\nodejs\npm.cmd" run dev
) else (
  call npm run dev
)

timeout /t 10 /nobreak > nul

rundll32 url.dll,FileProtocolHandler http://localhost:3000

endlocal
