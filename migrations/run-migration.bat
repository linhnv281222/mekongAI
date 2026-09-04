@echo off
REM ============================================================
REM Run migration and test for Phase 1 version tracking
REM Usage: run-migration.bat
REM ============================================================

echo ============================================================
echo Phase 1 Migration: Version Tracking
echo ============================================================
echo.

set DB_NAME=mechanical_ai
set DB_USER=postgres
set SCRIPT_DIR=%~dp0

echo [1/3] Running migration...
psql -U %DB_USER% -d %DB_NAME% -f "%SCRIPT_DIR%add-version-tracking.sql"

if errorlevel 1 (
    echo ERROR: Migration failed
    pause
    exit /b 1
)

echo.
echo [2/3] Running test verification...
psql -U %DB_USER% -d %DB_NAME% -f "%SCRIPT_DIR%test-version-tracking.sql"

if errorlevel 1 (
    echo WARNING: Test verification had issues (check output above)
)

echo.
echo [3/3] Quick verification query...
psql -U %DB_USER% -d %DB_NAME% -c "SELECT COUNT(*) as migrated_versions FROM mekongai.drawing_item_versions WHERE version_type = 'ai_extracted';"

echo.
echo ============================================================
echo Migration complete!
echo ============================================================
echo.
echo Next steps:
echo   1. Check migration output above
echo   2. Verify drawing_item_versions table has data
echo   3. Continue with backend code changes
echo.
pause
