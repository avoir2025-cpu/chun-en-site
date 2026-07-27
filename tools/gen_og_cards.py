# -*- coding: utf-8 -*-
"""產生 journal 文章的社群分享卡（og:image）。

為什麼要有這支：og:image 若直接指向 1400x2100 的直幅主圖，LinkedIn / Facebook /
X 的分享卡是 1.91:1 或 2:1 橫幅，會把人臉裁掉。這支照 assets/img/og-card.jpg 的
既有版型，把主圖放右側（用臉部偵測定位，確保臉完整入鏡），左側放品牌與文章標題。

用法：
    python tools/gen_og_cards.py            # 產圖到 assets/og/
    python tools/gen_og_cards.py --one 檔名  # 只產一張，用來看樣

臉部偵測需要 opencv-python-headless<5 與 haarcascade xml（見 CASCADE 常數）。
偵測不到臉時退回「臉大約在畫面上方 30%」的經驗值。
"""
import argparse
import glob
import io
import json
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'assets', 'og')
SCRATCH = os.environ.get('CHUNEN_SCRATCH', os.path.join(ROOT, '.og-build'))
CASCADE = os.path.join(SCRATCH, 'haar_face.xml')
FONT_DIR = SCRATCH

W, H = 1200, 630
PHOTO_W = 500
PAD_X = 72
BG = (20, 17, 12)
CREAM = (245, 241, 232)
GOLD = (201, 169, 110)
GOLD_RULE = (171, 137, 92)
MUTED = (139, 125, 107)

F_ITALIANA = os.path.join(FONT_DIR, 'Italiana-Regular.ttf')
F_SERIF = 'C:/Windows/Fonts/NotoSerifTC-VF.ttf'
F_SANS = 'C:/Windows/Fonts/NotoSansTC-VF.ttf'


def font(path, size, weight=None):
    f = ImageFont.truetype(path, size)
    if weight is not None:
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
    return f


def face_center(path):
    """回傳臉部中心的相對位置 (0-1)，偵測不到就回 None。"""
    try:
        import cv2
    except ImportError:
        return None
    if not os.path.exists(CASCADE):
        return None
    cc = cv2.CascadeClassifier(CASCADE)
    if cc.empty():
        return None
    # cv2.imread 在 Windows 讀不了含中文的路徑，先自己讀 bytes 再 decode
    import numpy as np
    with open(path, 'rb') as fh:
        buf = np.frombuffer(fh.read(), dtype=np.uint8)
    im = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if im is None:
        return None
    h, w = im.shape[:2]
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    faces = cc.detectMultiScale(gray, 1.1, 6, minSize=(int(w * 0.06), int(w * 0.06)))
    if len(faces) == 0:
        return None
    x, y, fw, fh = max(faces, key=lambda r: r[2] * r[3])
    return ((x + fw / 2) / w, (y + fh / 2) / h)


def crop_photo(path, target_w, target_h, focus):
    """把主圖裁成 target_w x target_h，並讓 focus 點落在卡片的視覺甜蜜點。"""
    im = Image.open(path).convert('RGB')
    w, h = im.size
    fx, fy = focus
    target_ratio = target_w / target_h
    if w / h > target_ratio:            # 太寬，裁寬度
        new_w = int(h * target_ratio)
        left = int(fx * w - new_w / 2)
        left = max(0, min(w - new_w, left))
        box = (left, 0, left + new_w, h)
    else:                                # 太高，裁高度
        new_h = int(w / target_ratio)
        # 讓臉落在裁切框上方 42% 處，臉才不會貼齊邊緣
        top = int(fy * h - new_h * 0.42)
        top = max(0, min(h - new_h, top))
        box = (0, top, w, top + new_h)
    return im.crop(box).resize((target_w, target_h), Image.LANCZOS)


# 避頭點：這些字元不能出現在行首，寧可讓它吊在上一行行尾
NO_LINE_START = '，。、；：？！）」』】〉》〕｝…‧·%'
# 避尾點：這些不能留在行尾，要跟著下一個字一起換行
NO_LINE_END = '（「『【〈《〔｛'


def wrap(text, fnt, max_w, draw):
    """中文逐字斷行，含避頭點／避尾點；| 是作者在 H1 用 <br> 指定的換行。"""
    lines = []
    for seg in text.split('|'):
        seg = seg.strip()
        if not seg:
            continue
        cur = ''
        for ch in seg:
            if draw.textlength(cur + ch, font=fnt) <= max_w:
                cur += ch
                continue
            if ch in NO_LINE_START:
                # 吊在行尾，不讓標點自己占一行
                cur += ch
                continue
            if cur and cur[-1] in NO_LINE_END:
                lines.append(cur[:-1])
                cur = cur[-1] + ch
                continue
            lines.append(cur)
            cur = ch
        if cur:
            lines.append(cur)
    return lines


def build_card(img_path, eyebrow, title, out_path):
    card = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(card)

    focus = face_center(img_path) or (0.5, 0.30)
    photo = crop_photo(img_path, PHOTO_W, H, focus)
    card.paste(photo, (W - PHOTO_W, 0))

    # 照片左緣往左漸層淡入底色，避免硬邊
    fade_w = 200
    fade = Image.new('L', (fade_w, 1))
    for x in range(fade_w):
        fade.putpixel((x, 0), int(255 * (1 - x / fade_w)))
    fade = fade.resize((fade_w, H))
    card.paste(Image.new('RGB', (fade_w, H), BG), (W - PHOTO_W, 0), fade)

    # 左側文字
    f_brand = font(F_ITALIANA, 44)
    f_eyebrow = font(F_SANS, 19, 300)
    f_foot = font(F_SANS, 17, 300)

    max_w = W - PHOTO_W - PAD_X - 60
    # 標題字級由大往小試，直到排得下三行、而且最後一行不會只剩一兩個字落單
    for size in (40, 38, 36, 34, 32, 30):
        f_title = font(F_SERIF, size, 350)
        lines = wrap(title, f_title, max_w, d)
        if len(lines) <= 3 and all(len(l) >= 4 for l in lines[1:]):
            break
    lines = lines[:3]
    line_h = int(size * 1.45)

    # 整塊垂直置中
    block_h = 62 + 26 + 1 + 26 + 30 + 20 + len(lines) * line_h
    y = max(84, (H - block_h) // 2)

    # CHUN.EN 用字距撐開，對齊站上 wordmark 的感覺
    x = PAD_X
    for ch in 'CHUN.EN':
        d.text((x, y), ch, font=f_brand, fill=CREAM)
        x += d.textlength(ch, font=f_brand) + 5

    y += 74
    d.rectangle((PAD_X, y, PAD_X + 78, y + 1), fill=GOLD_RULE)

    y += 26
    d.text((PAD_X, y), eyebrow, font=f_eyebrow, fill=GOLD)

    y += 46
    for ln in lines:
        d.text((PAD_X, y), ln, font=f_title, fill=CREAM)
        y += line_h

    d.text((PAD_X, H - 62), 'chunen.tw', font=f_foot, fill=MUTED)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    # 把眉標與標題寫進 JPEG comment，prepublish_check 靠它判斷卡片有沒有過期
    # （改標題卻忘了重產）。用 mtime 判斷不可靠，git checkout 會重設時間。
    stamp = ('%s|%s' % (eyebrow, title)).encode('utf-8')
    card.save(out_path, 'JPEG', quality=88, optimize=True,
              progressive=True, comment=stamp)
    return out_path


def card_stamp(path):
    """讀回卡片內記錄的 (眉標, 標題)；讀不到回 None。"""
    try:
        c = Image.open(path).info.get('comment')
        if not c:
            return None
        eyebrow, _, title = c.decode('utf-8').partition('|')
        return eyebrow, title
    except Exception:
        return None


def collect():
    rows = []
    for p in sorted(glob.glob(os.path.join(ROOT, 'journal', '*.html'))):
        if os.path.basename(p) == 'index.html':
            continue
        s = io.open(p, encoding='utf-8').read()
        # 一定要讀頁面主圖，不能讀 og:image——og:image 接上分享卡之後就會指向
        # 這支自己的產出，再跑一次會拿卡片當素材，而且 1.9 的比例還會被下面的
        # ratio 過濾掉，等於整支失效。
        hero = re.search(r'<div class="jcard-media rv"[^>]*>\s*<img src="\.\./([^"?]+)', s)
        eb = re.search(r'hero-eyebrow rv">(.*?)</p>', s, re.S)
        h1 = re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S)
        if not (hero and h1):
            continue
        t = re.sub(r'<br\s*/?>', '|', h1.group(1))
        t = re.sub(r'<[^>]*>', '', t).strip()
        img = os.path.join(ROOT, hero.group(1))
        if not os.path.exists(img):
            continue
        w, h = Image.open(img).size
        rows.append({
            'file': os.path.basename(p), 'img': img, 'ratio': w / h,
            'eyebrow': eb.group(1).strip() if eb else 'CHUN.EN 觀點',
            'title': t,
        })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--one', help='只處理這個 html 檔名')
    ap.add_argument('--all', action='store_true', help='橫幅主圖也一起產卡')
    args = ap.parse_args()

    rows = collect()
    if args.one:
        rows = [r for r in rows if r['file'] == args.one]
    # 示意圖主圖本身就是 1.78 橫幅、沒有人臉，塞進卡片右欄反而會把圖裁爛
    rows = [r for r in rows if '-diagram-' not in os.path.basename(r['img'])]
    if not args.all:
        rows = [r for r in rows if r['ratio'] < 1.5]

    for r in rows:
        slug = r['file'].replace('.html', '')
        out = os.path.join(OUT_DIR, slug + '-og.jpg')
        build_card(r['img'], r['eyebrow'], r['title'], out)
        print('%-46s %s' % (slug, os.path.basename(out)))
    print('\n共 %d 張，輸出到 assets/og/' % len(rows))


if __name__ == '__main__':
    main()
