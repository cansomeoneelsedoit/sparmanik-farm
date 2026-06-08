@echo off
REM ============================================================
REM   Sparmanik Farm — Restart local dev (one-click)
REM ============================================================
REM
REM Use this whenever local 3000 acts up:
REM   - Images 404 / pictures not loading
REM   - "I just edited code and the change isn't showing"
REM   - Routes returning 404 that worked yesterday
REM   - Anything where local behaves differently from Railway
REM
REM Cause: Docker bind mounts on Windows don't propagate file
REM watch events into the container, so Turbopack silently
REM serves a stale compiled bundle. This restart forces a
REM fresh compile from current source. ~20-30 seconds.
REM
REM If THIS doesn't fix it (e.g. you added an npm dep, or
REM changed prisma/schema.prisma), use restart-dev-full.cmd
REM instead which does a full down + up cycle.
REM ============================================================

cd /d "%~dp0"
echo.
echo Restarting Sparmanik Farm dev container...
docker compose restart web
echo.
echo Waiting for Next.js to be ready (about 20 seconds)...

REM Poll /api/health until 200 (max 60 seconds)
set /a tries=0
:waitloop
set /a tries+=1
if %tries% gtr 30 (
    echo.
    echo [WARN] Healthcheck still failing after 60s — check 'docker compose logs web'.
    goto end
)
timeout /t 2 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://localhost:3000/api/health > %TEMP%\sf_health_check.txt 2>nul
set /p status=<%TEMP%\sf_health_check.txt
del %TEMP%\sf_health_check.txt 2>nul
if not "%status%"=="200" goto waitloop

echo.
echo Ready! Open http://localhost:3000
echo.

:end
pause
