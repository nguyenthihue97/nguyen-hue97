@echo off
rem Double-click to start the LAN server (port 8080)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" %*
pause
