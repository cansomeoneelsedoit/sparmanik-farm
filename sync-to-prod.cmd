@echo off
REM ============================================================
REM   Sparmanik Farm — push your local data + photos to Railway
REM ============================================================
REM
REM Double-click this file. It will:
REM   1. Ask you to paste your Railway database URL
REM   2. Ask you to paste your sync admin secret (so photos sync too)
REM   3. Back up Railway prod first (rollback parachute)
REM   4. Push your local database to Railway
REM   5. Push your local uploads/ folder (photos) to Railway's Volume
REM
REM Safety: secrets stay in this terminal window only. The moment you
REM close the window they're gone. The script never writes them to any
REM file. The backup .sql is git-ignored.
REM
REM ONE-TIME SETUP (only needed first time):
REM   On Railway → web service → Variables tab → click "+ New Variable"
REM     name:  SYNC_ADMIN_SECRET
REM     value: any random string >= 8 chars (e.g. type your face on the keyboard)
REM   Railway redeploys automatically (~2 min). Then run this script.
REM ============================================================

cd /d "%~dp0"
cls
echo.
echo  ============================================================
echo    Sparmanik Farm — push local data + photos to Railway
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
echo  STEP 3.  Get your sync admin secret (used to upload photo files).
echo.
echo     a) Same Railway dashboard, click the WEB service (not Postgres)
echo     b) Click the "Variables" tab
echo     c) Find "SYNC_ADMIN_SECRET" and click the eye icon to reveal it,
echo        then the copy icon
echo.
echo  IF you don't see SYNC_ADMIN_SECRET:
echo     a) Click "+ New Variable"
echo     b) Name:  SYNC_ADMIN_SECRET
echo     c) Value: any random string at least 8 chars (mash the keyboard)
echo     d) Save. Railway redeploys (about 2 min).
echo     e) Then re-run this script after the redeploy.
echo.
echo  STEP 4.  Paste the secret below and press Enter.
echo  (Leave blank to skip photo sync — your database will still update.)
echo.
set /p SYNC_ADMIN_SECRET=" Paste SYNC_ADMIN_SECRET: "
echo.

REM Default prod app URL — used by the script when SYNC_ADMIN_SECRET is set.
set PROD_APP_URL=https://web-production-1e6de.up.railway.app

echo.
echo  STEP 5.  Running sync. You'll be asked to type "yes" once to
echo           confirm — that's the script's last safety check.
echo.
echo  ============================================================
echo.

call npm run sync:local-to-prod

set EXITCODE=%ERRORLEVEL%

echo.
echo  ============================================================
echo  Clearing secrets from this terminal session...
set PROD_DATABASE_URL=
set SYNC_ADMIN_SECRET=
set PROD_APP_URL=
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
