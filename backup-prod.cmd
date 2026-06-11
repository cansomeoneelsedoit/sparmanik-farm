@echo off
REM ============================================================
REM   Sparmanik Farm — save a safety copy of the Railway database
REM ============================================================
REM
REM Double-click this file. It will:
REM   1. Ask you to paste your Railway database URL
REM   2. Download a full copy of the production database
REM      (including all item photos) into the backups\ folder
REM   3. Keep the 10 newest copies, delete older ones
REM
REM This is READ-ONLY — it cannot change or break anything on
REM Railway. Run it once a week, or before any big change.
REM
REM Safety: the URL stays in this terminal window only. The moment
REM you close the window it's gone. The script never writes it to
REM any file. The backups\ folder is git-ignored.
REM ============================================================

cd /d "%~dp0"
cls
echo.
echo  ============================================================
echo    Sparmanik Farm — back up the Railway database
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

echo  Downloading... this is read-only and completely safe.
echo  ============================================================
echo.

call npm run backup:prod

set EXITCODE=%ERRORLEVEL%

echo.
echo  ============================================================
echo  Clearing the URL from this terminal session...
set PROD_DATABASE_URL=
echo  Done.
echo.

if %EXITCODE% NEQ 0 (
    echo  WARNING: The backup may have failed. Scroll up to read any
    echo  error messages, then try again.
) else (
    echo  Your backup is in the backups\ folder next to this file.
)

echo.
echo  You can close this window now.
pause
