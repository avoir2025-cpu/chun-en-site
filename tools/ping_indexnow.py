#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
IndexNow 推送工具（Bing / Yandex / Naver 等；Google 不吃 IndexNow）

用法：
    python tools/ping_indexnow.py                 # 送出「最後一次 commit 動到」的頁面
    python tools/ping_indexnow.py --since HEAD~3  # 送出最近三次 commit 動到的頁面
    python tools/ping_indexnow.py --all           # 送出 sitemap 全部 URL
    python tools/ping_indexnow.py --url https://chunen.tw/faq.html   # 指定單頁（可重複）
    python tools/ping_indexnow.py --dry-run       # 只列出要送什麼，不真的送

搭配 sync_sitemap.py 的順序（上架流程）：
    1. python tools/sync_sitemap.py     # 回填 lastmod
    2. git commit + git push            # 部署上線
    3. python tools/ping_indexnow.py    # 通知 Bing 這幾頁變了

為什麼放在 push 之後：IndexNow 送出後爬蟲會立刻來抓，頁面還沒上線就送等於
請它抓一份舊的，反而把舊版本鎖進索引。sync_sitemap 只認 commit 過的日期，
這支只認 push 過的內容，兩支的原則一致。

為什麼要做：ChatGPT 的網頁檢索走 Bing 索引。Bing 對新網域收錄快，但要它
知道「這頁變了」得靠 IndexNow，否則等自然重爬可能要幾週。Google 不支援
IndexNow，Google 那邊仍然靠 sitemap 的 lastmod 加 GSC 手動送出。

金鑰：repo 根目錄的 <key>.txt，內容就是金鑰本身，透過 GitHub Pages 對外可讀。
Bing 每次收到請求會去抓那個檔案驗證，所以那支檔案不能刪、不能改名。
"""
import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITEMAP = ROOT / "sitemap.xml"
BASE = "https://chunen.tw/"
HOST = "chunen.tw"
KEY = "0bef6ebf0267431fbd6570023b1aad09"
KEY_LOCATION = f"{BASE}{KEY}.txt"
ENDPOINT = "https://api.indexnow.org/indexnow"


def sitemap_urls() -> list[str]:
    xml = SITEMAP.read_text(encoding="utf-8")
    return re.findall(r"<loc>([^<]+)</loc>", xml)


def loc_to_relpath(loc: str) -> str:
    """sitemap 的 <loc> 轉成 repo 內的相對路徑（與 sync_sitemap.py 同規則）"""
    rel = loc[len(BASE):] if loc.startswith(BASE) else loc.lstrip("/")
    if rel == "" or rel.endswith("/"):
        rel += "index.html"
    return rel.replace("\\", "/")


def changed_files(since: str) -> list[str]:
    out = subprocess.run(
        ["git", "diff", "--name-only", f"{since}..HEAD"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout
    return [line.strip() for line in out.splitlines() if line.strip()]


def submit(urls: list[str]) -> int:
    payload = json.dumps({
        "host": HOST,
        "key": KEY,
        "keyLocation": KEY_LOCATION,
        "urlList": urls,
    }).encode("utf-8")
    req = urllib.request.Request(
        ENDPOINT, data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            code = resp.status
            body = resp.read().decode("utf-8", "replace").strip()
    except urllib.error.HTTPError as e:
        code = e.code
        body = e.read().decode("utf-8", "replace").strip()
    except urllib.error.URLError as e:
        print(f"[FAIL] 連不上 IndexNow：{e.reason}")
        return 1

    notes = {
        200: "已接受",
        202: "已接受，金鑰驗證中（第一次送出會是這個，正常）",
        400: "請求格式有問題",
        403: "金鑰驗證失敗，檢查 {} 線上是否讀得到".format(KEY_LOCATION),
        422: "URL 不屬於這個網域，或格式不對",
        429: "送太頻繁，等一下再試",
    }
    print(f"[{'OK' if code in (200, 202) else 'FAIL'}] HTTP {code} {notes.get(code, '')}")
    if body:
        print(f"       回應：{body[:300]}")
    return 0 if code in (200, 202) else 1


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--all", action="store_true", help="送出 sitemap 全部 URL")
    ap.add_argument("--since", default="HEAD~1", help="比對起點的 git ref（預設 HEAD~1）")
    ap.add_argument("--url", action="append", default=[], help="指定要送的完整網址，可重複")
    ap.add_argument("--dry-run", action="store_true", help="只列出，不送出")
    args = ap.parse_args()

    known = sitemap_urls()

    if args.url:
        urls, unknown = [], []
        for u in args.url:
            (urls if u in known else unknown).append(u)
        for u in unknown:
            print(f"[WARN] 不在 sitemap 裡，略過：{u}")
    elif args.all:
        urls = known
    else:
        try:
            changed = set(changed_files(args.since))
        except subprocess.CalledProcessError as e:
            print(f"[FAIL] git diff 失敗（{args.since} 這個 ref 存在嗎）：{e}")
            return 1
        urls = [loc for loc in known if loc_to_relpath(loc) in changed]

    if not urls:
        print("[OK] 沒有需要送出的 URL（指定範圍內沒有動到 sitemap 裡的頁面）")
        return 0

    print(f"要送出 {len(urls)} 筆：")
    for u in urls:
        print(f"  - {u}")

    if args.dry_run:
        print("[DRY-RUN] 沒有實際送出")
        return 0

    return submit(urls)


if __name__ == "__main__":
    raise SystemExit(main())
