@echo off
setlocal
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title Motor Blueprint - servidor local 8123

echo.
echo  ============================================================
echo   MOTOR BLUEPRINT - plano tecnico de motor 4 cilindros DOHC
echo  ============================================================
echo.
echo   Carpeta : %cd%
echo   URL     : http://localhost:8123
echo.
echo   Para detener el servidor: pulsa Ctrl + C en esta ventana.
echo.

start "" "http://localhost:8123"

where py >nul 2>nul
if not errorlevel 1 goto usar_py

where python >nul 2>nul
if not errorlevel 1 goto usar_python

where npx >nul 2>nul
if not errorlevel 1 goto usar_npx

goto sin_servidor

:usar_py
echo   Servidor: py -m http.server 8123
echo.
py -m http.server 8123
goto fin

:usar_python
echo   Servidor: python -m http.server 8123
echo.
python -m http.server 8123
goto fin

:usar_npx
echo   Servidor: npx serve -l 8123
echo.
npx --yes serve -l 8123 .
goto fin

:sin_servidor
echo   [ERROR] No se ha encontrado ni "py", ni "python", ni "npx".
echo.
echo   Instala una de estas dos cosas y vuelve a intentarlo:
echo     - Python  : https://www.python.org/downloads/
echo     - Node.js : https://nodejs.org/
echo.
echo   El plano necesita un servidor local porque usa modulos ES.
echo.
pause
goto fin

:fin
echo.
echo   Servidor detenido.
endlocal
