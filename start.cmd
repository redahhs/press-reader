@echo off
setlocal
chcp 65001 >nul
title Press Reader - local server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [X] Node.js not found.
  echo       Install the LTS version from https://nodejs.org , then run this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Building index.html from src/ ...
node build.mjs
if errorlevel 1 (
  echo.
  echo   [X] Build failed. Fix the error above and try again.
  echo.
  pause
  exit /b 1
)

node serve.mjs --open %*

echo.
echo   Server stopped.
pause
