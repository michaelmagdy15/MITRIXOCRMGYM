@echo off
title CRM Deployer
cd /d "c:\Users\Mi5a\MitrixoGYMCRMPlatform"
echo =========================================
echo       CRM AUTO DEPLOYMENT SCRIPT         
echo =========================================
echo.
set /p commit_msg="Enter commit message (or press Enter for default): "
if "%commit_msg%"=="" set commit_msg="Auto-deploy: Update config and server"

echo.
echo [1/3] Adding changes to Git...
git add .

echo.
echo [2/3] Committing & Staging...
git commit -m "%commit_msg%"

echo.
echo [3/3] Pushing to GitHub (Triggers Cloud Run deploy)...
git push origin master

echo.
echo =========================================
echo   Push Complete! Check your Cloud Build /
echo   Cloud Run console for deployment status.
echo =========================================
echo.
pause
