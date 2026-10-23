@echo off
title SoumissionAI-DZ - Dev Server (auto-restart)
cd /d "%~dp0"
:loop
echo [%date% %time%] Starting Next.js dev server...
call npm run dev
echo [%date% %time%] Server stopped. Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto loop
