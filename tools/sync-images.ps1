# CHUN.EN 官網圖片同步腳本
# 讀「素材投放區」的新圖 → 壓成網頁規格 → 覆蓋 assets/gallery → push 上線
# 用法：雙擊「同步圖片.bat」，或 PowerShell 執行本檔

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$worksIn  = Join-Path $root "素材投放區\作品集"
$heroesIn = Join-Path $root "素材投放區\HERO"
$doneDir  = Join-Path $root "素材投放區\_已處理"
$worksOut  = Join-Path $root "assets\gallery\works"
$heroesOut = Join-Path $root "assets\gallery\heroes"

$heroPages = @("about","a-voir","b-room","c-photos","signature","booking","enterprise")
$exts = @(".jpg",".jpeg",".png")
$changed = @()

function Get-Magick {
    $m = Get-Command magick -ErrorAction SilentlyContinue
    if (-not $m) { Write-Host "[錯誤] 找不到 ImageMagick（magick）。請先安裝：winget install ImageMagick.ImageMagick" -ForegroundColor Red; exit 1 }
}
Get-Magick

# ---- 作品集：檔名必須是 01~12 ----
Get-ChildItem $worksIn -File | Where-Object { $exts -contains $_.Extension.ToLower() } | ForEach-Object {
    $n = $_.BaseName
    if ($n -notmatch '^(0[1-9]|1[0-4])$') {
        Write-Host "[略過] 作品集\$($_.Name)：檔名必須是 01~14（例如 03.jpg）" -ForegroundColor Yellow
        return
    }
    Write-Host "[作品] $($_.Name) → works/$n-*"
    magick $_.FullName -auto-orient -resize "900>"  -quality 82 (Join-Path $worksOut "$n-900.webp")
    magick $_.FullName -auto-orient -resize "1600>" -quality 80 (Join-Path $worksOut "$n-1600.webp")
    magick $_.FullName -auto-orient -resize "1400>" -quality 85 (Join-Path $worksOut "$n-1400.jpg")
    Move-Item $_.FullName (Join-Path $doneDir ("works_{0}_{1}{2}" -f $n, (Get-Date -Format "yyyyMMddHHmm"), $_.Extension)) -Force
    $script:changed += "作品 $n"
}

# ---- HERO：檔名必須是頁面名 ----
Get-ChildItem $heroesIn -File | Where-Object { $exts -contains $_.Extension.ToLower() } | ForEach-Object {
    $n = $_.BaseName.ToLower()
    if ($heroPages -notcontains $n) {
        Write-Host "[略過] HERO\$($_.Name)：檔名必須是 $($heroPages -join ' / ')" -ForegroundColor Yellow
        return
    }
    Write-Host "[HERO] $($_.Name) → heroes/$n-*"
    magick $_.FullName -auto-orient -resize "960>"  -quality 82 (Join-Path $heroesOut "$n-960.webp")
    magick $_.FullName -auto-orient -resize "1600>" -quality 80 (Join-Path $heroesOut "$n-1600.webp")
    magick $_.FullName -auto-orient -resize "960>"  -quality 85 (Join-Path $heroesOut "$n-960.jpg")
    Move-Item $_.FullName (Join-Path $doneDir ("hero_{0}_{1}{2}" -f $n, (Get-Date -Format "yyyyMMddHHmm"), $_.Extension)) -Force
    $script:changed += "HERO $n"
}

if ($changed.Count -eq 0) {
    Write-Host "投放區沒有新圖片。把圖丟進「素材投放區\作品集」（檔名 01~12）或「素材投放區\HERO」（檔名=頁面名）再執行。"
    exit 0
}

# ---- 上線 ----
git add assets/gallery
git commit -m ("更新圖片：{0}" -f ($changed -join "、"))
git push
Write-Host ""
Write-Host ("完成！已更新：{0}" -f ($changed -join "、")) -ForegroundColor Green
Write-Host "GitHub Pages 部署約 1-3 分鐘，圖片快取最多再等 10 分鐘。原始圖已備份到 素材投放區\_已處理\"
