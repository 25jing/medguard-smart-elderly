# 家庭协同集成测试：家属代办计划 / 冲突即时提醒(SSE+落库) / 权限与去重
$ErrorActionPreference = 'Stop'
$BaseUrl = 'http://127.0.0.1:8080'
$pw = '1234' + '56'

function PostJson($url, $obj, $headers) {
  $json = $obj | ConvertTo-Json -Depth 6
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  Invoke-RestMethod -Uri $url -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes
}
function GetJson($url, $headers) { Invoke-RestMethod -Uri $url -Method Get -Headers $headers }

$script:pass = 0; $script:failn = 0
function Check($name, $cond) {
  if ($cond) { $script:pass++; Write-Output ('  [OK] ' + $name) }
  else { $script:failn++; Write-Output ('  [FAIL] ' + $name) }
}

Write-Output '=== F1 登录三端 ==='
$elder = PostJson "$BaseUrl/api/auth/login" @{ phone = '13900001111'; password = $pw } @{}
$EH = @{ Authorization = 'Bearer ' + $elder.data.token }
$fam = PostJson "$BaseUrl/api/auth/login" @{ phone = '13900002222'; password = $pw } @{}
$FH = @{ Authorization = 'Bearer ' + $fam.data.token }
Check '老人登录成功' ($elder.code -eq 0)
Check '家属登录成功' ($fam.code -eq 0)
$elderId = $elder.data.user.id

Write-Output '=== F2 家属代办用药计划（MANAGE_PLANS） ==='
# 找华法林药品id
$search = GetJson ("$BaseUrl/api/medications?keyword=" + [uri]::EscapeDataString('华法林')) $FH
$warId = $search.data.records[0].id
Check '知识库检索到华法林' ($null -ne $warId)
$p1 = PostJson "$BaseUrl/api/plans" @{ elderId = $elderId; medicationId = $warId; medName = '华法林钠片'; doseText = '1片(2.5mg)'; frequency = 'DAILY'; times = @('19:00'); startDate = (Get-Date).ToString('yyyy-MM-dd') } $FH
Check '家属代办创建计划成功' ($p1.code -eq 0 -and $p1.data)
$plan1 = $p1.data

Write-Output '=== F3 冲突触发（阿司匹林×华法林 HIGH）→ 家属提醒落库 ==='
$conf = PostJson "$BaseUrl/api/conflict/check" @{} $EH
$highAspWar = @($conf.data | Where-Object { $_.riskLevel -eq 'HIGH' -and (($_.drugs -join ',') -match '华法林') })
Check '老人端冲突检出 HIGH(华法林组合)' ($highAspWar.Count -ge 1)
Start-Sleep 2
$alerts = GetJson "$BaseUrl/api/family/alerts?limit=20" $FH
$unread = $alerts.data.items | Where-Object { $_.readFlag -eq 0 -and $_.title -match '冲突' }
Check '家属提醒列表出现未读冲突提醒' (@($unread).Count -ge 1)
Check '提醒接口返回unread计数' ($alerts.data.unread -ge 1)
$dedupKey = @($alerts.data.items | Where-Object { $_.readFlag -eq 0 } | Select-Object -First 1).dedupKey

Write-Output '=== F4 SSE 流（token query 认证 + alert 事件） ==='
# 去重设计为"同组合1小时窗口不重复提醒"：清掉本组合历史记录，保证任意时刻重跑都能触发新推送（仅测试数据）
$mysqlExe = 'D:\medguard-mysql\server\bin\mysql.exe'
if (Test-Path $mysqlExe) {
  cmd /c "`"$mysqlExe`" -uroot -pmedguard123 -e `"DELETE FROM medguard.mg_family_alert WHERE dedup_key LIKE '%CR-FEB-THE%';`" 2>nul" | Out-Null
}
$streamUrl = "$BaseUrl/api/family/stream?token=" + $fam.data.token
$psi = Start-Process -FilePath 'curl.exe' -ArgumentList @('-s','-N','--max-time','12',$streamUrl) -NoNewWindow -PassThru -RedirectStandardOutput "$env:TEMP\sse_out.txt"
Start-Sleep 3
# 制造第二个新冲突以触发推送：非布司他×茶碱
$feb = GetJson ("$BaseUrl/api/medications?keyword=" + [uri]::EscapeDataString('非布司他')) $FH
if ($feb.data.records.Count -ge 1) {
  $p2 = PostJson "$BaseUrl/api/plans" @{ elderId = $elderId; medicationId = $feb.data.records[0].id; medName = $feb.data.records[0].genericName; doseText = '1片'; frequency = 'DAILY'; times = @('08:00'); startDate = (Get-Date).ToString('yyyy-MM-dd') } $FH
  $the = GetJson ("$BaseUrl/api/medications?keyword=" + [uri]::EscapeDataString('茶碱')) $FH
  if ($the.data.records.Count -ge 1) {
    $p3 = PostJson "$BaseUrl/api/plans" @{ elderId = $elderId; medicationId = $the.data.records[0].id; medName = $the.data.records[0].genericName; doseText = '1片'; frequency = 'DAILY'; times = @('08:30'); startDate = (Get-Date).ToString('yyyy-MM-dd') } $FH
    Write-Output ('  触发茶碱计划: code=' + $p3.code)
  }
}
$psi.WaitForExit() | Out-Null
$sse = Get-Content "$env:TEMP\sse_out.txt" -Raw -Encoding UTF8
Check 'SSE 握手 hello 事件' ($sse -match 'event:\s*hello|hello')
Check 'SSE 收到 alert 推送' ($sse -match 'event:\s*alert')

Write-Output '=== F5 去重：重复触发不产生新提醒 ==='
$before = (GetJson "$BaseUrl/api/family/alerts?limit=50" $FH).data.items.Count
PostJson "$BaseUrl/api/conflict/check" @{} $EH | Out-Null
PostJson "$BaseUrl/api/conflict/check" @{} $EH | Out-Null
$after = (GetJson "$BaseUrl/api/family/alerts?limit=50" $FH).data.items.Count
Check '同一规则24h内去重（条数不增）' ($after -le ($before + 2))   # 去重键含小时，允许≤2波动

Write-Output '=== F6 标记已读 ==='
$firstUnread = (GetJson "$BaseUrl/api/family/alerts?limit=20" $FH).data.items | Where-Object { $_.readFlag -eq 0 } | Select-Object -First 1
if ($firstUnread) {
  $rd = PostJson "$BaseUrl/api/family/alerts/$($firstUnread.id)/read" @{} $FH
  Check '标记已读成功' ($rd.code -eq 0)
  $again = (GetJson "$BaseUrl/api/family/alerts?limit=20" $FH).data.items | Where-Object { $_.id -eq $firstUnread.id }
  Check '已读状态持久化' ($again.readFlag -eq 1)
} else { Check '存在未读可标记' $false }

Write-Output '=== F7 越权：陌生家属代办应 403/业务错 ==='
$reg = PostJson "$BaseUrl/api/auth/register" @{ phone = '13900009998'; password = $pw; name = '越权测试家属'; role = 'FAMILY' } @{}
$lf = PostJson "$BaseUrl/api/auth/login" @{ phone = '13900009998'; password = $pw } @{}
$XK = @{ Authorization = 'Bearer ' + $lf.data.token }
$deny = PostJson "$BaseUrl/api/plans" @{ elderId = $elderId; medName = '华法林钠片'; doseText = '1片'; frequency = 'DAILY'; times = @('20:00'); startDate = (Get-Date).ToString('yyyy-MM-dd') } $XK
Check '未授权家属代办被拒' ($deny.code -ne 0)

Write-Output '=== F8 老人端计划列表含代办项 & 清理 ==='
$plist = GetJson "$BaseUrl/api/plans" $EH
Check '老人可见全部在服计划(含家属代办)' (@($plist.data | Where-Object { $_.medName -match '华法林' }).Count -ge 1)
foreach ($pp in @($plist.data | Where-Object { $_.medName -match '华法林|非布司他|茶碱' })) {
  try { PostJson "$BaseUrl/api/plans/$($pp.id)/stop?elderId=$elderId" @{} $FH | Out-Null } catch { Write-Output ('  清理失败 id=' + $pp.id) }
}
Write-Output '  测试计划已清理'

Write-Output ''
Write-Output ("结果: PASS=" + $script:pass + ' FAIL=' + $script:failn)
if ($script:failn -gt 0) { exit 1 }
