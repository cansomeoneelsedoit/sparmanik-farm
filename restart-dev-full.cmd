@echo off
REM ============================================================
REM   Sparmanik Farm — FULL rebuild (use when simple restart fails)
REM ============================================================
REM
REM Use this when restart-dev.cmd isn't enough:
REM   - You ran `npm install` and added a dependency
REM   - You changed prisma/schema.prisma
REM   - You changed docker-compose.yml or Dockerfile.dev
REM   - You pulled commits that include any of the above
REM
REM Takes ~2-3 minutes because it rebuilds the container image
REM and re-runs `prisma migrate deploy` and the seed.
REM ============================================================

cd /d "%~dp0"
echo.
echo Stopping containers...
docker compose down
echo.
echo Starting fresh (this rebuilds the image)...
docker compose up -d --build
echo.
echo Waiting for Next.js to be ready (about 60-90 seconds)...

set /a tries=0
:waitloop
set /a tries+=1
if %tries% gtr 60 (
    echo.
    echo [WARN] Healthcheck still failing after 2min — check 'docker compose logs web'.
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
