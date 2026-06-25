@echo off
title CRM Deployer
cd /d "c:\Users\Mi5a\MitrixoGYMCRMPlatform"
echo =========================================
echo       CRM AUTO DEPLOYMENT SCRIPT         
echo =========================================
echo.
set /p commit_msg="Enter commit message (or press Enter for default): "
if "%commit_msg%"=="" set commit_msg=Auto-deploy: Update config and server

echo.
echo [1/3] Adding changes to Git...
git add .

echo.
echo [2/3] Committing changes...
git commit -m "%commit_msg%"

echo.
echo [3/3] Deploying directly to Google Cloud Run...
gcloud builds submit --config cloudbuild.yaml --substitutions=_TAG=latest

echo.
echo =========================================
echo   Deployment Complete!
echo =========================================
echo.
pause
