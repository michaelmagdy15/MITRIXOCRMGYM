@echo off
echo ========================================================
echo Phase 1: Exporting Firebase Auth from faa-test-guide-v2
echo ========================================================

npx firebase auth:export "%~dp0all_users_raw.json" --format=json --project faa-test-guide-v2
if %errorlevel% neq 0 (
    echo [ERROR] Failed to export users from faa-test-guide-v2.
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo Filtering Strike Accounts (Stripping ATPL and Gamen)
echo ========================================================
node "%~dp0filter-strike-auth.cjs" "%~dp0all_users_raw.json" "%~dp0strike_users_clean.json"

echo.
echo [DONE] Clean Strike export ready at: %~dp0strike_users_clean.json
