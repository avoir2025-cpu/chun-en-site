# -*- coding: utf-8 -*-
"""上架前自動體檢：掃排程中的下 N 週文章，回報語感、結構、素材與抄襲比對狀態

用法：
    python tools/prepublish_check.py            # 預設檢查下兩週（6 篇）
    python tools/prepublish_check.py 3          # 下三週
    python tools/prepublish_check.py --all      # 全部排程中草稿

輸出：終端報表 + docs/上架前體檢報告_最新.md
排程來源：Desktop\\Claude\\CHUNEN_上架排程_v3.md 的表格（| 批 | 日期 | slug |）

og 分享卡（2026-07-27 起列為必修項）
    直幅主圖不能直接當 og:image，社群卡是 1.91:1，人臉會被裁掉。每篇都要有
    assets/og/<slug>-og.jpg（1200x630），用 tools/gen_og_cards.py 產。
    這裡會驗三件事：卡片存在、尺寸正確、卡片上的標題與眉標跟現在的 H1 一致
    （改了標題忘記重產卡片會被抓出來），另外 twitter:image 要與 og:image 同一張。
"""
import os
import re
import sys
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEDULE = r'C:\Users\3D-U\Desktop\Claude\CHUNEN_上架排程_v3.md'
REPORT = os.path.join(ROOT, 'docs', '上架前體檢報告_最新.md')

# ── 語感地雷（來源：2026-07-20 語感體檢 + chinese-native-phrasing 規則）────
CALQUE = [
    (r'——', '破折號（全站禁用，改逗號句號或冒號）'),
    (r'這對你(的)?意義', '英翻中：What this means for you'),
    (r'適合你，如果', '英翻中倒裝：This is for you if'),
    (r'它的(極限|侷限|局限)', '英翻中：its limits'),
    (r'讓(照片|系統|定位|形象)(來)?(工作|說話|發聲)', '擬人化 calque'),
    (r'在一天結束時', '英翻中：at the end of the day'),
    (r'不僅僅是|不只是…而是…', '檢查是否過度使用'),
    (r'事實上，', '英翻中贅詞：in fact'),
    (r'換句話說，', '贅詞，多數可刪'),
    (r'值得注意的是', '英翻中：it is worth noting'),
    (r'[一二三四五六七八九十]方面.{0,8}另一方面', '英翻中：on one hand / on the other'),
    (r'負責[^，。]{0,6}、[^，。]{0,6}負責', 'A 負責 X、B 負責 Y 對仗腔（檢查是否僵硬）'),
]
# ── 結構必備 ────────────────────────────────────────────────
REQUIRED = [
    ('hero-eyebrow', '分類眉標'),
    ('author-card', '署名卡'),
    ('related', '相關閱讀'),
    ('回到專欄', '返回連結'),
    ('BreadcrumbList', '麵包屑 schema'),
    ('"@type": "Article"', 'Article schema'),
]
VALID_CATS = ['洞察 · Insight', '觀點 · Perspective', '指南 · Guide',
              '職業視角 · Profession', '趨勢 · Trend', '案例 · Case']


def load_schedule():
    """回傳 [(批次, 日期, slug)]，照排程順序。"""
    if not os.path.exists(SCHEDULE):
        return []
    out = []
    for line in open(SCHEDULE, encoding='utf-8'):
        m = re.match(r'\|\s*(\d+)\s*\|\s*([\d/]+)\s*\|.*?\|\s*`?([a-z0-9\-]+)`?\s*\|', line)
        if m:
            out.append((int(m.group(1)), m.group(2), m.group(3)))
    return out


def _check_card(r, card_abs, s, cat):
    """驗分享卡：尺寸要 1200x630，內容要跟現在的 H1／眉標一致。

    卡片產生時會把「眉標|標題」寫進 JPEG comment（見 gen_og_cards.py），
    所以改了標題卻忘了重產卡片，這裡就抓得到。用 mtime 判斷不可靠，
    git checkout 會把時間重設。
    """
    try:
        from PIL import Image
        im = Image.open(card_abs)
    except Exception as e:
        r['issues'].append(f'og 分享卡讀不開：{e}')
        return
    if im.size != (1200, 630):
        r['issues'].append('og 分享卡尺寸是 %dx%d，應為 1200x630' % im.size)

    m = re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S)
    if not m:
        return
    now = re.sub(r'<[^>]*>', '', re.sub(r'<br\s*/?>', '|', m.group(1))).strip()
    raw = im.info.get('comment')
    if not raw:
        r['warns'].append('og 分享卡沒有標題註記（舊版產的），建議重跑 gen_og_cards.py')
        return
    try:
        baked_cat, _, baked_title = raw.decode('utf-8').partition('|')
    except Exception:
        return
    if baked_title != now:
        r['issues'].append('og 分享卡上的標題是舊的（卡片：%s），跑 python tools/gen_og_cards.py 重產'
                           % baked_title.replace('|', ' / ')[:34])
    elif cat and baked_cat != cat:
        r['issues'].append('og 分享卡上的分類是舊的（卡片：%s，現在：%s）' % (baked_cat, cat))


def check(slug):
    path = os.path.join(ROOT, 'journal', slug + '.html')
    if not os.path.exists(path):
        return {'slug': slug, 'fatal': '找不到檔案'}
    s = open(path, encoding='utf-8').read()
    body = s[s.find('<article'):] if '<article' in s else s
    text = re.sub(r'<[^>]+>', '', body)

    r = {'slug': slug, 'issues': [], 'warns': [], 'info': []}

    # 語感
    for pat, why in CALQUE:
        hits = list(re.finditer(pat, text))
        if hits:
            sample = text[max(0, hits[0].start() - 18):hits[0].start() + 22].replace('\n', ' ').strip()
            r['issues'].append(f'語感 ×{len(hits)}：{why}｜例：…{sample}…')

    # 結構
    for token, name in REQUIRED:
        if token not in s:
            r['issues'].append(f'結構缺件：{name}')

    # 分類合法性
    m = re.search(r'class="hero-eyebrow rv">(.*?)</p>', s, re.S)
    cat = re.sub(r'<[^>]+>', '', m.group(1)).strip() if m else None
    if cat and cat not in VALID_CATS:
        r['issues'].append(f'分類不在五類白名單：{cat}')
    r['cat'] = cat

    # 內鏈指向草稿
    for t in set(re.findall(r'href="([a-z0-9\-]+\.html)"', body)):
        tp = os.path.join(ROOT, 'journal', t)
        if os.path.exists(tp) and 'noindex' in open(tp, encoding='utf-8').read():
            r['warns'].append(f'內鏈指向仍為草稿的 {t}（該篇上架前此連結不完整）')

    # 素材
    hero = re.search(r'<div class="jcard-media[^>]*>.*?src="\.\./([^"]+)"', s, re.S)
    if hero:
        r['hero'] = hero.group(1)
        if not os.path.exists(os.path.join(ROOT, hero.group(1))):
            r['issues'].append(f'主圖檔案不存在：{hero.group(1)}')
        # 暫代圖判斷：works/01-14 是作品牆共用池，journal 專用應為 15+
        mw = re.search(r'works/(\d+)-', hero.group(1))
        if mw and int(mw.group(1)) <= 14:
            r['warns'].append(f'主圖用的是作品牆共用圖 works/{mw.group(1)}，建議換 journal 專用圖（15+）或請 Kay 給新照')
    else:
        r['issues'].append('找不到主圖')

    # og:image 正常情況是 assets/og/<slug>-og.jpg 的專屬分享卡（1200x630，見
    # tools/gen_og_cards.py）；直接指向直幅主圖會被社群平台裁掉臉。
    og = re.search(r'og:image" content="([^"]+)"', s)
    if og:
        card_rel = f'assets/og/{slug}-og.jpg'
        card_abs = os.path.join(ROOT, card_rel)
        if og.group(1).endswith(f'{slug}-og.jpg'):
            if not os.path.exists(card_abs):
                r['issues'].append(f'og 分享卡不存在：{card_rel}（跑 python tools/gen_og_cards.py）')
            else:
                _check_card(r, card_abs, s, cat)
        elif hero and og.group(1).endswith(os.path.basename(hero.group(1))):
            w, h = 0, 0
            try:
                from PIL import Image
                w, h = Image.open(os.path.join(ROOT, hero.group(1))).size
            except Exception:
                pass
            if h and w / h < 1.7:
                r['issues'].append('og:image 直接用直幅主圖，分享到 LinkedIn／FB 會裁掉臉；'
                                   '跑 python tools/gen_og_cards.py 產專屬卡')
        else:
            r['warns'].append('og:image 既不是分享卡也不是主圖，請確認')
    else:
        r['issues'].append('沒有 og:image')

    # twitter:image 要跟 og:image 一致，否則 X 上會是另一張
    tw = re.search(r'twitter:image" content="([^"]+)"', s)
    if og and tw and tw.group(1) != og.group(1):
        r['issues'].append('twitter:image 與 og:image 不一致')

    # 署名一致性
    if '吳惇恩' in s and '/author/zoey-wu.html#zoey' not in s:
        r['issues'].append('Zoey 署名但 schema @id 未指向作者頁')

    # 字數
    r['chars'] = len(re.sub(r'\s', '', text))
    if r['chars'] < 1200:
        r['warns'].append(f'內文僅 {r["chars"]} 字，偏短')

    r['noindex'] = 'noindex' in s
    return r


def main():
    args = sys.argv[1:]
    sched = load_schedule()
    if not sched:
        print('⚠️ 找不到排程檔，改掃全部草稿')
        slugs = [os.path.basename(p)[:-5] for p in sorted(glob.glob(os.path.join(ROOT, 'journal', '*.html')))
                 if 'noindex' in open(p, encoding='utf-8').read()]
        sched = [(0, '', s) for s in slugs]
    if '--all' in args:
        target = sched
    else:
        weeks = int(args[0]) if args and args[0].isdigit() else 2
        pending = [x for x in sched if os.path.exists(os.path.join(ROOT, 'journal', x[2] + '.html'))
                   and 'noindex' in open(os.path.join(ROOT, 'journal', x[2] + '.html'), encoding='utf-8').read()]
        target = pending[:weeks * 3]

    lines = [f'# 上架前體檢報告（{len(target)} 篇）', '']
    total_i = total_w = 0
    for batch, date, slug in target:
        r = check(slug)
        head = f'## {slug}' + (f'（第 {batch} 批 {date}）' if batch else '')
        lines.append(head)
        if r.get('fatal'):
            lines.append(f'- ❌ {r["fatal"]}'); lines.append(''); continue
        lines.append(f'- 分類：{r.get("cat")}｜字數：{r["chars"]}｜主圖：{r.get("hero","—")}')
        for i in r['issues']:
            lines.append(f'- ❌ {i}'); total_i += 1
        for w in r['warns']:
            lines.append(f'- ⚠️ {w}'); total_w += 1
        if not r['issues'] and not r['warns']:
            lines.append('- ✅ 全數通過')
        lines.append('')
    lines.append(f'---\n**合計：{total_i} 項必修、{total_w} 項待確認**')
    lines.append('')
    lines.append('> 抄襲比對為人工關卡，本工具不檢查；請在審稿總表「抄襲比對✔」欄登記。')

    out = '\n'.join(lines)
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    open(REPORT, 'w', encoding='utf-8').write(out)
    print(out)
    print(f'\n報告已寫入 {REPORT}')


if __name__ == '__main__':
    main()
