@echo off
title 启动平台
echo 正在启动平台（MySQL + AI服务 + 后端）...
echo 如果看到“已在运行，无需重复启动”，说明服务活着，直接用浏览器页面即可。
echo.
call "%~dp0scripts\start-all.bat"
echo.
echo 本窗口可以关掉。各服务在标题为 MedGuard-* 的窗口里运行。
echo 想停止全部服务：双击「停止平台-双击我.bat」
pause