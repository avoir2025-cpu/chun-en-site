# -*- coding: utf-8 -*-
"""上架前自動體檢：掃排程中的下 N 週文章，回報語感、結構、素材與抄襲比對狀態

用法：
    python tools/prepublish_check.py            # 預設檢查下兩週（6 篇）
    python tools/prepublish_check.py 3          # 下三週
    python tools/prepublish_check.py --all      # 全部排程中草稿

輸出：終端報表 + docs/上架前體檢報告_最新.md
排程來源：Desktop\\Claude\\CHUNEN_上架排程_v3.md 的表格（| 批 | 日期 | slug |）
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

    og = re.search(r'og:image" content="([^"]+)"', s)
    if og and hero and not og.group(1).endswith(os.path.basename(hero.group(1))):
        r['warns'].append('og:image 與主圖不一致')

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
