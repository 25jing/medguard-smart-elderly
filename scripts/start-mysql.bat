@echo off
netstat -ano | findstr ":3306 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
  echo [OK] MySQL 已在 3306 端口运行
  exit /b 0
)
if not exist D:\medguard-mysql\server\bin\mysqld.exe (
  echo [错误] 未找到 D:\medguard-mysql\server\bin\mysqld.exe，请参考 docs\部署手册.md 安装MySQL
  pause
  exit /b 1
)
echo 启动 MySQL（独立窗口，请勿关闭）...
start "MedGuard-MySQL" /min D:\medguard-mysql\server\bin\mysqld.exe --defaults-file=D:\medguard-mysql\my.ini
:wait
timeout /t 2 /nobreak >nul
netstat -ano | findstr ":3306 " | findstr "LISTENING" >nul
if errorlevel 1 goto wait
echo [OK] MySQL 就绪
exit /b 0