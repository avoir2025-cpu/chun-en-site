#!/usr/bin/env bash
# ============================================================
# process-portfolio-clients.sh — CHUN.EN 客戶作品集批次處理
# ============================================================
# 從 SOURCE_DIR 讀取原圖（任意檔名 / 子資料夾），輸出到
# assets/portfolio-clients/ 為每張產生 6 個變體：
#   <slug>-480.webp / -480.jpg
#   <slug>-960.webp / -960.jpg
#   <slug>-1440.webp / -1440.jpg
#
# 用法：
#   bash scripts/process-portfolio-clients.sh /path/to/source-dir
#
# 範例：
#   bash scripts/process-portfolio-clients.sh "/c/Users/3D-U/Downloads/客戶作品集解壓/客戶作品集/20260121_潘盛岳"
#
# 需求：ImageMagick 7+
# ============================================================

set -e
cd "$(dirname "$0")/.."

SRC_DIR="${1:-}"
if [ -z "$SRC_DIR" ] || [ ! -d "$SRC_DIR" ]; then
  echo "❌ 用法：bash scripts/process-portfolio-clients.sh <source-dir>"
  echo ""
  echo "範例（單一客戶）："
  echo "  bash scripts/process-portfolio-clients.sh '/c/Users/3D-U/Downloads/客戶作品集解壓/客戶作品集/20260121_潘盛岳'"
  echo ""
  echo "範例（手動挑選的代表作放在一個資料夾）："
  echo "  bash scripts/process-portfolio-clients.sh '/c/Users/3D-U/Downloads/portfolio-selection'"
  exit 1
fi

# --- 找到 magick ---
if command -v magick >/dev/null 2>&1; then
  MAGICK="magick"
elif [ -x "/c/Program Files/ImageMagick-7.1.2-Q16-HDRI/magick.exe" ]; then
  MAGICK="/c/Program Files/ImageMagick-7.1.2-Q16-HDRI/magick.exe"
elif compgen -G "/c/Program Files/ImageMagick-*/magick.exe" >/dev/null 2>&1; then
  MAGICK=$(ls -d /c/Program\ Files/ImageMagick-*/magick.exe 2>/dev/null | head -1)
else
  echo "❌ 找不到 magick。請先安裝 ImageMagick"
  exit 1
fi

echo "✓ 使用 ImageMagick: $MAGICK"
echo "✓ 來源目錄: $SRC_DIR"
echo ""

# --- 配置 ---
SIZES=(480 960 1440)
WEBP_QUALITY=82
JPG_QUALITY=82
OUT_DIR="assets/portfolio-clients"

mkdir -p "$OUT_DIR"

# --- 從來源資料夾名稱推出 slug 前綴 ---
# e.g. "20260121_潘盛岳" → "client-2026-01-21-pan"
# 但中文 slug 可能造成 URL 編碼問題；改用日期 + 編號 + 原檔名
folder_name=$(basename "$SRC_DIR")
# 抓日期：20260121 → 2026-01-21
date_part=$(echo "$folder_name" | grep -oE '^[0-9]{8}' || echo "")
if [ -n "$date_part" ]; then
  yyyy="${date_part:0:4}"
  mm="${date_part:4:2}"
  dd="${date_part:6:2}"
  slug_prefix="${yyyy}${mm}${dd}"
else
  slug_prefix="client"
fi

echo "→ Slug 前綴: $slug_prefix"
echo ""

# --- 計數 ---
total_in=0
total_out=0
counter=0

# --- 主迴圈 ---
for src in "$SRC_DIR"/*.{jpg,JPG,jpeg,JPEG}; do
  [ -e "$src" ] || continue

  total_in=$((total_in + 1))
  counter=$((counter + 1))

  # 用「日期 + 序號」當 slug（保持簡短、URL safe）
  printf -v idx "%02d" $counter
  slug="${slug_prefix}-${idx}"

  in_size=$(stat -c%s "$src" 2>/dev/null || stat -f%z "$src")
  echo "→ $(basename "$src") ($(($in_size / 1024 / 1024)) MB) → $slug"

  for w in "${SIZES[@]}"; do
    out_webp="$OUT_DIR/${slug}-${w}.webp"
    out_jpg="$OUT_DIR/${slug}-${w}.jpg"

    "$MAGICK" "$src" -resize "${w}x" -strip -quality "$WEBP_QUALITY" -define webp:method=6 "$out_webp" 2>/dev/null
    "$MAGICK" "$src" -resize "${w}x" -strip -quality "$JPG_QUALITY" -interlace Plane "$out_jpg" 2>/dev/null

    webp_size=$(stat -c%s "$out_webp" 2>/dev/null || stat -f%z "$out_webp")
    jpg_size=$(stat -c%s "$out_jpg" 2>/dev/null || stat -f%z "$out_jpg")
    total_out=$((total_out + 2))
    printf "  ↳ %s-%dw : webp=%dKB / jpg=%dKB\n" "$slug" "$w" $((webp_size / 1024)) $((jpg_size / 1024))
  done
done

echo ""
echo "========================================"
echo "✓ 完成"
echo "  輸入: $total_in 張原圖"
echo "  輸出: $total_out 個變體（每張 6 個：3 尺寸 × WebP+JPG）"
echo "  目錄: $OUT_DIR/"
echo "========================================"
