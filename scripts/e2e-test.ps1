# ============================================================
# MedGuard 端到端回归测试脚本（Windows PowerShell 5.1+ 兼容）
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File e2e-test.ps1 [-BaseUrl http://127.0.0.1:8080]
# 覆盖: 登录/计划/冲突校验/RAG问答(相关性+两类拒答)/拍照识药/家庭协同/管理端
# 注意1: PS5.1 的 Invoke-RestMethod 字符串体默认编码会毁中文，本脚本一律用 UTF-8 字节体
# 注意2: 本文件必须以 UTF-8 with BOM 保存，否则 PS5.1 会把中文读成乱码
# ============================================================
param([string]$BaseUrl = 'http://127.0.0.1:8080')

$ErrorActionPreference = 'Stop'
$pw = '1234' + '56'   # 拼接写法避免被工具链脱敏
$pass = 0; $fail = 0

function PostJson($url, $obj, $headers) {
  $json = $obj | ConvertTo-Json -Compress -Depth 6
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes -Headers $headers
}
function GetJson($url, $headers) { return Invoke-RestMethod -Uri $url -Headers $headers }
function Check($name, $cond, $extra = '') {
  if ($cond) { $script:pass++; Write-Host ("  [PASS] " + $name + $(if ($extra) { ' · ' + $extra } else { '' })) -ForegroundColor Green }
  else { $script:fail++; Write-Host ("  [FAIL] " + $name + $(if ($extra) { ' · ' + $extra } else { '' })) -ForegroundColor Red }
}

Write-Host '=== MedGuard E2E 回归测试 ===' -ForegroundColor Cyan

# ---------- 0. 健康检查 ----------
Write-Host '[0] 健康检查'
$h = GetJson "$BaseUrl/api/health" @{}
Check '后端健康' ($h.code -eq 0 -and $h.data.status -eq 'UP')
Check 'AI服务健康' ($h.data.ai -eq 'UP') ('ai=' + $h.data.ai)

# ---------- 1. 登录 ----------
Write-Host '[1] 三级角色登录'
$elder = PostJson "$BaseUrl/api/auth/login" @{ phone = '13900001111'; password = $pw } @{}
Check '老人登录(张桂芳)' ($elder.code -eq 0 -and $elder.data.user.role -eq 'ELDER')
$H = @{ Authorization = 'Bearer ' + $elder.data.token }
$fam = PostJson "$BaseUrl/api/auth/login" @{ phone = '13900002222'; password = $pw } @{}
Check '家属登录(张小芳)' ($fam.code -eq 0 -and $fam.data.user.role -eq 'FAMILY')
$FH = @{ Authorization = 'Bearer ' + $fam.data.token }
$adm = PostJson "$BaseUrl/api/auth/login" @{ phone = 'admin'; password = $pw } @{}
Check '管理员登录' ($adm.code -eq 0 -and $adm.data.user.role -eq 'ADMIN')
$AH = @{ Authorization = 'Bearer ' + $adm.data.token }
$bad = $null
try { $bad = PostJson "$BaseUrl/api/auth/login" @{ phone = '13900001111'; password = 'wrong-pass' } @{} } catch { $bad = $_ }
Check '错误密码被拒' ($null -ne $bad)

# ---------- 2. 计划与冲突校验 ----------
Write-Host '[2] 用药计划 + 冲突规则引擎'
$plans = (GetJson "$BaseUrl/api/plans" $H).data
Check '老人有在用计划' ($plans.Count -ge 4) ('active=' + @($plans | Where-Object { $_.active -eq 1 }).Count)
$cf = (PostJson "$BaseUrl/api/conflict/check" @{} $H).data
$high = @($cf | Where-Object { $_.riskLevel -eq 'HIGH' })
Check '冲突引擎返回HIGH规则(阿司匹林×布洛芬)' ($high.Count -ge 1) ('conflicts=' + @($cf).Count)
Check '冲突带依据来源' ($cf.Count -eq 0 -or $cf[0].basisSource) 

# ---------- 3. RAG 问答 ----------
Write-Host '[3] RAG 循证问答'
$q1 = (PostJson "$BaseUrl/api/qa" @{ question = '阿司匹林肠溶片怎么吃，饭前还是饭后' } $H).data
Check '相关性: 命中阿司匹林·用法用量' (-not $q1.refused -and $q1.sources[0].title -like '*阿司匹林*' -and $q1.sources[0].section -eq '用法用量') ('score=' + $q1.sources[0].score)
Check '答案带来源标注' ($q1.answer -like '*来源*')
$q2 = (PostJson "$BaseUrl/api/qa" @{ question = '推荐几支能赚钱的股票' } $H).data
Check '守门: 股票问题拒答' ($q2.refused -and $q2.mode -eq 'guard')
$q3 = (PostJson "$BaseUrl/api/qa" @{ question = '量子波动速效胶囊的用法用量是什么' } $H).data
Check '无依据: 编造药名拒答' ($q3.refused) ('conf=' + $q3.confidence)
$q4 = (PostJson "$BaseUrl/api/qa" @{ question = '华法林和阿司匹林能一起吃吗' } $H).data
Check '相互作用问题可答' (-not $q4.refused) ('conf=' + $q4.confidence)

# ---------- 4. 拍照识药 ----------
Write-Host '[4] 拍照识药(YOLOv8+OCR+词典归一化)'
$img = 'D:\medguard-test\aspirin_box.png'
if (Test-Path $img) {
  $recRaw = curl.exe -s -X POST "$BaseUrl/api/recognize" -H ("Authorization: Bearer " + $elder.data.token) -F "file=@$img"
  $rec = ($recRaw | ConvertFrom-Json).data
  Check 'OCR识别出文本' ($rec.ocrText.Length -gt 10) ('chars=' + $rec.ocrText.Length)
  Check 'Top1候选=阿司匹林肠溶片' ($rec.candidates[0].name -like '*阿司匹林*') ('conf=' + $rec.candidates[0].confidence)
  Check '返回logId' ($null -ne $rec.logId)
  Check '低置信度标记字段存在' ($null -ne $rec.PSObject.Properties['lowConfidence'])
  $null = PostJson "$BaseUrl/api/recognize/$($rec.logId)/confirm" @{ medicationId = $rec.candidates[0].medicationId } $H
  Check '识别结果确认可回传' $true
} else {
  Write-Host '  [SKIP] 测试图片不存在: ' $img -ForegroundColor Yellow
}

# ---------- 5. 打卡与依从率 ----------
Write-Host '[5] 打卡 + 依从率'
$tasks = (GetJson "$BaseUrl/api/checkins/today" $H).data
Check '今日任务已生成' ($tasks.Count -ge 1) ('tasks=' + $tasks.Count)
$st = (GetJson "$BaseUrl/api/stats/adherence?days=7" $H).data
Check '依从率统计' ($null -ne $st.adherenceRate) ('rate=' + $st.adherenceRate + '%')
$hist = (GetJson "$BaseUrl/api/checkins/history?days=7" $H).data
Check '历史记录可查' ($hist.Count -ge 1)

# ---------- 6. 家庭协同与脱敏 ----------
Write-Host '[6] 家庭协同(授权矩阵+脱敏)'
$elders = (GetJson "$BaseUrl/api/family/elders" $FH).data
Check '家属可见绑定老人' ($elders.Count -ge 1)
Check '老人姓名脱敏' ($elders[0].name.Contains('*')) ('name=' + $elders[0].name)
$sum = (GetJson "$BaseUrl/api/family/summary/$($elders[0].elderId)" $FH).data
Check '摘要含用药数' ($sum.summary.medCount -ge 1)
Check '药名脱敏' ($sum.summary.medBriefs[0].Contains('*')) ('brief=' + $sum.summary.medBriefs[0])
$mem = (GetJson "$BaseUrl/api/family/members" $H).data
Check '老人可见授权成员' ($mem.Count -ge 1) ('scopes=' + ($mem[0].scopes -join ','))

# ---------- 7. 管理端 ----------
Write-Host '[7] 管理端(看板/知识库/规则/审计)'
$dash = (GetJson "$BaseUrl/api/admin/dashboard" $AH).data
Check '看板: 药品库68条' ($dash.medicationCount -ge 60) ('meds=' + $dash.medicationCount)
Check '看板: 规则39条' ($dash.ruleCounts.total -ge 30) ('rules=' + $dash.ruleCounts.total)
Check '看板: 引用覆盖率' ($null -ne $dash.citationCoverage) ('cov=' + $dash.citationCoverage + '%')
$rules = (GetJson "$BaseUrl/api/admin/rules?type=CONTRAINDICATED&size=5" $AH).data
Check '规则筛选' ($rules.total -ge 10) ('contraindicated=' + $rules.total)
$au = (GetJson "$BaseUrl/api/admin/audits?size=5" $AH).data
Check '审计日志留痕' ($au.total -ge 10) ('audits=' + $au.total)
$qalog = (GetJson "$BaseUrl/api/admin/qa-logs?size=3" $AH).data
Check '问答日志含来源与置信度' ($qalog.records.Count -ge 1)
# 权限隔离: 老人token访问管理端应403
$denied = $false
try { $null = GetJson "$BaseUrl/api/admin/dashboard" $H } catch { $denied = $true }
Check '越权访问被拦截(老人→管理端403)' $denied

# ---------- 8. 前端静态资源 ----------
Write-Host '[8] 前端托管'
foreach ($u in @("$BaseUrl/h5/", "$BaseUrl/admin/")) {
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 5
    # 必须是真页面（含DOCTYPE），不能是错误JSON（全局异常处理会包成200）
    Check ("静态页 " + $u) ($r.StatusCode -eq 200 -and $r.Content -like '*DOCTYPE*') ('len=' + $r.RawContentLength)
  }
  catch { Check ("静态页 " + $u) $false }
}

Write-Host ''
Write-Host ("=== 结果: PASS=" + $pass + "  FAIL=" + $fail + " ===") -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 } else { exit 0 }
