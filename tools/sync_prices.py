# -*- coding: utf-8 -*-
"""同步三個服務頁的價目：Google Sheets（產品主檔）→ a-voir / b-room / c-photos

原本只有 B.room 接上（sync_broom_prices.py），A 與 C 是手工維護，
結果頁面與主檔對不上。本版把三頁都接上同一張表。

規則：
- 只取「上架 = Y」的列
- 依「所屬品牌」欄分流到對應頁面
- 只讀對外三欄：行銷名稱、對客價格顯示、對客補充（成本與內部欄一律不碰）
- 「對客補充」渲染成可見說明行（不是 title 提示框，手機讀不到）
- 寫入各頁 <!-- {MARKER}:START --> / <!-- {MARKER}:END --> 之間
- 內容無變動則不改檔

要新增品項或改價格，改 Google Sheets 就好，不必動程式或 HTML。
"""
import csv
import html
import io
import re
import sys
import urllib.request
from pathlib import Path

try:  # Windows 主控台預設 cp950，印品牌名會炸
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SHEET_ID = "1qk3LPDRkl0EghCEASZ-lHhbF5Olx-RHbGQgokjLnme8"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv"
ROOT = Path(__file__).resolve().parent.parent

# 品牌 → 頁面。品牌比對會正規化（去空白、去點、轉小寫）
TARGETS = [
    {"brand": "à voir", "file": "a-voir.html", "marker": "AVOIR_PRICES"},
    {"brand": "b.room", "file": "b-room.html", "marker": "BROOM_PRICES"},
    {"brand": "c.photos", "file": "c-photos.html", "marker": "CPHOTOS_PRICES"},
]

COL_NAME = "行銷名稱"
COL_PRICE = "對客價格顯示"
COL_NOTE = "對客補充"
COL_LIVE = "上架"
COL_BRAND = "所屬品牌"


def norm(s):
    return s.lower().replace(" ", "").replace(".", "").replace("　", "")


def fetch_rows():
    with urllib.request.urlopen(CSV_URL, timeout=30) as resp:
        text = resp.read().decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    header = [h.strip() for h in rows[0]]
    for col in (COL_NAME, COL_PRICE, COL_NOTE, COL_LIVE, COL_BRAND):
        if col not in header:
            sys.exit(f"錯誤：Sheets 找不到欄位「{col}」，請確認表頭未被更名")
    idx = {c: header.index(c) for c in (COL_NAME, COL_PRICE, COL_NOTE, COL_LIVE, COL_BRAND)}

    items = []
    for row in rows[1:]:
        if len(row) <= idx[COL_LIVE]:
            continue
        name = row[idx[COL_NAME]].strip()
        if row[idx[COL_LIVE]].strip().upper() != "Y" or not name or name == COL_NAME:
            continue
        items.append({
            "brand": norm(row[idx[COL_BRAND]].strip()),
            "name": name,
            "price": row[idx[COL_PRICE]].strip(),
            "note": row[idx[COL_NOTE]].strip(),
        })
    return items


def render(items):
    lines = []
    for i in items:
        name = html.escape(i["name"])
        price = html.escape(i["price"]) or "LINE 諮詢"
        note = html.escape(i["note"])
        note_html = f'<span class="pl-note">{note}</span>' if note else ""
        lines.append(
            f'        <li><span class="pl-item"><span class="pl-name">{name}</span>'
            f'{note_html}</span><span class="price">{price}</span></li>'
        )
    return "\n".join(lines)


def write_block(path, marker, body):
    text = path.read_text(encoding="utf-8")
    # 中間可以是空的（第一次接上同步的頁面就是空區塊），所以不能要求前後各有換行
    pattern = re.compile(
        rf"(<!-- {marker}:START[^>]*-->\n)(.*?)([ \t]*<!-- {marker}:END -->)",
        re.S,
    )
    if not pattern.search(text):
        print(f"  ⚠ {path.name} 找不到 {marker} 標記，略過")
        return False
    new = pattern.sub(lambda m: m.group(1) + body + "\n" + m.group(3), text)
    if new == text:
        print(f"  {path.name} 無變動")
        return False
    path.write_text(new, encoding="utf-8")
    print(f"  ✅ {path.name} 已更新")
    return True


def main():
    items = fetch_rows()
    changed = False
    for t in TARGETS:
        picked = [i for i in items if i["brand"] == norm(t["brand"])]
        print(f"{t['brand']} → {t['file']}：{len(picked)} 項")
        for i in picked:
            print(f"  - {i['name']}: {i['price'] or 'LINE 諮詢'}")
        if not picked:
            print("  （主檔沒有上架項目，保留頁面現狀不動）")
            continue
        if write_block(ROOT / t["file"], t["marker"], render(picked)):
            changed = True
    print("有變動" if changed else "全部無變動")


if __name__ == "__main__":
    main()
