param([switch]$SkipPortableBuild)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$release = Join-Path $project 'release'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw '缺少 Windows .NET Framework C# 编译器 csc.exe。' }
if (-not $SkipPortableBuild) {
    Push-Location $project
    try { & npm.cmd run build:portable; if ($LASTEXITCODE -ne 0) { throw '生产服务器构建失败。' } }
    finally { Pop-Location }
}
$version = (Get-Content -LiteralPath (Join-Path $project 'package.json') -Raw | ConvertFrom-Json).version
$portableZip = Join-Path $release "ElbowMayhem-Windows-x64-v$version.zip"
if (-not (Test-Path -LiteralPath $portableZip)) { throw "缺少便携服务器包：$portableZip" }
$stage = Join-Path $release ('.gui-stage-' + [guid]::NewGuid().ToString('N'))
$package = Join-Path $stage '肘击大乱斗'
$server = Join-Path $package 'GameServer'
$finalFolder = Join-Path $release '肘击大乱斗'
$finalZip = Join-Path $release "ElbowMayhem-Windows-x64-GUI-v$version.zip"
New-Item -ItemType Directory -Path $stage, $package, $server, (Join-Path $package 'config'), (Join-Path $package 'logs') -Force | Out-Null
try {
    & tar.exe -xf $portableZip -C $stage
    if ($LASTEXITCODE -ne 0) { throw '解压便携服务器包失败。' }
    $extracted = Join-Path $stage 'ElbowMayhem'
    if (-not (Test-Path -LiteralPath (Join-Path $extracted 'GameServer.exe'))) { throw '便携服务器包内缺少 GameServer.exe。' }
    Get-ChildItem -LiteralPath $extracted -Force | Copy-Item -Destination $server -Recurse -Force
    & $compiler /nologo /target:winexe /platform:x64 "/out:$(Join-Path $package '肘击大乱斗启动器.exe')" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /reference:System.Core.dll (Join-Path $project 'launcher-win\Program.cs') (Join-Path $project 'launcher-win\SakuraBridge.cs')
    if ($LASTEXITCODE -ne 0) { throw 'WinForms 启动器编译失败。' }
    Copy-Item -LiteralPath (Join-Path $project 'launcher-win\README.txt') -Destination (Join-Path $package 'README.txt')
    if (Test-Path -LiteralPath $finalFolder) {
        $resolved = [IO.Path]::GetFullPath($finalFolder)
        $base = [IO.Path]::GetFullPath($release).TrimEnd('\') + '\'
        if (-not $resolved.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw '拒绝清理非 release 目录。' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    Move-Item -LiteralPath $package -Destination $finalFolder
    if (Test-Path -LiteralPath $finalZip) { Remove-Item -LiteralPath $finalZip -Force }
    & tar.exe -a -c -f $finalZip -C $release '肘击大乱斗'
    if ($LASTEXITCODE -ne 0) { throw 'GUI ZIP 创建失败。' }
    $zip = Get-Item -LiteralPath $finalZip
    $hash = Get-FileHash -LiteralPath $finalZip -Algorithm SHA256
    Write-Output "EXE: $(Join-Path $finalFolder '肘击大乱斗启动器.exe')"
    Write-Output "ZIP: $finalZip"
    Write-Output "SIZE: $($zip.Length)"
    Write-Output "SHA256: $($hash.Hash)"
}
finally {
    if (Test-Path -LiteralPath $stage) {
        $resolved = [IO.Path]::GetFullPath($stage)
        $base = [IO.Path]::GetFullPath($release).TrimEnd('\') + '\'
        if ($resolved.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $resolved -Recurse -Force }
    }
}
