@echo off
setlocal
set "SCRIPT_PS=%~dp0render-cli.ps1"
for %%I in ("%SCRIPT_PS%") do set "SCRIPT_PS=%%~fI"

where render >nul 2>&1
if %errorlevel% neq 0 (
  echo Error: Render CLI no esta instalado
  echo Instala desde: https://github.com/render-oss/cli/releases
  exit /b 1
)

powershell -ExecutionPolicy Bypass -File "%SCRIPT_PS%" whoami --output text >nul 2>&1
if %errorlevel% neq 0 (
  echo Error: revisa el token de Render en .env
  exit /b 1
)

if "%~1"=="" goto :help
if /i "%~1"=="help" goto :help
if /i "%~1"=="list" goto :list
if /i "%~1"=="tail" goto :tail
if /i "%~1"=="view" goto :view
if /i "%~1"=="errors" goto :errors

echo Comando desconocido: %~1
goto :help

:list
powershell -ExecutionPolicy Bypass -File "%SCRIPT_PS%" services --output text
goto :end

:tail
if "%~2"=="" (
  echo Debes especificar un servicio
  goto :help
)
powershell -ExecutionPolicy Bypass -File "%SCRIPT_PS%" logs --resources %~2 --tail
goto :end

:view
if "%~2"=="" (
  echo Debes especificar un servicio
  goto :help
)
if "%~3"=="" (
  powershell -ExecutionPolicy Bypass -File "%SCRIPT_PS%" logs --resources %~2 --limit 100 --output text
) else (
  powershell -ExecutionPolicy Bypass -File "%SCRIPT_PS%" logs --resources %~2 --limit %~3 --output text
)
goto :end

:errors
if "%~2"=="" (
  echo Debes especificar un servicio
  goto :help
)
powershell -ExecutionPolicy Bypass -File "%SCRIPT_PS%" logs --resources %~2 --level error --limit 200 --output text
goto :end

:help
echo Uso: %~nx0 [list^|tail^|view^|errors] [servicio] [limit]
echo Ejemplos:
echo   %~nx0 list
echo   %~nx0 tail srv-xxxxx
echo   %~nx0 view srv-xxxxx 100
echo   %~nx0 errors srv-xxxxx

:end
endlocal
