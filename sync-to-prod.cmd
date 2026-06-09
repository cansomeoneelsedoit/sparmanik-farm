@echo off
REM ============================================================
REM   Sparmanik Farm — push your local data + photos to Railway
REM ============================================================
REM
REM Double-click this file. It will:
REM   1. Ask you to paste your Railway database URL
REM   2. Back up Railway prod first (rollback parachute)
REM   3. Push your local database to Railway — photos travel
REM      with it because they're stored in the items table now
REM
REM Safety: the URL stays in this terminal window only. The moment
REM you close the window it's gone. The script never writes it to
REM any file. The backup .sql is git-ignored.
REM
REM No more SYNC_ADMIN_SECRET needed — photos are in the DB now
REM (items.photo_data column) so they get carried by the dump
REM automatically. One paste, one click, done.
REM ============================================================

cd /d "%~dp0"
cls
echo.
echo  ============================================================
echo    Sparmanik Farm — push local data to Railway
echo  ============================================================
echo.
echo  STEP 1.  Get your Railway database URL.
echo.
echo     a) Open https://railway.app in your browser
echo     b) Click your "sparmanikfarm" project
echo     c) Click the "Postgres" service (the database, not the web app)
echo     d) Click the "Connect" tab at the top
echo     e) Find "Postgres Connection URL" and click the copy icon
echo.
echo  STEP 2.  Paste it below and press Enter.
echo  (Right-click in this window to paste. Pasted text WILL be visible —
echo   that's normal for Windows cmd.)
echo.
set /p PROD_DATABASE_URL=" Paste DATABASE URL: "
echo.

if "%PROD_DATABASE_URL%"=="" (
    echo  ERROR: You didn't paste anything. Cancelling.
    echo.
    pause
    exit /b 1
)

echo %PROD_DATABASE_URL% | findstr /b /c:"postgres" >nul
if errorlevel 1 (
    echo  ERROR: That doesn't look like a Postgres URL.
    echo  It should start with "postgresql://" or "postgres://".
    echo.
    set PROD_DATABASE_URL=
    pause
    exit /b 1
)

echo.
echo  STEP 3.  Running sync. You'll be asked to type "yes" once to
echo           confirm — that's the script's last safety check.
echo.
echo  ============================================================
echo.

call npm run sync:local-to-prod

set EXITCODE=%ERRORLEVEL%

echo.
echo  ============================================================
echo  Clearing the URL from this terminal session...
set PROD_DATABASE_URL=
echo  Done.
echo.

if %EXITCODE% NEQ 0 (
    echo  WARNING: The sync may have failed. Scroll up to read any
    echo  error messages. If you see "FAILED", look for the backup
    echo  filename — that's your rollback parachute.
)

echo.
echo  You can close this window now.
pause
