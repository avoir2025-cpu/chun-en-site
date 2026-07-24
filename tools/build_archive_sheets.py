# -*- coding: utf-8 -*-
"""客戶素材庫聯絡表產生器：每張圖放 4 個資料夾，每組抽樣 8 張

用途：建立／更新素材庫的調性分類。新客戶進資料夾後重跑，只會補產新的那幾張。

用法：
    python tools/build_archive_sheets.py              # 只產尚未存在的
    python tools/build_archive_sheets.py --rebuild    # 全部重產
"""
import os
import sys
import glob
from PIL import Image, ImageDraw, ImageFont

SRC = r'C:\Users\3D-U\Desktop\Claude\客戶作品集原檔'
OUT = r'C:\Users\3D-U\Desktop\Claude\客戶作品集原檔\_聯絡表'
FONT = r'C:\Windows\Fonts\msjh.ttc'

PER_SHEET = 4          # 每張圖幾個資料夾
SAMPLES = 8            # 每個資料夾抽幾張
CELL = 190
LABEL_W = 250
INK = (20, 16, 11)
PAPER = (245, 241, 232)
GOLD = (200, 172, 122)
MUTED = (150, 140, 122)


def f(sz):
    try:
        return ImageFont.truetype(FONT, sz)
    except Exception:
        return ImageFont.load_default()


def folders():
    out = []
    for d in sorted(os.listdir(SRC)):
        p = os.path.join(SRC, d)
        if not os.path.isdir(p) or d.startswith('_聯絡表'):
            continue
        files = sorted([x for x in glob.glob(os.path.join(p, '**', '*'), recursive=True)
                        if x.lower().endswith(('.jpg', '.jpeg', '.png'))])
        if files:
            out.append((d, files))
    return out


def sample(files, n):
    if len(files) <= n:
        return files
    step = len(files) / n
    return [files[int(i * step)] for i in range(n)]


def build(group, idx, rebuild):
    out = os.path.join(OUT, f'sheet_{idx:02d}.jpg')
    if os.path.exists(out) and not rebuild:
        return None
    rows = len(group)
    W = LABEL_W + SAMPLES * CELL
    H = rows * (CELL + 26) + 40
    canvas = Image.new('RGB', (W, H), INK)
    d = ImageDraw.Draw(canvas)
    for r, (name, files) in enumerate(group):
        y = 20 + r * (CELL + 26)
        d.text((16, y + 8), name[:22], font=f(19), fill=GOLD)
        d.text((16, y + 36), f'{len(files)} 張', font=f(16), fill=MUTED)
        for c, fp in enumerate(sample(files, SAMPLES)):
            try:
                im = Image.open(fp).convert('RGB')
            except Exception:
                continue
            im.thumbnail((CELL - 8, CELL - 8), Image.LANCZOS)
            x = LABEL_W + c * CELL + (CELL - im.width) // 2
            canvas.paste(im, (x, y + (CELL - im.height) // 2))
        d.line([(0, y + CELL + 12), (W, y + CELL + 12)], fill=(56, 48, 38), width=1)
    canvas.save(out, quality=70, optimize=True)
    return out, [n for n, _ in group]


def main():
    rebuild = '--rebuild' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    fs = folders()
    print(f'資料夾 {len(fs)} 個')
    made = 0
    for i in range(0, len(fs), PER_SHEET):
        r = build(fs[i:i + PER_SHEET], i // PER_SHEET + 1, rebuild)
        if r:
            made += 1
            print(f'  sheet_{i//PER_SHEET+1:02d}: ' + '、'.join(r[1]))
    print(f'產出 {made} 張，輸出於 {OUT}')


if __name__ == '__main__':
    main()
