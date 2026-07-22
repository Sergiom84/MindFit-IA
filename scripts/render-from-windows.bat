@echo off
REM Script para usar Render CLI desde Windows con credenciales locales del proyecto

setlocal enabledelayedexpansion
set "SCRIPT_PS=%~dp0render-cli.ps1"
for %%I in ("%SCRIPT_PS%") do set "SCRIPT_PS=%%~fI"

echo ========================================
echo    Render CLI local
echo ========================================
echo.

if "%1"=="" goto :show_menu
if "%1"=="whoami" goto :whoami
if "%1"=="services" goto :services
if "%1"=="logs" goto :logs
if "%1"=="tail" goto :tail

:show_menu
echo Comandos disponibles:
echo.
echo 1. whoami   - Ver usuario autenticado
echo 2. services - Listar servicios
echo 3. logs     - Ver logs
echo 4. tail     - Streaming de logs
echo.
echo Uso: %~nx0 [comando]
echo Ejemplo: %~nx0 whoami
echo.
pause
exit /b 0

:whoami
echo Obteniendo informacion del usuario...
echo.
powershell -ExecutionPolicy Bypass -File "%SCRIPT_PS%" whoami --output text
goto :end

:services
echo Listando servicios...
echo.
powershell -ExecutionPolicy Bypass -File "%SCRIPT_PS%" services --output text
goto :end

:logs
set SERVICE=%2
if "%SERVICE%"=="" set SERVICE=backend
echo Obteniendo logs de: %SERVICE%
echo.
powershell -ExecutionPolicy Bypass -File "%SCRIPT_PS%" logs --resources %SERVICE% --limit 100 --output text
goto :end

:tail
set SERVICE=%2
if "%SERVICE%"=="" (
    echo Streaming de logs (presiona Ctrl+C para salir)...
    echo.
    powershell -ExecutionPolicy Bypass -File "%SCRIPT_PS%" logs --tail
) else (
    echo Streaming de logs de: %SERVICE% (presiona Ctrl+C para salir)...
    echo.
    powershell -ExecutionPolicy Bypass -File "%SCRIPT_PS%" logs --resources %SERVICE% --tail
)
goto :end

:end
echo.
pause
endlocal
