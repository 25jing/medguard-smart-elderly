@echo off
title MedGuard-AI
echo ============================================
echo   MedGuard AI 服务（FastAPI :8100）
echo   YOLOv8检测 + OCR识别 + 冲突规则 + RAG问答
echo ============================================
pushd "%~dp0..\ai-service"

netstat -ano | findstr ":8100 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
  echo [OK] AI 服务已在 8100 端口运行，无需重复启动
  popd
  exit /b 0
)

if not exist .venv\Scripts\python.exe (
  echo [错误] 未找到虚拟环境，请先在 ai-service 目录执行:
  echo        python -m venv .venv
  echo        .venv\Scripts\pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/
  pause
  popd
  exit /b 1
)

echo 启动中（索引已缓存约20-40秒；首次构建约1-2分钟）...
set PYTHONIOENCODING=utf-8
.venv\Scripts\python.exe main.py
pause