@echo off
rem Double-click this file to start Foreshock on Windows.
title Foreshock
cd /d "%~dp0"
chcp 65001 >nul
echo Starting Foreshock...
set PYTHONIOENCODING=utf-8

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server\server.py %*
  goto done
)
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
if %errorlevel%==0 (
  python server\server.py %*
  goto done
)
echo.
echo Python 3 is not installed yet.
echo Install it from https://www.python.org/downloads/
echo IMPORTANT: on the first installer screen, tick "Add python.exe to PATH".
echo Then double-click this file again.
echo.
pause
exit /b 1

:done
echo.
echo Foreshock stopped.
pause
