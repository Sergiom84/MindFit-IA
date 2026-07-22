@echo off
REM Script para instalar Render CLI en Windows

echo ========================================
echo    Instalacion de Render CLI - Windows
echo ========================================
echo.

echo Este script descargara e instalara Render CLI en Windows.
echo.
echo Opciones de instalacion:
echo.
echo 1. Con Chocolatey (si lo tienes instalado)
echo    choco install render
echo.
echo 2. Con Scoop (si lo tienes instalado)
echo    scoop install render
echo.
echo 3. Descarga manual desde GitHub
echo    https://github.com/render-oss/cli/releases/latest
echo.
echo    Busca el archivo: cli_X.X.X_windows_amd64.zip
echo    Descargalo, descomprimelo y anade el ejecutable al PATH
echo.

set /p choice="Tienes Chocolatey o Scoop instalado? (choco/scoop/manual): "

if /i "%choice%"=="choco" goto :chocolatey
if /i "%choice%"=="scoop" goto :scoop
if /i "%choice%"=="manual" goto :manual

echo Opcion no valida
pause
exit /b 1

:chocolatey
echo.
echo Instalando con Chocolatey...
choco install render -y
goto :verify

:scoop
echo.
echo Instalando con Scoop...
scoop install render
goto :verify

:manual
echo.
echo Abriendo pagina de releases en tu navegador...
start https://github.com/render-oss/cli/releases/latest
echo.
echo Pasos para instalar manualmente:
echo 1. Descarga: cli_X.X.X_windows_amd64.zip
echo 2. Descomprime el archivo
echo 3. Mueve render.exe a: C:\Program Files\Render\
echo 4. Anade C:\Program Files\Render\ al PATH del sistema
echo.
echo Tutorial para anadir al PATH:
echo https://www.architectryan.com/2018/03/17/add-to-the-path-on-windows-10/
echo.
pause
exit /b 0

:verify
echo.
echo Verificando instalacion...
render --version

if %errorlevel% equ 0 (
    echo.
    echo [92mRender CLI instalado correctamente![0m
    echo.
    echo Ahora ejecuta: npm run render:auth:win
) else (
    echo.
    echo [91mError: La instalacion no se completo correctamente[0m
    echo Intenta con otro metodo o instalacion manual
)

pause
