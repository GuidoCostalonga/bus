@echo off
chcp 65001 >nul 2>nul
title Autobus in tempo reale FVG
cd /d "%~dp0"

echo.
echo   Autobus in tempo reale in Friuli Venezia Giulia
echo   ===============================================
echo.

where node >nul 2>nul
if errorlevel 1 goto senzanode
if not exist "aggregatore_tplfvg.js" goto senzafile
if not exist "autobus_fvg.html" goto senzafile

echo   Avvio in corso. La pagina si apre da sola nel browser.
echo   Lasci aperta questa finestra: e il programma che raccoglie le posizioni.
echo   Per fermare tutto, chiuda questa finestra.
echo.

set APRI_BROWSER=1
node aggregatore_tplfvg.js
echo.
echo   Il programma si e fermato.
pause
exit /b 0

:senzanode
echo   Node.js non risulta installato su questo computer.
echo.
echo   Lo scarichi da   https://nodejs.org
echo   Scelga la versione LTS e faccia una installazione normale.
echo   Poi riavvii questo file con un doppio clic.
echo.
pause
exit /b 1

:senzafile
echo   Mancano dei file in questa cartella.
echo   Servono tutti e tre insieme:
echo     autobus_fvg.html
echo     aggregatore_tplfvg.js
echo     questo file di avvio
echo.
pause
exit /b 1
