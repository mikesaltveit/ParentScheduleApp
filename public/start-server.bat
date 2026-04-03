@echo off
cd /d "%~dp0"
echo Server running at http://localhost:8080
echo Close this window to stop.
echo.
php -S localhost:8080
