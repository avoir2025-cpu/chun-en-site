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
# ── 絕對因果詞（2026-07-27 起）─────────────────────────────────
# 這類句子讀起來像洞察，但多半沒有依據，而且會把 CHUN.EN 講成「外貌決定商業
# 成果」。每命中一次都要問：依據是什麼？沒有就改成「會參與／可能影響／降低
# 被誤讀的機率」。三份外部審閱抓到的問題有一半屬於這一類。
OVERCLAIM = [
    # (pattern, 說明, 是否必修)
    (r'真正決定[^，。？]{0,14}的', '「真正決定…」：因果宣稱，有依據嗎', True),
    (r'定了一半|一半就決定', '「一半」是量化宣稱，有數據嗎', True),
    (r'(潛意識|下意識)(會|被|地)?(換算|判定|決定)', '心理機制宣稱，需要出處', True),
    (r'沒有(它|這個)[^，。]{0,8}(就)?(不能|進不了|無法)', '必要條件宣稱，過強', True),
    (r'決定了?[^，。？]{0,6}(成敗|要不要|會不會|願不願意)', '把結果歸因給單一因素', False),
    (r'(根本|永遠|絕對)(不會|不能|沒有|不可能)', '絕對詞，多半站不住', False),
    (r'(?<!不)一定(要|會|能|得)', '檢查是否可以改成「多半／通常」', False),
    (r'(?<!整個)學界(?!的唯一共識)', '若指單一研究框架，不能寫成學界共識', False),
    (r'比別的(行業|產業)', '跨產業比較，有依據嗎', False),
]
# ── 已淘汰用語（2026-07-27 建立）────────────────────────────
# 為什麼要有這張表：改稿時退掉一個說法，內文通常會改乾淨，但 keypoints、
# meta description、FAQ 與 JSON-LD 會漏。07/27 把「舞台大場照」改成「場域與
# 規格照」，光這一個詞就在外圍漏了四次，全是靠線上驗證才抓到。
# 用法：以後退掉任何說法，就把它加進來，這裡會掃整個檔案（含 meta 與 schema）。
RETIRED = [
    ('舞台大場照', '改用「場域與規格照」，不是每位講師都走大舞台'),
    ('試講過', 'H1 已改「先進入提案」；內文也說照片不會替你完成試講'),
    ('財顧', '台灣沒人這樣簡稱，用「理專／保經／資產管理」'),
    # 註：「財務顧問」當職稱列舉或 SEO 關鍵字是可以的（有人這樣搜），
    # user 反對的是把它當文章主詞、以及「財顧」這個簡稱。所以不列硬規則。
    ('入場券', '外表只占 5%，改引研究語言，別用必要條件的比喻'),
    ('台灣版', '沒有台灣本地研究，改「台灣職場的實務轉譯」'),
    ('工程師慣性', '對科技與製造背景主管有刻板印象，改「職位升得比訊號快」'),
    ('管理學界早就', '單一研究框架不能寫成學界共識'),
    ('簽核企劃書', '台灣企業講「簽呈」'),
    ('講席照', '改用「講師形象照」'),
    ('打草驚蛇', '語氣不對，而且更新檔案不必然產生求職訊號'),
    ('200×200', 'LinkedIn 官方最小是 400×400，這是錯的'),
    ('定了一半', '沒有數據支撐'),
    ('把錢交給誰', '照片不決定客戶託付資產，改講「第一層理解」'),
]
# 以下兩組給 _check_periphery 用。這些字太常見，比對時略過。
STOPWORDS = set('''
的了是在和與或也都就還很更最不沒有這那你我他們可以要會能被把從到對於為
一二三四五個們什麼怎麼為什麼如何以及並且但是所以因為如果雖然
形象照片專業商業影像視覺定位品牌一組一張看見理解知道時候地方東西
'''.split() ) | set('的了是在和與或也都就還很更最不沒有這那你我他')
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


def _tokens(txt):
    """把中文句子切成長度 2-6 的候選詞，用來比對外圍與內文。

    沒有斷詞器可用，所以用滑動視窗取所有 2-6 字的連續中文片段，
    比對時只要有任一長片段命中內文就算數，寧可漏報也不要誤報。
    """
    out = []
    for run in re.findall(r'[一-鿿]{2,}', txt):
        for n in (6, 5, 4, 3, 2):
            for i in range(len(run) - n + 1):
                out.append(run[i:i + n])
    return out


def _check_periphery(r, s, body_text):
    """H1／keypoints／meta／og／schema 裡出現、內文卻完全沒有的說法。

    這是「改了內文忘了改外圍」的簽名。2026-07-27 講師篇 H1 說「照片先試講過
    了」而內文剛被改成「照片不會替你完成試講」，就是這樣漏掉的；同一天
    「舞台大場照」也在 keypoints、meta 與 schema 漏了四次。
    """
    def bigrams(txt):
        out = set()
        for run in re.findall(r'[一-鿿]{2,}', txt):
            for i in range(len(run) - 1):
                bg = run[i:i + 2]
                if bg not in STOPWORDS:
                    out.add(bg)
        return out

    # H1 與本文重點：逐句看有多少比例的詞在內文找不到。整句脫節＝內文改了
    # 這裡沒跟上。用比例而不是「有沒有」，因為換句話說是正常的。
    # meta / schema description 是改寫過的摘要，本來就對不上字面，不掃。
    spots = []
    mh = re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S)
    if mh:
        spots.append(('H1', re.sub(r'<[^>]+>', '', re.sub(r'<br\s*/?>', '，', mh.group(1)))))
    mk = re.search(r'<div class="keypoints.*?</ul>', s, re.S)
    if mk:
        for li in re.findall(r'<li>(.*?)</li>', mk.group(0), re.S):
            spots.append(('本文重點', re.sub(r'<[^>]+>', '', li)))

    # 註：曾經試過「keypoints 有幾成的詞在內文找不到」這種比例判斷，
    # 實測 39 篇噴出 60 幾個誤報——重點本來就是換句話說的摘要，字面對不上是
    # 正常的。沒有斷詞器就別硬做語意漂移偵測，改用上面那張「已淘汰用語」表，
    # 明確、零誤報、而且正是實際會漏的東西。

    # og:title 與 schema headline 應該跟著 H1 走，差太多就是改了 H1 忘了同步
    if mh:
        h1_bg = bigrams(re.sub(r'<[^>]+>', '', mh.group(1)))
        for label, pat in [('og:title', r'og:title" content="([^"]*)"'),
                           ('schema headline', r'"headline": "([^"]*)"')]:
            m = re.search(pat, s)
            if not m or not h1_bg:
                continue
            other = bigrams(m.group(1))
            if other and len(h1_bg & other) / len(h1_bg) < 0.4:
                r['issues'].append(f'{label} 與 H1 幾乎沒有重疊，改 H1 時忘了同步？'
                                   f'（{label}：{m.group(1)[:28]}）')


def _scan_facts(r, body_text):
    """把需要人工查證的宣稱撈出來列清單。工具驗不了真假，但可以逼人去看。

    2026-07-27 的教訓：LinkedIn 最小尺寸寫成 200×200（官方是 400×400），
    那張表我讀過但沒當成待驗證的主張。平台規格尤其會變。
    """
    facts = []
    pats = [
        (r'\d+\s*[×x]\s*\d+', '尺寸規格'),
        (r'\d+(?:\.\d+)?\s*%', '百分比'),
        (r'\d+\s*(?:px|MB|GB|KB)', '技術數值'),
        (r'[\d一二三四五六七八九十百千兩]+(?:,\d{3})*\s*(?:位|名|人|篇|組|場|次|倍|歲|萬|億|分鐘|小時)', '數量'),
        (r'(?:19|20)\d{2}\s*年', '年份'),
        (r'《[^》]{1,40}》', '引用著作'),
        (r'(?:研究|調查|報告|論文|學者)(?:指出|顯示|發現|說|認為)?', '研究引用'),
        (r'LinkedIn|Facebook|Instagram|Threads|Google|YouTube|Podcast', '外部平台'),
    ]
    for pat, kind in pats:
        for m in re.finditer(pat, body_text):
            frag = body_text[max(0, m.start() - 12):m.end() + 12].replace('\n', ' ').strip()
            facts.append((kind, m.group(0).strip(), frag))
    # 同一個值只留一次
    seen, uniq = set(), []
    for kind, val, frag in facts:
        if (kind, val) in seen:
            continue
        seen.add((kind, val))
        uniq.append((kind, val, frag))
    r['facts'] = uniq


def check(slug):
    path = os.path.join(ROOT, 'journal', slug + '.html')
    if not os.path.exists(path):
        return {'slug': slug, 'fatal': '找不到檔案'}
    s = open(path, encoding='utf-8').read()
    body = s[s.find('<article'):] if '<article' in s else s
    # 語感與因果只掃真正的內文：相關閱讀的文章標題、署名卡 bio、導覽列
    # 都不是這篇的主張，掃進去會一直誤報。
    mb = re.search(r'<div class="article-body[^>]*>(.*?)\n      </div>', body, re.S)
    prose = mb.group(1) if mb else body
    text = re.sub(r'<[^>]+>', '', prose)
    full_text = re.sub(r'<[^>]+>', '', body)

    r = {'slug': slug, 'issues': [], 'warns': [], 'info': []}

    # 語感
    for pat, why in CALQUE:
        hits = list(re.finditer(pat, text))
        if hits:
            sample = text[max(0, hits[0].start() - 18):hits[0].start() + 22].replace('\n', ' ').strip()
            r['issues'].append(f'語感 ×{len(hits)}：{why}｜例：…{sample}…')

    # 絕對因果詞：強宣稱擋上架，其餘列待確認提醒人看一眼
    for pat, why, fatal in OVERCLAIM:
        hits = list(re.finditer(pat, text))
        if hits:
            sample = text[max(0, hits[0].start() - 16):hits[0].end() + 20].replace('\n', ' ').strip()
            msg = f'因果 ×{len(hits)}：{why}｜例：…{sample}…'
            (r['issues'] if fatal else r['warns']).append(msg)

    # 已淘汰用語：掃整個檔案，因為漏的地方永遠是 meta 與 schema
    for term, why in RETIRED:
        n = s.count(term)
        if n:
            where = []
            if term in text:
                where.append('內文')
            if re.search(r'<h1[^>]*>[^<]*%s' % re.escape(term), s):
                where.append('H1')
            if re.search(r'keypoints.{0,900}%s' % re.escape(term), s, re.S):
                where.append('本文重點')
            if re.search(r'<meta[^>]*content="[^"]*%s' % re.escape(term), s):
                where.append('meta')
            if re.search(r'"(headline|description|name|text)": "[^"]*%s' % re.escape(term), s):
                where.append('schema')
            r['issues'].append('已淘汰用語「%s」×%d（%s）：%s'
                               % (term, n, '／'.join(where) or '未知位置', why))

    # 外圍（H1／重點）與內文脫節
    _check_periphery(r, s, text)

    # 待查證的事實宣稱
    _scan_facts(r, text)

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
    r['chars'] = len(re.sub(r'\s', '', full_text))
    if r['chars'] < 1200:
        r['warns'].append(f'內文僅 {r["chars"]} 字，偏短')

    # 同批交叉閱讀要用的：H1 與本文重點
    m = re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S)
    if m:
        r['h1'] = re.sub(r'<[^>]*>', '', re.sub(r'<br\s*/?>', ' / ', m.group(1))).strip()
    m = re.search(r'<div class="keypoints.*?</ul>', s, re.S)
    if m:
        r['keypoints'] = [re.sub(r'<[^>]*>', '', x).strip()
                          for x in re.findall(r'<li>(.*?)</li>', m.group(0), re.S)]

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
    results = {}
    for batch, date, slug in target:
        r = check(slug)
        results[slug] = (batch, date, r)
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

    # ── 待查證清單：工具驗不了真假，只能逼人去看 ────────────────
    lines.append('## 待查證的事實宣稱（人工）')
    lines.append('')
    lines.append('數字、平台規格、研究引用都要回原始出處確認一次。'
                 '平台規格會改版，我們的文章要放三年。')
    lines.append('')
    for slug, (_, _, r) in results.items():
        if not r.get('facts'):
            continue
        lines.append(f'### {slug}')
        for kind, val, frag in r['facts']:
            lines.append(f'- [ ] {kind}｜`{val}`｜…{frag}…')
        lines.append('')

    # ── 同批交叉閱讀：同一天上架的文章不能互相打架 ──────────────
    batches = {}
    for slug, (batch, date, r) in results.items():
        if r.get('fatal'):
            continue
        batches.setdefault(date, []).append((slug, r))
    cross = [(k, v) for k, v in batches.items() if len(v) > 1]
    if cross:
        lines.append('## 同批交叉閱讀（人工）')
        lines.append('')
        lines.append('同一批上架的文章要並排讀一次，確認立場沒有互相牴觸。'
                     '2026-07-27 抓到的例子：LinkedIn 篇說表情要依職位二選一，'
                     '女性領導者篇說權威與親和不必二選一。')
        lines.append('')
        for date, items in cross:
            lines.append(f'### {date} 同日上架（{len(items)} 篇）')
            for slug, r in items:
                lines.append(f'- **{slug}**：{r.get("h1", "—")}')
                for kp in r.get('keypoints', []):
                    lines.append(f'  - {kp}')
            lines.append('')

    lines.append('> 抄襲比對為人工關卡，本工具不檢查；請在審稿總表「抄襲比對✔」欄登記。')

    out = '\n'.join(lines)
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    open(REPORT, 'w', encoding='utf-8').write(out)
    print(out)
    print(f'\n報告已寫入 {REPORT}')


if __name__ == '__main__':
    main()
