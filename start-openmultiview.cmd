@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo OpenMultiview requires Node.js 22 or newer.
  echo Download the LTS installer from https://nodejs.org/en/download
  pause
  exit /b 1
)
echo OpenMultiview - local companion
echo Open http://127.0.0.1:8090/config.html in Chrome or Edge.
echo Keep this window open while using vMix.
echo.
node server.js
pause
