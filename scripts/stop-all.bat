@echo off
for %%p in (8080 8100 3306) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr "LISTENING"') do (
    echo 停止端口 %%p 的进程 pid=%%a ...
    taskkill /PID %%a /F >nul 2>&1
  )
)
echo 已全部停止（后端8080 / AI8100 / MySQL3306）
exit /b 0