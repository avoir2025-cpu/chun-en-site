# -*- coding: utf-8 -*-
"""
作者頁著作列表同步器

掃 journal/*.html，挑出「已公開（無 noindex）且署名 Zoey」的文章，
依發佈日期新到舊，寫進 author/zoey-wu.html 的 ARTICLES 標記區。

用法：
    python tools/sync_author_page.py

新文章上架（移除 noindex）後跑一次即可，不必手改作者頁。
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUTHOR_PAGE = os.path.join(ROOT, 'author', 'zoey-wu.html')
START = '<!-- ARTICLES:START — 由 tools/sync_author_page.py 產生，勿手改 -->'
END = '<!-- ARTICLES:END -->'

# 署名 Zoey 的判斷：Person schema 的 @id 指向作者頁或 about 錨點
ZOEY_IDS = ('/author/zoey-wu.html#zoey', '/about.html#zoey')


def read(path):
    return open(path, encoding='utf-8', newline='').read()


def collect():
    """回傳已公開且署名 Zoey 的文章 metadata，新到舊排序。"""
    items = []
    for path in sorted(glob.glob(os.path.join(ROOT, 'journal', '*.html'))):
        name = os.path.basename(path)
        if name == 'index.html':
            continue
        src = read(path)
        if 'noindex' in src:                       # 草稿不列
            continue
        if not any(i in src for i in ZOEY_IDS):    # 非 Zoey 署名不列
            continue

        article = None
        for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', src, re.S):
            try:
                d = json.loads(m.group(1))
            except json.JSONDecodeError:
                continue
            if d.get('@type') == 'Article':
                article = d
                break
        if not article:
            print('  ! 略過（找不到 Article schema）:', name)
            continue

        eyebrow = re.search(r'class="hero-eyebrow rv">(.*?)</p>', src, re.S)
        cat = re.sub(r'<[^>]+>', '', eyebrow.group(1)).strip() if eyebrow else '觀點 · Perspective'
        minutes = re.search(r'閱讀約\s*(\d+)\s*分鐘', src)
        date = article.get('datePublished', '')

        items.append({
            'href': name,
            'title': article.get('headline', ''),
            'desc': article.get('description', ''),
            'img': (article.get('image', '') or '').replace('https://chunen.tw/', '../'),
            'cat': cat,
            'date': date,
            'year': date[:4],
            'minutes': minutes.group(1) if minutes else '',
        })

    items.sort(key=lambda x: x['date'], reverse=True)
    return items


def render(items):
    rows = [START]
    for it in items:
        meta = it['year']
        if it['minutes']:
            meta += f" · 閱讀約 {it['minutes']} 分鐘"
        rows.append(f'''        <a class="jrow" href="../journal/{it['href']}">
          <div class="jrow-media"><img src="{it['img']}" alt="{it['title']}" loading="lazy" /></div>
          <div class="jrow-body">
            <span class="jcard-cat">{it['cat']}</span>
            <h3>{it['title']}</h3>
            <p>{it['desc']}</p>
            <span class="jcard-meta">{meta}</span>
          </div>
        </a>''')
    rows.append('        ' + END)
    return '\n'.join(rows)


def main():
    items = collect()
    if not items:
        print('找不到任何已公開且署名 Zoey 的文章，中止（避免寫出空列表）')
        return 1

    page = read(AUTHOR_PAGE)
    i, j = page.find(START), page.find(END)
    if i == -1 or j == -1:
        print('作者頁找不到 ARTICLES 標記區，中止')
        return 1

    page = page[:i] + render(items) + page[j + len(END):]
    # ProfilePage 的 dateModified 跟著最新一次同步走
    import datetime
    today = datetime.date.today().isoformat()
    page = re.sub(r'"dateModified": "\d{4}-\d{2}-\d{2}"', f'"dateModified": "{today}"', page, count=1)
    open(AUTHOR_PAGE, 'w', encoding='utf-8', newline='').write(page)

    print(f'已寫入 {len(items)} 篇：')
    for it in items:
        print(f"  {it['date']}  {it['title']}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
