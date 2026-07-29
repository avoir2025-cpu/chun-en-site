#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
全站英翻中（calque）與破折號掃描

用法：
    python tools/scan_calque.py            # 掃全站 html
    python tools/scan_calque.py index.html # 只掃指定檔

掃描範圍包含可見內文、title、meta description、og/twitter 文字與 JSON-LD 的
description，因為這些欄位離內文最遠，最容易在改稿時被漏掉。

規則分兩級：
  [必修] 幾乎不可能是誤報的直譯句型
  [檢查] 需要看語境判斷，不一定要改
"""
import io
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MUST = [
    (r'——', '破折號，全站禁用'),
    (r'當談到', 'when it comes to'),
    (r'這就是為什麼', "that's why"),
    (r'(是|就)關於(?!我們|你的隱私)', 'is about'),
    (r'這意味著', 'this means'),
    (r'在一天結束時', 'at the end of the day'),
    (r'這對你(的)?意義', 'what this means for you'),
    (r'適合你，如果', 'this is for you if'),
    (r'值得注意的是', 'it is worth noting'),
    (r'值得一提的是', 'it is worth mentioning'),
    (r'有趣的是', 'interestingly'),
    (r'總的來說', 'in general'),
    (r'在某種程度上', 'to some extent'),
    (r'最[^，。、]{1,10}之一', 'one of the most'),
    (r'令人印象深刻', 'impressive'),
    (r'讓我們一起', "let's"),
    (r'它的(極限|侷限|局限)', 'its limits'),
    (r'讓(照片|系統|定位|形象|品牌)(來)?(工作|說話|發聲)', '把物件擬人化'),
    (r'[一二三四五六七八九十]方面.{0,10}另一方面', 'on one hand / on the other'),
    (r'進行(拍攝|溝通|討論|評估)', 'conduct a …，中文直接用動詞'),
    (r'做出(決定|選擇|改變)', 'make a decision，中文說做決定'),
]

CHECK = [
    (r'事實上，', 'in fact，多半可刪'),
    (r'換句話說，', '贅詞，多半可刪'),
    (r'基本上，', 'basically，多半可刪'),
    (r'顯然，', 'obviously'),
    (r'毫無疑問', 'no doubt'),
    (r'無論如何', 'anyway'),
    (r'所謂的', 'so-called'),
    (r'使得', 'stiff，改「讓」或重寫'),
    (r'能夠', '多半可縮成「能」'),
    (r'擁有', 'have，多半可改「有」'),
    (r'對於[^，。]{0,12}而言', 'for … 句型，多半可簡化'),
    (r'不僅僅', 'not merely'),
    (r'一種[^，。]{0,10}的方式', 'a way of'),
    (r'負責[^，。]{0,8}、[^，。]{0,8}負責', 'A 負責 X、B 負責 Y 對仗腔'),
    (r'將會', 'will，多半可縮成「會」'),
]


def visible_text_blocks(html: str):
    """回傳 (行號, 內容, 欄位型別)。含內文與各種 meta。"""
    lines = html.splitlines()
    out = []
    for i, line in enumerate(lines, 1):
        if re.search(r'<script[^>]*src=', line):
            continue
        # meta / title / json-ld 的文字欄位
        for m in re.finditer(r'(?:content|"description"|"headline"|"name")\s*[=:]\s*"([^"]{6,})"', line):
            out.append((i, m.group(1), 'meta'))
        m = re.search(r'<title>(.*?)</title>', line)
        if m:
            out.append((i, m.group(1), 'title'))
        # 可見內文：去標籤後剩下的中文
        text = re.sub(r'<[^>]+>', ' ', line)
        text = re.sub(r'&[a-z]+;', ' ', text)
        if re.search(r'[一-鿿]', text):
            out.append((i, text.strip(), 'body'))
    return out


def scan(path: Path):
    html = io.open(path, encoding='utf-8').read()
    # 拿掉 <script src> 之外的 JS 內容，避免掃到程式碼字串
    html = re.sub(r'<script(?![^>]*application/ld\+json)[^>]*>.*?</script>', '', html, flags=re.S)
    hits = []
    for lineno, text, kind in visible_text_blocks(html):
        for level, rules in (('必修', MUST), ('檢查', CHECK)):
            for pat, why in rules:
                for m in re.finditer(pat, text):
                    s = max(0, m.start() - 18)
                    ctx = text[s:m.end() + 18].strip()
                    hits.append((level, lineno, kind, m.group(0), why, ctx))
    return hits


def main():
    targets = sys.argv[1:]
    if targets:
        files = [ROOT / t for t in targets]
    else:
        files = sorted(ROOT.glob('*.html')) + sorted(ROOT.glob('journal/*.html')) + sorted(ROOT.glob('author/*.html'))
    total_must = total_check = 0
    for f in files:
        hits = scan(f)
        if not hits:
            continue
        must = [h for h in hits if h[0] == '必修']
        check = [h for h in hits if h[0] == '檢查']
        total_must += len(must)
        total_check += len(check)
        rel = f.relative_to(ROOT)
        print(f"\n=== {rel}　必修 {len(must)}　檢查 {len(check)} ===")
        for level, lineno, kind, hit, why, ctx in must + check:
            print(f"  [{level}] L{lineno} ({kind}) 「{hit}」 {why}")
            print(f"          …{ctx}…")
    print(f"\n總計：必修 {total_must}　檢查 {total_check}")
    return 1 if total_must else 0


if __name__ == '__main__':
    raise SystemExit(main())
