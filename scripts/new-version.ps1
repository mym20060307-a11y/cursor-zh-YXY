# Windows 二次开发：适配下一个 Cursor Stable（等价于 scripts/new-version.sh 的本机路径）
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/new-version.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/new-version.ps1 -Version 3.28.7
# 依赖：python、node、curl/Invoke-WebRequest；缓存目录 .cache/v/<version>/
param(
  [string]$Version = 'latest'
)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Repo
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'

function Get-Api([string]$Platform, [string]$Field) {
  $j = Invoke-RestMethod "https://cursor.com/api/download?platform=$Platform&releaseTrack=stable"
  return $j.$Field
}

$Latest = Get-Api 'linux-x64' 'version'
if ($Version -eq 'latest') { $Version = $Latest }
Write-Host "· Cursor $Version（线上最新 $Latest）"

$Cache = Join-Path $Repo ".cache\v\$Version"
New-Item -ItemType Directory -Force -Path $Cache | Out-Null
$Deb = Join-Path $Cache 'cursor.deb'
$LinuxRoot = Join-Path $Cache 'linux\usr\share\cursor'
$Product = Join-Path $LinuxRoot 'resources\app\product.json'

if (-not (Test-Path $Deb) -or (Get-Item $Deb).Length -lt 1MB) {
  Write-Host '· 下载 linux amd64 .deb'
  $debUrl = if ($Version -eq $Latest) {
    (Invoke-RestMethod 'https://cursor.com/api/download?platform=linux-x64&releaseTrack=stable').debUrl
  } else {
    throw "非最新版请自行提供 .deb 到 $Deb，或先装最新版再跑"
  }
  Invoke-WebRequest -Uri $debUrl -OutFile "$Deb.part" -UseBasicParsing
  Move-Item -Force "$Deb.part" $Deb
}

if (-not (Test-Path $Product)) {
  Write-Host '· 解包 .deb'
  $stage = Join-Path $Cache 'deb-stage'
  Remove-Item -Recurse -Force $stage, (Join-Path $Cache 'linux') -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $stage, (Join-Path $Cache 'linux') | Out-Null
  Push-Location $stage
  tar -xf $Deb
  $data = Get-ChildItem -Filter 'data.tar*' | Select-Object -First 1
  if (-not $data) { throw 'deb 内没有 data.tar*' }
  tar -xf $data.FullName -C (Join-Path $Cache 'linux')
  Pop-Location
}

$pj = Get-Content $Product -Raw -Encoding utf8 | ConvertFrom-Json
Write-Host "· commit $($pj.commit)  vscode $($pj.vscodeVersion)"

$Seed = Join-Path $Repo 'anchors\3.27.22.json'
if (-not (Test-Path $Seed)) {
  $Seed = (Get-ChildItem (Join-Path $Repo 'anchors\*.json') | Sort-Object Name | Select-Object -Last 1).FullName
}
$LpGlob = Join-Path $env:USERPROFILE ".cursor\extensions\ms-ceintl.vscode-language-pack-zh-hans-$($pj.vscodeVersion)*\translations\main.i18n.json"
$Lp = Get-Item $LpGlob -ErrorAction SilentlyContinue | Select-Object -Last 1 -ExpandProperty FullName
$Report = Join-Path $Cache 'anchors-report.txt'
$pyArgs = @('scripts\build-anchors.py', $LinuxRoot, '--seed', $Seed)
if ($Lp) { $pyArgs += @('--langpack', $Lp); Write-Host "· langpack $Lp" } else { Write-Host '· 未找到语言包，将跳过 NLS 条目生成' }

Write-Host '· 生成锚点'
& python @pyArgs 1> $Report 2>&1
if ($LASTEXITCODE -ne 0) { Get-Content $Report -Tail 40 -Encoding utf8; throw 'build-anchors 失败' }
Get-Content $Report -Tail 2 -Encoding utf8

Write-Host '· 更新 manifest'
node scripts\build-manifest.mjs | Out-Null

Write-Host '· verify-platform-trees'
$VerifyLog = Join-Path $Cache 'verify.log'
node scripts\verify-platform-trees.mjs "linux=linux:$LinuxRoot" 1> $VerifyLog 2>&1
if ($LASTEXITCODE -ne 0) { Get-Content $VerifyLog -Tail 30 -Encoding utf8; throw 'verify 未通过' }
Write-Host '· verify 通过'

Write-Host '· npm test'
npm test --silent
if ($LASTEXITCODE -ne 0) { throw 'npm test 未通过' }

Write-Host @"

下一步：
  1. 看 .cache/v/$Version/missing.txt（需 node .cache/v/$Version/parse-report.mjs 或对照 report）补词典后重跑本脚本
  2. 真机：把 Cursor 升到 $Version 后 node scripts/run.mjs status / localize
  3. 提交 anchors/$Version.json dicts/manifest.json（及词典改动）
"@
