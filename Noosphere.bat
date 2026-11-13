@echo off
rem Launches The Noosphere on Windows.
rem Fastest path: just double-click app\Noosphere.html instead. This script is the fallback:
rem it serves the app on http://localhost:5179 using Node.js (https://nodejs.org, version 18 or newer).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Either open app\Noosphere.html directly in Edge or Chrome,
  echo or install Node.js from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist "app\Noosphere.html" if not exist "dist\index.html" (
  echo Building the app for the first time...
  call npm install || goto :error
  call npm run build || goto :error
)
node launcher\serve.mjs
goto :eof
:error
echo Something went wrong. See the messages above.
pause
