@echo off
setlocal
cd /d "%~dp0"
echo ========================================
echo Memory Master - Local Server
echo ========================================
if not exist "%~dp0tools\serve.ps1" (
  echo ERROR: tools\serve.ps1 not found.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" %*
echo.
echo Server stopped.
pause
