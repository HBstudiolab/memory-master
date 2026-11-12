@echo off
setlocal
cd /d "%~dp0"
echo ========================================
echo Memory Master - Image Registration
echo ========================================
echo.
if not exist "%~dp0tools\register_images.ps1" (
  echo ERROR: tools\register_images.ps1 not found.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\register_images.ps1"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  echo Registration failed. See messages above.
 ) else (
  echo Registration complete. Commit and Push in GitHub Desktop.
 )
echo.
pause
exit /b %RC%
