@echo off
title 停止平台
echo 正在停止 后端(8080)、AI服务(8100)、MySQL(3306)...
call "%~dp0scripts\stop-all.bat"
echo 完成。再次启动请双击「启动平台-双击我.bat」
pause