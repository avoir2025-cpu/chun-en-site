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

SEO 效益（2026-07-28 起列為必修項，見 docs/觀點文章SEO盤點_v1.xlsx）
    起因：實測 125 組關鍵字後發現，原本 38 篇排程裡約 28 篇的鎖定詞
    在 Google 完全沒有查詢紀錄。寫得再好，沒有人用那個詞搜尋就等於沒有入口。
    市場用「問題」搜尋不用「身分」搜尋：姿勢、費用、推薦、地區、AI 有量；
    高階主管、講師、理專、創辦人、商務妝髮這類身分詞是零。

    四道檢查（對照表 tools/seo_targets.json）：
    1. 鎖定詞要有實測聲量。零聲量的詞不該當搜尋入口，該篇請列進
       seo_targets.json 的「轉換型_不設搜尋入口」，明講它靠內鏈與轉換工作。
    2. 鎖定詞要出現在 title。詞在內文但不在標題，Google 不會認為這篇在談它。
    3. FAQ 區塊與 FAQPage 結構化資料要齊備且題數一致。FAQ 在文章最底、
       收合顯示，不影響閱讀動線，卻是「其他人也問」與 AI 摘要最優先抓取的來源。
    4. FAQ 第一題要對得上鎖定詞，那是被摘要抓走的位置。

    為什麼不改開場：開場答案句會與正文上方的「本文重點」重複，同一件事
    隔兩行講兩次，反而傷閱讀。答案要放 FAQ，不要塞進敘事段落。
"""
import os
import re
import sys
import glob
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEDULE = r'C:\Users\3D-U\Desktop\Claude\CHUNEN_上架排程_v4.md'
REPORT = os.path.join(ROOT, 'docs', '上架前體檢報告_最新.md')
SEO_TARGETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seo_targets.json')

FAQ_MIN = 3          # 每篇至少三題，少於這個數量撐不起 FAQPage 的抓取價值
WEAK_VOLUME = '零'   # seo_targets.json 裡代表「Google 沒有查詢紀錄」的標記


def load_seo():
    """讀鎖定詞對照表。檔案不在就回空表，讓 SEO 檢查靜默略過而不是整支掛掉。"""
    try:
        with open(SEO_TARGETS, encoding='utf-8') as f:
            d = json.load(f)
    except Exception:
        return {}, {}, set(), {}
    return (d.get('聲量', {}), d.get('鎖定詞', {}),
            set(d.get('轉換型_不設搜尋入口', [])), d.get('標題例外', {}))

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
    # ── 2026-08-02 外部審閱定案的顧問術語（讀者看不見發生了什麼的抽象語）──
    ('被承接', '策略簡報語，改「真正見面時，照片裡的印象是否仍然成立」一類具體說法'),
    ('驗證成本', '會計腔，改寫成對方要多花力氣確認的具體情境'),
    ('沒決定過的中間狀態', '抽象語，改「避免拍攝當天看起來像沒整理過的樣子」'),
    ('趕路模式', '抽象語，改「預留交通與整理時間」'),
    ('現場只留下放鬆', '抽象語，改「現場專注在人物狀態與必要調整」'),
    ('闔上硬碟', '文藝腔，改「拍完之後，先做一次使用盤點」'),
    ('產生落差的那一塊', '抽象語，改「重新裁切、局部補拍或整套更新」等具體選項'),
    ('六大場景', '部署地圖已改「應用版位」框架，場景會誤導成要拍六個地點'),
    ('被過度販賣', '批判工具的用法可以，指控同業動機不行，改「最常被用過頭」'),
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
    ('決定照片的一半', '沒有依據的量化宣稱'),
    ('真正決定成敗', '因果宣稱，改「影響最大的」'),
    # 註：這條規則我訂錯過兩次。先鎖「地基」→ 三篇草稿的「信任的地基」誤報；
    # 改鎖「裝潢」→ clinic-image-consistency 講診所實際室內裝潢，誤報 9 次。
    # 兩個都是普通中文詞，退掉的是「地基／裝潢」這個分層框架，不是單字。
    # 所以只鎖那個框架獨有的句子。教訓：別拿單篇語境訂全站規則。
    ('地基歪了', '置頂文的兩層已改叫「角色／畫面」，不要再用地基／裝潢的分法'),
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


def _check_faq_sync(r, s):
    """已停用。留這段註解是為了讓後面的人不要再走同一條死路。

    起因：2026-07-30 置頂文把 FAQ 第三題整題換掉，頁面改了但 FAQPage schema
    還留著舊題目「換一個更好的攝影師就能解決嗎」，等於對 Google 與 AI 摘要
    送出一個站上已經不存在的問題。想寫成自動檢查，試了四種都不可行：

    1. 要求問題字面相同 → 39 篇噴 182 個誤報
    2. 問題的 bigram 重疊度 → 真 bug 14%、合理改寫 18-33%，區間太窄
    3. 改比對答案（答案較長、詞多）→ 仍有 17 個誤報，落在 30-45%
    4. 調各種閾值 → 抓得到就一定誤報，分不開

    根本原因：站上的慣例是 schema 版本刻意改寫——問題自帶主詞（因為會單獨
    出現在「其他人也問」），答案則縮寫。兩邊本來就不該一樣，所以「不一樣」
    不是有效訊號。這是對的設計，不是 bug。

    既有的「題數一致」檢查已經涵蓋結構性錯誤。剩下這種整題被換掉的情況
    靠流程守：改 FAQ 時頁面與 schema 一起改。
    寧可沒有檢查，也不要一個會對 17 篇合理文章誤報的檢查——那種檢查
    最後只會被整體忽略。
    """
    return


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


def _check_seo(r, s, slug):
    """SEO 效益四道檢查：FAQ、鎖定詞聲量、詞在不在 title、FAQ 首題對不對得上。"""
    volumes, targets, conversion_only, title_exempt = load_seo()

    # 1. FAQ 區塊與 FAQPage schema
    n_details = s.count('<details><summary>')
    # 一頁有三塊 ld+json（Article／FAQPage／Breadcrumb），要逐塊解析後才知道哪塊是
    # FAQPage。早期版本用一條橫跨的正則去抓，會從 Article 那塊的左括號一路吃到
    # FAQPage 的右括號，捕捉到的當然不是合法 JSON，38 篇全數誤報。
    faq_ld, n_schema, bad_json = None, 0, False
    for raw in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        if '"FAQPage"' not in raw:
            continue
        try:
            n_schema = len(json.loads(raw).get('mainEntity', []))
            faq_ld = raw
        except Exception:
            bad_json = True
        break
    if bad_json:
        r['issues'].append('FAQPage schema 不是合法 JSON，Google 會整段忽略')
    if n_details < FAQ_MIN:
        r['issues'].append(f'FAQ 只有 {n_details} 題（需 ≥{FAQ_MIN}）：'
                           'FAQ 是「其他人也問」與 AI 摘要最主要的抓取來源，且不影響閱讀動線')
    elif not faq_ld:
        r['issues'].append('有 FAQ 區塊但缺 FAQPage 結構化資料，等於寫了不給 Google 讀')
    elif n_schema != n_details:
        r['issues'].append(f'FAQ 題數不一致：畫面 {n_details} 題、schema {n_schema} 題')

    # 零 CTA 鐵律：模組已清乾淨，但寫在內文裡的業配句掃不到（2026-08-02 漏網一篇）
    for pat in ('我們最擅長', '歡迎與我們', '讓我們陪你', '交給我們', '預約諮詢',
                '來找我們', '我們可以幫你', '我們能幫你'):
        if pat in s:
            r['issues'].append(f'文末／內文出現業配句「{pat}」：觀點文一律零 CTA，'
                              '轉換靠浮動 LINE 按鈕與問句收尾')

    # 2-4. 鎖定詞相關
    if slug in conversion_only:
        r['info'].append('轉換型文章：不設搜尋入口，靠內鏈與轉換工作，故略過鎖定詞檢查')
        return
    kws = targets.get(slug)
    if not kws:
        r['warns'].append('tools/seo_targets.json 沒有這篇的鎖定詞：'
                          '請補上有實測聲量的詞，或列進「轉換型_不設搜尋入口」')
        return

    title = re.search(r'<title>(.*?)</title>', s, re.S)
    title = re.sub(r'<[^>]+>', '', title.group(1)).strip() if title else ''

    def covers(text, kw):
        """詞出現在文字裡就算。含空格的詞（臉型 髮型）是多字詞查詢，
        Google 不要求連在一起，所以逐字拆開檢查而不是比整串。"""
        t = text.lower()
        return all(tok.lower() in t for tok in kw.split() if tok)

    live = [k for k in kws if volumes.get(k, WEAK_VOLUME) != WEAK_VOLUME]
    if not live:
        r['issues'].append(f'鎖定詞 {"／".join(kws)} 實測零聲量：沒有人用這個詞搜尋，'
                           '換一個有量的詞，或把這篇列進「轉換型_不設搜尋入口」')
        return

    if not any(covers(title, k) for k in live):
        why = title_exempt.get(slug)
        if why:
            r['info'].append(f'鎖定詞刻意不進 title（{"／".join(live)}）：{why}')
        else:
            r['issues'].append(f'鎖定詞 {"／".join(live)} 沒有出現在 title：'
                               '詞只在內文，Google 不會認為這篇在談它。'
                               '改標題、換一個標題本來就有的詞，或列進「標題例外」並寫明理由')
    r['info'].append('鎖定詞：' + '、'.join(f'{k}（{volumes.get(k, "未測")}）' for k in kws))

    # FAQ 第一題是被摘要抓走的位置，要對得上主鎖定詞
    first_q = re.search(r'<details><summary>(.*?)<span', s, re.S)
    if first_q and live:
        q = re.sub(r'<[^>]+>', '', first_q.group(1))
        if not any(covers(q, k) for k in live):
            r['warns'].append(f'FAQ 第一題沒有帶到鎖定詞（{"／".join(live)}）：'
                              '那一題最可能被搜尋摘要抓走，建議直接寫成該搜尋詞的問句')


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

    # 絕對因果詞：強宣稱擋上架，其餘列待確認提醒人看一眼。
    # H1 與本文重點也要掃——2026-07-30 抓到置頂文 H1 寫著「決定了一張形象照的
    # 成敗」，完全符合這裡的模式卻沒被抓到，因為 text 只涵蓋 article-body。
    scan = text
    for pat_extra in (r'<h1[^>]*>(.*?)</h1>', r'<div class="keypoints.*?</ul>'):
        m2 = re.search(pat_extra, s, re.S)
        if m2:
            scan += '\n' + re.sub(r'<[^>]+>', '', m2.group(0))
    for pat, why, fatal in OVERCLAIM:
        hits = list(re.finditer(pat, scan))
        if hits:
            sample = scan[max(0, hits[0].start() - 16):hits[0].end() + 20].replace('\n', ' ').strip()
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

    # H1 斷行
    _check_h1_break(r, s)


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

    # SEO 效益
    _check_seo(r, s, slug)

    # 署名一致性
    if '吳惇恩' in s and '/author/zoey-wu.html#zoey' not in s:
        r['issues'].append('Zoey 署名但 schema @id 未指向作者頁')

    # 署名單軌（2026-08-02 定案）：全站已收斂為 Zoey 署名卡；
    # 「文｜CHUN.EN 編輯團隊」是 07/17 雙軌制的殘留，兩者同時出現＝一篇文章兩個作者。
    has_credit = 'editorial-credit' in s
    has_card = 'class="author-card' in s
    if has_credit and has_card:
        r['issues'].append('署名重複：「文｜CHUN.EN 編輯團隊」與 Zoey 署名卡同時存在，刪掉編輯團隊那行')
    elif not has_card:
        r['issues'].append('沒有 Zoey 署名卡（全站署名已收斂單軌，每篇都要有）')

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


def _w1(c):
    """單字行寬權重：CJK／全形＝1，ASCII 與空白約 0.45"""
    return 1.0 if ord(c) > 0x2E7F or c in '（）「」，。？！：；、' else 0.45


DESKTOP_CAP = 12.9    # article-wrap 660px ÷ H1 上限 51.2px
MOBILE_CAP = 11.0     # 335px ÷ H1 下限 30.4px
_PUNCT = '，、。？！：；」）…'


def _check_h1_break(r, s):
    """H1 斷行檢查（2026-08-02 user 指定列入審查項目，不再人工逐篇看）。

    折行只該發生在作者決定的位置：<br>、nowrap 段邊界，或標點後。
    做法＝依桌機行寬模擬瀏覽器的貪婪折行，抓兩種病：
    ①折點落在句中（前一字不是標點）②折出 1-2 字的孤行尾。
    行寬是估計值，字型實寬有 ±5% 誤差，此檢查列待確認不擋上架。
    """
    m = re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S)
    if not m:
        return
    for li, line in enumerate(re.split(r'<br\s*/?>', m.group(1)), 1):
        segs = re.findall(r'<span style="white-space:\s*nowrap;?">(.*?)</span>', line, re.S)
        seg_text = ''.join(re.sub(r'<[^>]+>', '', x) for x in segs)
        line_text = re.sub(r'<[^>]+>', '', line).strip()
        if not line_text:
            continue
        total = sum(_w1(c) for c in line_text)
        if seg_text and sum(_w1(c) for c in seg_text) >= total - 0.5:
            # 整行都是 nowrap 段：只驗段長不會撐爆手機
            for x in segs:
                t = re.sub(r'<[^>]+>', '', x)
                if sum(_w1(c) for c in t) > MOBILE_CAP + 1:
                    r['warns'].append(f'H1 nowrap 段「{t}」約 {sum(_w1(c) for c in t):.0f} 字，'
                                      f'超過手機行寬 {MOBILE_CAP:.0f}，會橫向溢出')
            continue
        if total <= DESKTOP_CAP:
            continue
        # 模擬桌機貪婪折行，看折點落在哪
        acc, folds = 0.0, []
        for i, c in enumerate(line_text):
            acc += _w1(c)
            if acc > DESKTOP_CAP:
                folds.append(i); acc = _w1(c)
        tail = len(line_text) - (folds[-1] if folds else 0)
        bad_fold = [line_text[max(0, i - 1)] for i in folds if line_text[i - 1] not in _PUNCT]
        if bad_fold:
            r['warns'].append(f'H1 斷行落在句中：第 {li} 行「{line_text[:16]}…」會折在'
                              f'「{bad_fold[0]}」後（非標點）；語意段各包 white-space:nowrap 的 span 控制折點')
        elif tail <= 2:
            r['warns'].append(f'H1 孤行：第 {li} 行折行後行尾只剩 {tail} 字，調整斷句或 nowrap 分段')


def check_published():
    """反向檢查：已公開（無 noindex）的文章必須同時掛在專欄列表頁與 sitemap。

    上架 SOP 是四步手動操作（移 noindex／掛列表卡／入 sitemap／跑 sync_author_page），
    少做任何一步都產生「以為上架了、其實沒人找得到」的孤兒頁——列表頁是全站唯一
    從主選單直達的 journal hub，少掛卡等於這篇拿不到任何內鏈權重；新網域信任期
    只靠 sitemap 的頁，大概率停在「已檢索－尚未建立索引」。
    """
    problems = []
    idx = open(os.path.join(ROOT, 'journal', 'index.html'), encoding='utf-8').read()
    smap = open(os.path.join(ROOT, 'sitemap.xml'), encoding='utf-8').read()
    author = open(os.path.join(ROOT, 'author', 'zoey-wu.html'), encoding='utf-8').read()
    for p in sorted(glob.glob(os.path.join(ROOT, 'journal', '*.html'))):
        b = os.path.basename(p)
        if b == 'index.html':
            continue
        s = open(p, encoding='utf-8').read()
        if 'name="robots"' in s:      # 草稿不在此檢查範圍
            continue
        slug = b[:-5]
        if 'href="%s"' % b not in idx:
            problems.append('%s：已公開但專欄列表頁沒有掛卡（孤兒頁，讀者無入口）' % slug)
        if 'journal/%s' % b not in smap:
            problems.append('%s：已公開但不在 sitemap.xml' % slug)
        if any(i in s for i in ('/author/zoey-wu.html#zoey', '/about.html#zoey')) \
                and 'journal/%s' % b not in author:
            problems.append('%s：Zoey 署名已公開，但作者頁著作列表沒有（跑 python tools/sync_author_page.py）' % slug)
    return problems


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
    # ── 已公開文章完整性（每次必跑，不分掃描範圍）─────────────
    pub = check_published()
    lines.append('## 已公開文章完整性')
    lines.append('')
    if pub:
        for x in pub:
            lines.append(f'- ❌ {x}'); total_i += 1
    else:
        lines.append('- ✅ 已公開文章全數掛在列表頁＋sitemap＋作者頁')
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
