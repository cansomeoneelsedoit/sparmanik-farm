@echo off
echo === Sparmanik Farm - Setup, Build and Push ===
echo.

cd /d "%~dp0"

echo [1/5] Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo [2/5] Testing build...
call npx react-scripts build
if errorlevel 1 (
    echo ERROR: Build failed - check errors above
    pause
    exit /b 1
)

echo.
echo [3/5] Initializing git...
git init
git checkout -b draft/autumn-butterfly 2>nul || git checkout draft/autumn-butterfly

echo.
echo [4/5] Committing files...
git add -A
git commit -m "feat: standalone React app with 429 inventory items, bilingual EN/ID"

echo.
echo [5/5] Pushing to GitHub...
git remote add origin https://github.com/cansomeoneelsedoit/sparmanik-farm.git 2>nul
git remote set-url origin https://github.com/cansomeoneelsedoit/sparmanik-farm.git
git push -u origin draft/autumn-butterfly --force

echo.
echo === Done! ===
echo Check: https://github.com/cansomeoneelsedoit/sparmanik-farm/tree/draft/autumn-butterfly
echo.
pause
