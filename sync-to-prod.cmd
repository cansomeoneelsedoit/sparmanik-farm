@echo off
REM ============================================================
REM   Sparmanik Farm — push your local data to Railway (one-time)
REM ============================================================
REM
REM Double-click this file. It will:
REM   1. Ask you to paste your Railway database URL
REM   2. Run a backup of Railway (saved next to this file)
REM   3. Copy your local data over
REM   4. Print "DONE" when finished
REM
REM Safety: the URL stays in this terminal window only. The moment
REM you close the window, it's gone. The script never writes it
REM to any file. The backup .sql file is git-ignored so it can't
REM accidentally be pushed.
REM ============================================================

cd /d "%~dp0"
cls
echo.
echo  ============================================================
echo    Sparmanik Farm — push local data to Railway prod
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
echo.
echo  (Right-click in this window to paste. The pasted text WILL be
echo   visible — that's normal for Windows cmd. Nobody else can see it.)
echo.
set /p PROD_DATABASE_URL=" Paste URL here: "
echo.

if "%PROD_DATABASE_URL%"=="" (
    echo  ERROR: You didn't paste anything. Cancelling.
    echo.
    pause
    exit /b 1
)

REM Basic sanity check — the URL should start with postgres://
echo %PROD_DATABASE_URL% | findstr /b /c:"postgres" >nul
if errorlevel 1 (
    echo  ERROR: That doesn't look like a Postgres URL.
    echo  It should start with "postgresql://" or "postgres://".
    echo  Try again.
    echo.
    set PROD_DATABASE_URL=
    pause
    exit /b 1
)

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
