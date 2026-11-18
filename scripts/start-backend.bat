@echo off
title MedGuard-Backend
echo ============================================
echo   MedGuard 业务后端（SpringBoot :8080）
echo ============================================
pushd "%~dp0..\backend"

netstat -ano | findstr ":8080 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
  echo [OK] 后端已在 8080 端口运行，无需重复启动
  popd
  exit /b 0
)

if not exist target\medguard-backend.jar (
  echo [1/2] 未找到jar，先执行Maven打包（约1-2分钟）...
  call mvn -q package -DskipTests
)
if not exist target\medguard-backend.jar (
  echo [错误] 打包失败，请确认已安装 JDK17+ 与 Maven，或手动执行 mvn package -DskipTests
  pause
  popd
  exit /b 1
)

echo 启动中（首次启动自动建表并导入种子数据，约20-40秒）...
java -jar target\medguard-backend.jar
pause