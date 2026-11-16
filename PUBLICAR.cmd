@echo off
if /i "%~1"=="--run" goto run
start "Publicar Luciana Quintana" "%ComSpec%" /k ""%~f0" --run"
exit /b
:run
setlocal
chcp 65001 >nul
set "LQ_BOOTSTRAP=%~dp0publicar.ps1"
powershell.exe -NoProfile -Command "& ([ScriptBlock]::Create([IO.File]::ReadAllText($env:LQ_BOOTSTRAP)))"
echo.
echo La ventana queda abierta. Si hubo un error, comparti REGISTRO-PUBLICACION.txt.
endlocal
