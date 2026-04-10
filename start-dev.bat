@echo off
setlocal

REM カレントディレクトリ取得
set BASE_DIR=%~dp0

REM --- Backend ---
start "" cmd /k "cd /d %BASE_DIR%backend && call start.bat"

REM --- Frontend ---
cd /d %BASE_DIR%
call npm run dev

timeout /t 5 /nobreak > nul

start "" http://localhost:3000

endlocal