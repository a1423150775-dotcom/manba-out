@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0"
"%~dp0GameServer.exe" "%~dp0launcher.cjs"
set "GAME_EXIT=%ERRORLEVEL%"
if not "%GAME_EXIT%"=="0" echo.
if not "%GAME_EXIT%"=="0" echo Server exited with error %GAME_EXIT%. Please check config.json and logs\server.log.
echo.
echo Server stopped. Press any key to close this window.
pause >nul
popd
exit /b %GAME_EXIT%
