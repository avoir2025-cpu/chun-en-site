# -*- coding: utf-8 -*-
"""同步 B.room 價目：Google Sheets（產品主檔）→ b-room.html

規則：
- 只取「上架 = Y」的列
- 只讀對外三欄：行銷名稱、對客價格顯示、對客補充（成本欄一律不碰）
- 「所屬品牌」欄含 B.room（不分大小寫）者納入；若整份表該欄皆空，
  退回使用預設代號白名單（妝髮／紋繡類）
- 寫入 b-room.html 的 BROOM_PRICES:START/END 標記之間，內容無變動則不改檔
"""
import csv
import html
import io
import re
import sys
import urllib.request
from pathlib import Path

SHEET_ID = "1qk3LPDRkl0EghCEASZ-lHhbF5Olx-RHbGQgokjLnme8"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv"
TARGET = Path(__file__).resolve().parent.parent / "b-room.html"

# 「所屬品牌」欄全空時的過渡白名單（B.room＝妝髮／紋繡範疇）
FALLBACK_CODES = {"P007", "P008", "P038", "P009", "P010", "P011", "P012"}

COL_NAME = "行銷名稱"
COL_PRICE = "對客價格顯示"
COL_NOTE = "對客補充"
COL_LIVE = "上架"


def fetch_rows():
    with urllib.request.urlopen(CSV_URL, timeout=30) as resp:
        text = resp.read().decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    header = [h.strip() for h in rows[0]]
    idx = {}
    for col in (COL_NAME, COL_PRICE, COL_NOTE, COL_LIVE):
        if col not in header:
            sys.exit(f"錯誤：Sheets 找不到欄位「{col}」，請確認表頭未被更名")
        idx[col] = header.index(col)
    # 代號欄：接受「商品代號」或「代號」，都沒有就用第一欄
    idx_code = next((header.index(c) for c in ("商品代號", "代號") if c in header), 0)
    # 品牌欄：有「所屬品牌」才用；沒有就退回代號白名單
    idx_brand = header.index("所屬品牌") if "所屬品牌" in header else None

    items = []
    brand_col_used = False
    for row in rows[1:]:
        if len(row) <= idx[COL_LIVE]:
            continue
        code = row[idx_code].strip()
        name = row[idx[COL_NAME]].strip()
        live = row[idx[COL_LIVE]].strip().upper()
        brand = row[idx_brand].strip() if idx_brand is not None else ""
        if brand:
            brand_col_used = True
        # 跳過表頭說明列與空列
        if live != "Y" or not name or name == "行銷名稱":
            continue
        items.append({
            "code": re.sub(r"[（(].*", "", code).strip(),  # 「P038（新增列）」→「P038」
            "brand": brand,
            "name": name,
            "price": row[idx[COL_PRICE]].strip(),
            "note": row[idx[COL_NOTE]].strip(),
        })

    if brand_col_used:
        key = lambda s: s.lower().replace(" ", "").replace(".", "")
        picked = [i for i in items if "broom" in key(i["brand"])]
    else:
        picked = [i for i in items if i["code"] in FALLBACK_CODES]
    return picked


def render(items):
    lines = []
    for i in items:
        name = html.escape(i["name"])
        price = html.escape(i["price"]) or "LINE 諮詢"
        note = html.escape(i["note"], quote=True)
        title = f' title="{note}"' if note else ""
        lines.append(f'        <li><span{title}>{name}</span><span class="price">{price}</span></li>')
    return "\n".join(lines)


def main():
    items = fetch_rows()
    if not items:
        sys.exit("錯誤：沒有符合條件的價目（上架=Y 且屬 B.room），為避免清空頁面，本次不寫入")

    src = TARGET.read_text(encoding="utf-8")
    pattern = re.compile(
        r"(<!-- BROOM_PRICES:START[^>]*-->)(.*?)(\s*<!-- BROOM_PRICES:END -->)",
        re.S,
    )
    if not pattern.search(src):
        sys.exit("錯誤：b-room.html 找不到 BROOM_PRICES 標記")

    block = render(items)
    updated = pattern.sub(lambda m: f"{m.group(1)}\n{block}{m.group(3)}", src)
    if updated == src:
        print("價目無變動，不需更新")
        return

    TARGET.write_text(updated, encoding="utf-8", newline="\n")
    print(f"已更新 {len(items)} 項價目：")
    for i in items:
        print(f"  - {i['name']}: {i['price']}")


if __name__ == "__main__":
    main()
