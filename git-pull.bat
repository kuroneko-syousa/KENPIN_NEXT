@echo off
setlocal EnableDelayedExpansion
chcp 65001 > nul

cd /d "%~dp0"

echo ======================================
echo   KENPIN_NEXT - GitHub Pull
echo ======================================
echo.

rem ─── 現在のブランチ確認 ───
for /f "delims=" %%i in ('git rev-parse --abbrev-ref HEAD 2^>^&1') do set "BRANCH=%%i"
echo 現在のブランチ: %BRANCH%
echo.

rem ─── プル実行 ───
echo [1/1] GitHub からプル中...
git pull origin %BRANCH%

if errorlevel 1 (
  echo.
  echo [ERROR] git pull に失敗しました。
  echo コンフリクトが発生している可能性があります。
  pause
  exit /b 1
)

echo.
echo [SUCCESS] プル完了しました。
echo ======================================
pause
