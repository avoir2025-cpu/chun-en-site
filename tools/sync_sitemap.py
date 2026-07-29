#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
sitemap.xml 的 <lastmod> 同步工具

用法：
    python tools/sync_sitemap.py          # 依 git 最後一次改動日期回填 lastmod
    python tools/sync_sitemap.py --check  # 只檢查，不改檔（回傳非 0 代表有缺）

為什麼要做：Google 靠 lastmod 判斷哪一頁需要重新檢索。sitemap 沒有 lastmod
等於每次上架都要人工去 GSC 送出，而索引請求每天有配額。

規則：
- <loc> 轉成 repo 內的實體檔（/ → index.html，/journal/ → journal/index.html）
- 日期取該檔在 git 的最後一次 commit 日期（本地未 commit 的改動不算，避免
  sitemap 宣告了一個線上還沒有的更新）
- 找不到對應檔案就跳過並警告，不亂編日期
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITEMAP = ROOT / "sitemap.xml"
BASE = "https://chunen.tw/"


def loc_to_path(loc: str) -> Path:
    rel = loc[len(BASE):] if loc.startswith(BASE) else loc.lstrip("/")
    if rel == "" or rel.endswith("/"):
        rel += "index.html"
    return ROOT / rel


def git_last_modified(path: Path) -> str | None:
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", str(path.relative_to(ROOT))],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.strip()
    except subprocess.CalledProcessError:
        return None
    return out or None


def main() -> int:
    check_only = "--check" in sys.argv
    xml = SITEMAP.read_text(encoding="utf-8")
    missing, updated = [], 0

    def fix(m: re.Match) -> str:
        nonlocal updated
        block, loc = m.group(0), m.group(1)
        path = loc_to_path(loc)
        if not path.exists():
            missing.append(loc)
            return block
        date = git_last_modified(path)
        if not date:
            missing.append(loc)
            return block
        tag = f"<lastmod>{date}</lastmod>"
        if "<lastmod>" in block:
            new = re.sub(r"<lastmod>[^<]*</lastmod>", tag, block)
        else:
            new = block.replace("</loc>", "</loc>" + tag, 1)
        if new != block:
            updated += 1
        return new

    xml_new = re.sub(r"<url><loc>([^<]+)</loc>.*?</url>", fix, xml, flags=re.S)

    for loc in missing:
        print(f"[WARN] 找不到對應檔案或 git 紀錄，略過：{loc}")

    if check_only:
        no_lastmod = len(re.findall(r"<url>(?:(?!<lastmod>).)*?</url>", xml, flags=re.S))
        print(f"缺 lastmod 的 URL：{no_lastmod}")
        return 1 if no_lastmod else 0

    if xml_new != xml:
        SITEMAP.write_text(xml_new, encoding="utf-8", newline="")
    print(f"[OK] lastmod 更新 {updated} 筆，總計 {len(re.findall('<url>', xml_new))} 筆 URL")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
