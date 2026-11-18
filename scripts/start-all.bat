@echo off
title MedGuard-一键启动
echo ==================================================
echo   智慧养老安全用药辅助平台 · 一键启动
echo   MySQL(3306) + SpringBoot(8080) + FastAPI(8100)
echo ==================================================

call "%~dp0start-mysql.bat"

echo.
echo [启动] AI 服务（新窗口，首次加载约1分钟）...
start "MedGuard-AI服务" cmd /k "%~dp0start-ai.bat"

echo [启动] 业务后端（新窗口）...
start "MedGuard-后端" cmd /k "%~dp0start-backend.bat"

echo.
echo 等待后端就绪（约20-40秒）...
:wait
timeout /t 3 /nobreak >nul
netstat -ano | findstr ":8080 " | findstr "LISTENING" >nul
if errorlevel 1 goto wait

echo.
echo ==================================================
echo   全部就绪！统一入口（自动打开浏览器）:
echo     http://127.0.0.1:8080/
echo   一个入口：登录不同演示账号，进入不同页面（老人/家属/管理）
echo   演示账号（密码均为 123456）:
echo     老人   13900001111  张桂芳
echo     家属   13900002222  张小芳
echo     管理   admin
for /f "delims=" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } ^| Select-Object -First 1).IPAddress"') do echo   手机同一WiFi访问: http://%%i:8080/
echo ==================================================
start "" "http://127.0.0.1:8080/"
timeout /t 5 >nul
exit /b 0