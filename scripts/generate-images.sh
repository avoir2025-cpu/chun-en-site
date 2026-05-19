#!/usr/bin/env bash
# ============================================================
# generate-images.sh — CHUN.EN 響應式圖片產生器
# ============================================================
# 從 assets/images/dsc*.jpg 為每張原圖產生 6 個變體：
#   ./dsc-XXX-480.webp   ./dsc-XXX-480.jpg
#   ./dsc-XXX-960.webp   ./dsc-XXX-960.jpg
#   ./dsc-XXX-1440.webp  ./dsc-XXX-1440.jpg
#
# 使用：bash scripts/generate-images.sh
# 需求：ImageMagick 7+ (magick command)
# ============================================================

set -e
cd "$(dirname "$0")/.."

# --- 找到 magick 執行檔（支援 Windows / macOS / Linux）---
if command -v magick >/dev/null 2>&1; then
  MAGICK="magick"
elif [ -x "/c/Program Files/ImageMagick-7.1.2-Q16-HDRI/magick.exe" ]; then
  MAGICK="/c/Program Files/ImageMagick-7.1.2-Q16-HDRI/magick.exe"
elif compgen -G "/c/Program Files/ImageMagick-*/magick.exe" >/dev/null 2>&1; then
  MAGICK=$(ls -d /c/Program\ Files/ImageMagick-*/magick.exe 2>/dev/null | head -1)
else
  echo "❌ 找不到 magick。請先安裝 ImageMagick："
  echo "   winget install ImageMagick.ImageMagick"
  exit 1
fi

echo "✓ 使用 ImageMagick: $MAGICK"
echo ""

# --- 配置 ---
SIZES=(480 960 1440)
WEBP_QUALITY=82
JPG_QUALITY=82
SRC_DIR="assets/images"

# --- 計數 ---
total_in=0
total_out=0
total_bytes_in=0
total_bytes_out=0

# --- 主迴圈 ---
for src in "$SRC_DIR"/dsc*.jpg; do
  # 跳過已產生的變體（dsc03134-480.jpg 等）
  base=$(basename "$src" .jpg)
  if [[ "$base" =~ -[0-9]+$ ]]; then
    continue
  fi

  total_in=$((total_in + 1))
  in_size=$(stat -c%s "$src" 2>/dev/null || stat -f%z "$src")
  total_bytes_in=$((total_bytes_in + in_size))

  echo "→ $base.jpg ($(($in_size / 1024)) KB)"

  for w in "${SIZES[@]}"; do
    # WebP variant
    out_webp="$SRC_DIR/${base}-${w}.webp"
    "$MAGICK" "$src" \
      -resize "${w}x" \
      -strip \
      -quality "$WEBP_QUALITY" \
      "$out_webp"
    out_size=$(stat -c%s "$out_webp" 2>/dev/null || stat -f%z "$out_webp")
    total_bytes_out=$((total_bytes_out + out_size))
    total_out=$((total_out + 1))
    printf "  ↳ %s-%dw.webp  %d KB\n" "$base" "$w" $((out_size / 1024))

    # JPG variant (fallback for old Safari)
    out_jpg="$SRC_DIR/${base}-${w}.jpg"
    "$MAGICK" "$src" \
      -resize "${w}x" \
      -strip \
      -quality "$JPG_QUALITY" \
      "$out_jpg"
    out_size=$(stat -c%s "$out_jpg" 2>/dev/null || stat -f%z "$out_jpg")
    total_bytes_out=$((total_bytes_out + out_size))
    total_out=$((total_out + 1))
    printf "  ↳ %s-%dw.jpg   %d KB\n" "$base" "$w" $((out_size / 1024))
  done
  echo ""
done

# --- 摘要 ---
echo "========================================"
echo "✓ 完成"
echo "  原始：$total_in 張 ($((total_bytes_in / 1024)) KB)"
echo "  產生：$total_out 個變體 ($((total_bytes_out / 1024)) KB)"
echo "========================================"
