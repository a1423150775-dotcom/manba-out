@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0"
"%~dp0GameServer.exe" "%~dp0stop.cjs"
set "GAME_EXIT=%ERRORLEVEL%"
if not "%GAME_EXIT%"=="0" pause
popd
exit /b %GAME_EXIT%
