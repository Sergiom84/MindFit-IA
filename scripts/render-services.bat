@echo off
set "SCRIPT_PS=%~dp0render-cli.ps1"
for %%I in ("%SCRIPT_PS%") do set "SCRIPT_PS=%%~fI"
powershell -ExecutionPolicy Bypass -File "%SCRIPT_PS%" services --output text
