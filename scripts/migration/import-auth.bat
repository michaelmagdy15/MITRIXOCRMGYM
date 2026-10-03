@echo off
setlocal
if "%~1"=="" (
    echo Usage: import-auth.bat ^<TARGET_PROJECT_ID^> ^<SIGNER_KEY^> ^<SALT_SEPARATOR^>
    echo Example: import-auth.bat strike-gym-prod "base64_signer_key" "base64_salt_separator"
    exit /b 1
)

set TARGET_PROJECT=%~1
set SIGNER_KEY=%~2
set SALT_SEPARATOR=%~3

echo ========================================================
echo Importing Users to Target Project: %TARGET_PROJECT%
echo ========================================================

npx firebase auth:import "%~dp0strike_users_clean.json" ^
    --project %TARGET_PROJECT% ^
    --hash-algo=SCRYPT ^
    --hash-key="%SIGNER_KEY%" ^
    --salt-separator="%SALT_SEPARATOR%" ^
    --rounds=8 ^
    --mem-cost=14

if %errorlevel% neq 0 (
    echo [ERROR] Failed to import users to %TARGET_PROJECT%.
    exit /b %errorlevel%
)

echo.
echo [SUCCESS] Strike users successfully imported to %TARGET_PROJECT%!
