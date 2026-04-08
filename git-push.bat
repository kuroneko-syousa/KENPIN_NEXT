@echo off
setlocal EnableDelayedExpansion
chcp 65001 > nul

cd /d "%~dp0"

echo ======================================
echo   KENPIN_NEXT - GitHub Push
echo ======================================
echo.

rem ─── コミットメッセージ入力 ───
set "MSG="
set /p "MSG=コミットメッセージを入力してください: "
if "%MSG%"=="" set "MSG=update"

rem ─── ステージング・コミット・プッシュ ───
echo.
echo [1/3] ファイルをステージング中...
git add -A
if errorlevel 1 ( echo [ERROR] git add に失敗しました & pause & exit /b 1 )

echo [2/3] コミット中...
git commit -m "%MSG%"
if errorlevel 1 (
  echo [INFO] コミットするファイルがないか、エラーが発生しました。
  pause
  exit /b 0
)

echo [3/3] origin/main にプッシュ中...
git push origin main
if errorlevel 1 ( echo [ERROR] push に失敗しました & pause & exit /b 1 )

echo.
echo ======================================
echo   プッシュ完了!
echo   https://github.com/kuroneko-syousa/KENPIN_NEXT
echo ======================================
echo.
pause
endlocal
