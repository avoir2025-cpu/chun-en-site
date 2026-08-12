# -*- coding: utf-8 -*-
"""after-the-shoot 內文示意圖：一次拍攝，四種崗位

來源素材＝客戶作品集原檔中同一場拍攝的四套造型（作品牆已收錄）。
執行前設定環境變數 CHUNEN_DIAGRAM_SRC 指向該資料夾。
2 倍算繪後降採樣到 1400 寬，輸出 assets/gallery/journal/after-the-shoot-roles-v1-1400.jpg。

重跑：python tools/diagram-src/after-the-shoot-roles.py
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageOps

SRC = os.environ.get("CHUNEN_DIAGRAM_SRC", "")   # 素材資料夾走環境變數，不寫死客戶姓名與本機路徑
OUT = os.path.join(os.path.dirname(__file__), "..", "..",
                   "assets", "gallery", "journal", "after-the-shoot-roles-v1-1400.jpg")

S = 2                                    # 算繪倍率，最後降採樣
BG, GOLD, TXT, MUTE, INK = (20, 16, 11), (201, 169, 110), (245, 239, 228), (139, 125, 107), (28, 26, 24)
SER = lambda s: ImageFont.truetype(r"C:\Windows\Fonts\NotoSerifTC-VF.ttf", s * S)
SAN = lambda s: ImageFont.truetype(r"C:\Windows\Fonts\NotoSansTC-VF.ttf", s * S)
img = lambda n: Image.open(os.path.join(SRC, n))

W, M = 1400 * S, 64 * S
AV = W - 2 * M
c = Image.new("RGB", (W, 1500 * S), BG)
d = ImageDraw.Draw(c)

d.text((M, 52 * S), "一次拍攝，四種崗位", font=SER(46), fill=TXT)
d.text((M, 124 * S), "同一位客戶、同一天，不同場景與鏡位。拿到的不是二十張照片，是四個各自有位置可去的版本。",
       font=SAN(24), fill=MUTE)
d.line((M, 182 * S, W - M, 182 * S), fill=(80, 68, 50), width=2 * S)

# 主視覺：橫幅＋標題留白示意
hh = int(AV * 9 / 21)
c.paste(ImageOps.fit(img("DSC03687 2.jpg"), (AV, hh), Image.LANCZOS, centering=(0.5, 0.15)), (M, 214 * S))
tx, ty = M + 52 * S, 214 * S + hh // 2
d.text((tx, ty - 58 * S), "在客戶搜尋你之前，", font=SER(34), fill=INK)
d.text((tx, ty - 6 * S), "先決定他看見什麼", font=SER(34), fill=INK)
d.text((tx, ty + 56 * S), "（示意：標題就放在這片留白上）", font=SAN(17), fill=(110, 104, 96))

ly = 214 * S + hh + 18 * S
d.text((M, ly), "主視覺", font=SER(26), fill=GOLD)
d.text((M + 112 * S, ly + 6 * S), "官網首頁、演講海報、活動主視覺。人物偏一側，留白讓標題有地方放。",
       font=SAN(23), fill=MUTE)

# 三個支援崗位
y0 = ly + 64 * S
th = int((AV - 2 * 28 * S) / 3.3)
tiles = [
    ("DSC03867 2.jpg", 1.0, (0.5, 0.10), "識別照", "LinkedIn、名片、Email 簽名檔。縮到很小、裁成圓形，都還認得出是你。"),
    ("DSC04003 2.jpg", 1.5, (0.5, 0.50), "情境照", "社群貼文、簡報內頁、媒體採訪。看得到姿態與環境，不只是一張臉。"),
    ("DSC03791 2.jpg", 0.8, (0.5, 0.40), "生活感", "限時動態、專訪配圖。放鬆的版本，讓專業之外還有一個人。"),
]
x = M
for f, r, cen, name, use in tiles:
    tw = int(th * r)
    c.paste(ImageOps.fit(img(f), (tw, th), Image.LANCZOS, centering=cen), (x, y0))
    d.text((x, y0 + th + 14 * S), name, font=SER(29), fill=GOLD)
    line, yy = "", y0 + th + 58 * S
    maxch = max(8, int(tw / (21 * S)))   # 一行最多幾個字，依這格寬度算，避免溢出右緣
    for ch in use:                       # 中文逐字排版：標點優先斷行，超寬則硬斷
        line += ch
        if (len(line) >= maxch - 3 and ch in "。、，") or len(line) >= maxch:
            d.text((x, yy), line.strip(), font=SAN(21), fill=MUTE)
            line, yy = "", yy + 30 * S
    if line:
        d.text((x, yy), line.strip(), font=SAN(21), fill=MUTE)
    x += tw + 28 * S

fy = y0 + th + 168 * S
d.line((M, fy, W - M, fy), fill=(80, 68, 50), width=2 * S)
d.text((M, fy + 26 * S), "照片沒被用上，常常不是拍得不好，是這四個位置當初沒有一起被想過。", font=SER(24), fill=TXT)

c = c.crop((0, 0, W, fy + 80 * S)).resize((W // S, (fy + 80 * S) // S), Image.LANCZOS)
c.save(os.path.abspath(OUT), quality=88, optimize=True)
print("已輸出", os.path.abspath(OUT), c.size)
