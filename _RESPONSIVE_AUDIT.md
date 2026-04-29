# 響應式檢查報告 v1

> **檢查日期**:2026-04-29
> **檢查寬度**:
> - **320px** — iPhone SE / 小型 Android(最窄常見手機)
> - **768px** — iPad 直立 / 大型手機橫向(critical breakpoint,我加的 mobile-nav.css 在這裡切換)
> - **1280px** — Desktop / 筆電一般尺寸
>
> **狀態標記**:
> - 🔴 **必修** — 邏輯上一定有問題,必爆
> - 🟡 **待測** — 我推測有問題,但需要實機確認
> - 🟢 **OK** — 邏輯上沒問題

---

## § 0 共用元素

### 0.1 Navbar(已用 `mobile-nav.css` 修補)
- **320**: 🟢 漢堡 + LOGO + (CTA 在 overlay 內)。已測過邏輯。
- **768**: 🔴 **這裡是 breakpoint 切換點**。剛好 768px 時 layout 會跳變。需要平滑過渡。
- **1280**: 🟡 兩側 ul 各 3 項 + LOGO + CTA 按鈕。`navbar-cta` 在 `<li>` 裡可能跟其他 li 對齊不齊(li 有 padding,btn 有自己的 padding)。
- **修改方向**:
  1. 768px 切換 → 改 769px 切換,避免邊界
  2. 桌機 navbar-cta 應該檢查 li 內按鈕的垂直對齊

### 0.2 Footer 5 欄(`1.5fr repeat(4, 1fr)`)
- **320**: 🟢 mobile-nav.css 已強制 `grid-template-columns: 1fr`(單欄)
- **768**: 🔴 **5 欄硬塞**(769px 開始就用桌機規則)。每欄寬度約 145px,Footer h6 + 連結文字必擠。
- **1024**: 🔴 同樣擠
- **1280**: 🟡 看起來剛好,但每欄 200px 字串「Instagram (@321_a_voir)」會超出單欄寬度
- **修改方向**:
  - 在 769-1023px 之間改成 2 欄 grid
  - 在 1024-1279px 改 3 欄
  - 1280+ 才用 5 欄
  - 或更簡單:全部統一 `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))`

### 0.3 Eyebrow 雙語標籤 `.eyebrow-bilingual`
結構:`[24px 金線]` + `EN UPPERCASE` + `中文`(全部 inline-flex,gap)
- **320**: 🟡 我有寫 `flex-wrap: wrap` 但 `::before` 那條 24px 金線會單獨跑一行,然後 EN 一行,中文一行 → 三行很醜
- **768**: 🟡 `INTEGRATED IMAGE SERVICES｜整合型形象服務` 這種長字串可能撐爆容器
- **1280**: 🟢 OK
- **修改方向**:在 768px 以下改用 `flex-direction: column` + 縮短金線,或乾脆把 `EN` 跟 `中文` 合在同一行用 `｜` 隔開

### 0.4 `bilingual-subtitle`(中文主標下面的英文副標)
- 全寬度: 🟢 字級用 `clamp(1.125rem, 1.6vw, 1.5rem)`,自動縮放,沒問題

### 0.5 Marquee 跑馬燈
- 全寬度: 🟢 橫向 scroll 動畫,寬度自適應

### 0.6 Pull Quote `.pull-quote`(典型用於 § 1.5 服務承諾)
- **320**: 🔴 `padding-left: var(--space-7)`(48px)+ 縱向金線在左,文字可用寬度 = 320 - 48 = 272px,長段落擠
- **768**: 🟢 OK
- **1280**: 🟢 OK
- **修改方向**:窄螢幕把 padding-left 縮到 `var(--space-5)` 或 `var(--space-4)`

---

## § 1 index.html

### 1.1 Hero(巨型 C 字 + 雙語標語)
- **320**: 🟢 mobile-nav.css 已限 `clamp(12rem, 60vw, 22rem)` 字級 + 隱藏縱向側邊文字
- **768**: 🟡 768px 剛好不在 mobile media query 內(我寫 max-width: 768px 是 ≤ 768,但有些瀏覽器可能 768.5 之類的精度問題)。巨型 C 字 `45vw` = 345px,跟內容區 hero-layered-content max-width: 900px 重疊,但 z-index 0 vs 1 應該 OK,只是視覺壓迫
- **1280**: 🟡 巨型 C 字 `45vw` = 576px,跟主標 `形象,是專業最沉穩的開場` 在中央重疊 → 雖然透明度 0.08,但仍可能讀起來雜
- **修改方向**:檢查桌機巨型字級的視覺重量,可能要 cap 到 35vw 或更小
- **內容過長問題**:🔴 `形象,是專業最沉穩的開場` 11 字塞 H1,在 320px(`clamp(2rem, 9vw, 3.5rem)` = 28.8px)勉強一行,但 italic 「開場」斷字位置可能在「沉穩」之後斷到下行,「開場」單獨換行不雅

### 1.2 Marquee
- 🟢 全寬度 OK

### 1.3 品牌身份揭露(editorial-spread + 圖)
- **320**: 🟡 `editorial-spread` 在 900px 變單欄(我沒查 inline style 是否有 override)。需要確認照片是否 100% 寬
- **768**: 🟢 已變單欄(900px 觸發)
- **1280**: 🟡 `5fr 1fr 6fr` 中間 1fr 是純空白欄,在中等寬度比例怪
- **修改方向**:中間空白欄 1fr 可能應改成固定 `var(--space-7)` 寬

### 1.4 三大子品牌(三張 col-4 卡片 + 拱形圖)
- **320**: 🟢 `col-4` 在 768px 以下變 col-12(單欄)
- **768**: 🔴 768px 邊界,剛好還在桌機模式,3 張並排每張寬 ~256px,`img-arch` 拱形圖 aspect-ratio 3/4 = 約 192×256 的小拱形,文字「形象診斷、風格定位、衣櫃規劃與選購陪同。為個人與企業建立可長期使用的視覺語言。」擠在 256px 寬度
- **1280**: 🟢 OK
- **修改方向**:把 col-4 的 768 breakpoint 提高到 900 或 1024,讓 769-1024 之間改用 2 欄

### 1.5 服務承諾引文 `.service-pledge`
- **320**: 🟡 `clamp(1.5rem, 3vw, 2.25rem)` 在 320px = 24px,「形象不是裝飾,是專業可信度的延伸。」一行很長,可能斷在不雅位置
- **768**: 🟢 OK
- **1280**: 🟢 OK
- **修改方向**:窄螢幕手動加 `<br>` 或調整 padding

### 1.6 服務流程(editorial-spread 反向)
- **320**: 🟡 文字段落 `text-align: right`,在窄螢幕單欄 + 右對齊,可讀性差(中文閱讀預設靠左)
- **768**: 🟢 已變單欄
- **1280**: 🟢 OK
- **修改方向**:單欄時取消 `text-align: right`

### 1.7 服務承諾 4 卡片 `.commitment-grid`(4 欄 grid)
- **320**: 🟢 已寫 `1fr` 單欄
- **600-900**: 🟡 寫 `1fr 1fr` 兩欄,每欄寬 ~300-450px,內容塞得下
- **900-1280**: 🔴 4 欄,每欄寬 ~225-320px,「為何選擇 CHUN.EN」這種短描述 OK,但邊框 border-right 切割線在窄螢幕看起來會擠
- **修改方向**:邏輯應該 OK,需實機確認字距

### 1.8 工作室 Lookbook(8 張橫向 scroll)
- **320**: 🔴 mobile-nav.css 已寫 `lookbook-item flex: 0 0 280px`,但卡片內的 `caption` 是 `display: flex; justify-content: space-between` 把中文 + 英文左右各一邊。280px 寬扣掉 `padding: var(--space-5)`(20px×2 = 40px) = 240px 可用,「品牌形象牆」5 字 + 「Brand Identity」14 字,左右擠 → 必有問題
- **768**: 🟢 OK(lookbook 卡 320px)
- **1280**: 🟢 OK
- **修改方向**:窄螢幕改 caption `flex-direction: column`(中文上,英文下)

### 1.9 服務範例情境卡(3 張 `.scenario-card`)
- **320**: 🟢 grid 已 `1fr` 單欄
- **768**: 🔴 768px 在 max-width: 900px 之內,單欄,但 photo aspect-ratio 4/3,單欄寬 ~700px → 圖高 ~525px,過大
- **900-1280**: 🔴 3 欄,每欄寬 ~280-400px,combo-text「À Voir 形象規劃 + B Room 妝髮 + C Photos 形象照」一行可能擠
- **修改方向**:窄螢幕降 photo aspect 到 16/9 或 3/2;combo-text 改用條列

### 1.10 Manifesto(`columns-2 drop-cap`)
- **320**: 🟢 `typography.css` 第 246 行已寫 768px 以下變單欄
- **768**: 🟢 同上
- **1280**: 🔴 兩欄首字下沉(4.5em)在 1280px 大小看起來 OK,**但首字斷在「多」「我」「我」「這」是中文,first-letter 對中文支援不一致**(瀏覽器可能渲染成整段第一個 token,中文標點符號會被吞)
- **修改方向**:中文 drop-cap 通常需要手動 wrap 第一個字 `<span class="first-char">多</span>` 加 CSS

### 1.11 Booking CTA(黑底)
- **320**: 🟡 兩個按鈕 `flex: justify-center; gap: 5; flex-wrap: wrap` mobile-nav.css 已強制垂直 stack
- **768**: 🟢 OK
- **1280**: 🟢 OK

---

## § 2 about.html

### 2.1 Hero(Logo 牆全幅 + 文字疊加)
- **320**: 🟡 H1 `Une Maison d'image.` 含 italic,字級 `clamp(... 5.5rem)` 在 320px 約 28-50px,塞得下但 hero min-height 88vh + padding `var(--space-8)` 上下 80px,整體可能太擠
- **768**: 🟢 OK
- **1280**: 🟢 OK

### 2.3 品牌故事(`columns-2 drop-cap`)
- 同 1.10:🟢 已處理單欄,但中文 drop-cap 待測

### 2.4 服務理念(editorial-spread)
- 同 1.3:中間空白欄問題

### 2.5 三大主張(3 個 col-4)
- **320**: 🟢 單欄
- **768**: 🔴 3 欄擠在 768px,`I.` `II.` `III.` 大數字 + 標題 + 描述,每欄 ~256px 擠
- **1280**: 🟢 OK

### 2.6 主理人 3 卡(`.person-card`)
- **320**: 🟢 col-4 → col-12 單欄。`person-portrait` aspect-ratio 3/4 在 320px 寬約 240px(扣 padding)→ 高 320px 直立大圖
- **768**: 🔴 3 欄,每欄 ~256px,portrait aspect 3/4 → 高 ~340px,小卡片正常
- **1280**: 🟢 OK
- **問題**:🔴 `[待業主提供]` 在所有寬度都顯示,看起來像 bug。應該確認上線前是否要替換成更友善的「即將公開」或乾脆隱藏這個區塊

### 2.7 工作室 4 宮格(`.studio-grid` 2x2)
- **320**: 🟡 mobile-nav.css 沒處理,inline style 寫 700px 以下變單欄,32vh 高度 → 4 張各佔螢幕 32% 高,4 張連續 = 128vh,要捲很久
- **768**: 🟡 仍 2x2 但 28vh 高度。可能 OK
- **1280**: 🟢 OK
- **修改方向**:窄螢幕把高度調成 35vh,且改成水平 swipe(類似 lookbook)更省空間

### 2.7 地圖區(grid col-6 + col-6)
- **320**: 🟢 col-6 → col-12 單欄
- **768**: 🔴 兩欄 `aspect-ratio: 16/9`,左欄文字 ~344px 寬,右欄地圖 16:9 = 344×193,小但堪用
- **1280**: 🟢 OK

---

## § 3-5 services/*.html(三頁類似)

### 3.1 Service Hero(左圖右文 / 左文右圖 / 全幅)
- **320**: 🟡 inline style 寫 `@media (max-width: 900px)` 變單欄,圖片 `min-height: 60vh`,文字區 padding `var(--space-9) var(--space-8)` = 80px 上下 + 64px 左右 → 320px 寬扣 128 = 192px 可用內容,擠
- **768**: 🟢 已變單欄(900 觸發)
- **1280**: 🟡 桌機雙欄,左圖 50vw + 右文 50vw,文字塞「重新建立一套足以面對任何場合的視覺語言。從風格定位到衣櫃整理,協助個人與企業建立可長期使用的形象資產。」+ 引文 + CTA,40-48 字 lead 加上下其他內容,在 50vw ~640px 寬度 OK
- **修改方向**:窄螢幕 padding 縮小

### 3.3 / 4.3 / 5.3 服務項目(6 個 col-4 卡片)
- 同 1.4:768px 邊界 3 欄擠

### 3.4 / 5.4 服務流程(`process-list / process-step`)
- **320**: 🔴 `display: grid; grid-template-columns: auto 1fr; gap: var(--space-7)`,大羅馬數字 `clamp(2.5rem, 4vw, 4rem)` 在 320px 約 40-50px,加 var(--space-7) 48px gap → 內容可用 ~220px。標題「初次諮詢　First Consultation」中文+英文,可能斷不雅
- **768**: 🟢 OK
- **1280**: 🟢 OK,max-width: 720px 居中

### 3.5 適合對象(2 欄 grid)
- **320**: 🟡 inline 寫 col-6 + col-6,768px 以下會 → col-12 單欄
- **768**: 🔴 2 欄,左標題 + 右清單,各 320px 寬,右清單 6 條中文短句尚 OK
- **1280**: 🟢 OK

### 4.4 依場合瀏覽(`occasion-grid` 2x2)
- **320**: 🟡 inline 寫 700px 以下單欄,4 張 aspect 4/5 各佔幾乎全螢幕高 = 滾很久
- **768**: 🔴 2 欄,每張 ~352px 寬 × 440px 高,文字 overlay 在底部 ok
- **1280**: 🟢 OK

### 5.5 作品展廳(gallery-placeholder)
- 全寬度: 🟢 純佔位,沒實際資料

### 5.6 拍攝須知(2 欄 col-6 + col-6)
- 同 2.7 地圖區邏輯:768px 兩欄擠

---

## § 6 portfolio.html

### 6.1 Filter Bar(sticky)
- **320**: 🟡 mobile-nav.css 已寫橫向滾動,`flex-wrap: nowrap`,但「À Voir 形象規劃 (0)」這種長標籤在小螢幕可能一個就佔半個螢幕
- **768**: 🔴 5 個按鈕 `flex-wrap: wrap` 預設可能換行,看起來凌亂
- **1280**: 🟢 OK

### 6.2 Masonry(`column-count: 3`)
- **320**: 🟢 ≤600 變 1 欄
- **768**: 🟢 600-900 是 2 欄
- **1280**: 🟢 3 欄

### 6.3 Lightbox 大圖
- 全寬度: 🟢 OK,close 按鈕在 320 已縮小

---

## § 7 booking.html

### 7.3 LINE 諮詢卡(`.line-card-inner` grid 2 欄)
- **320**: 🟢 inline 寫 700px 以下變單欄,QR 圖 + 文字垂直堆疊
- **768**: 🔴 2 欄,左 QR 240×240 + 右文字。文字區可用 ~480px,標題 + 帳號名 + 描述 + 按鈕,擠但堪用
- **1280**: 🟢 OK
- **問題**:🔴 QR 圖佔位的 fallback 文字「LINE QR Code public/images/LINE_QRCode.png (請放置 QR 圖檔)」在斜紋背景下對比度差,可能看不清楚

### 7.4 預約流程(4 欄)
- **320**: 🟢 inline 寫 500px 以下單欄
- **500-800**: 🟢 2 欄
- **800-1280**: 🟢 4 欄

### 7.5 建議預約期間表 `.lead-time-table`
- **320**: 🔴 **必爆!** 我完全沒寫橫向滾動,6 列 × 2 欄表格在 320px 寬一定溢出。`th/td` padding `var(--space-5)`(40px)+ 「À Voir 衣櫃健檢與選購陪同」中文長字串 + 右側「21 日」,加總 ≥400px
- **768**: 🟡 768px 寬度 OK,但表格無 horizontal scroll
- **1280**: 🟢 OK
- **修改方向**:**緊急**修。包 `<div style="overflow-x: auto">` 或改成卡片堆疊式 layout

### 7.6 預約須知(2 欄 col-6 + col-6)
- 同 2.7

---

## § 8 contact.html

### 8.2 三種管道(`info-grid` 3 欄)
- **320**: 🟢 800px 以下單欄
- **768**: 🔴 800px 是 breakpoint,768 仍是 3 欄,每欄 ~256px,放 QR 圖 160px + 文字,擠
- **1280**: 🟢 OK
- **修改方向**:breakpoint 改 900

### 8.3 工作室位置(地圖 + 營業時間)
- **320**: 🟡 `map-frame` aspect 16/9,在 320px = 320×180,看得到但小;`hours-block` 可讀性 OK
- **768**: 🟢 OK
- **1280**: 🟢 OK

### 8.4 聯絡表單
- **320**: 🟢 form-row 2 欄在 700px 變單欄
- **768**: 🟢 OK
- **1280**: 🟢 OK

### 8.5 追蹤我們(`social-grid` 2 欄)
- **320**: 🟢 600px 以下變單欄
- **768**: 🟢 OK
- **1280**: 🟢 OK

---

## 修改優先順序

### 第一輪 · 必修(影響可用性)
1. 🔴 **`lead-time-table` 表格在 320px 必溢出**(booking.html § 7.5)
2. 🔴 **Lookbook caption 中英文左右擠**(全頁出現的 § 1.8)
3. 🔴 **Footer 5 欄在 768-1024px 擠**(全頁)
4. 🔴 **三大子品牌 / 服務項目 3-6 卡在 768px 邊界擠**(index § 1.4 + services § 3.3/4.3/5.3 + about § 2.5/2.6)
5. 🔴 **`info-grid` 3 欄在 768px 擠**(contact § 8.2)
6. 🔴 **Pull quote padding-left 太多**(index § 1.5 共用)

### 第二輪 · 視覺品質
7. 🟡 **Eyebrow 雙語標籤窄螢幕折行不雅**(全站)
8. 🟡 **Hero 巨型 C 字桌機過大**(index § 1.1)
9. 🟡 **Service hero 雙欄文字區窄螢幕擠**(services § 3.1/4.1/5.1)
10. 🟡 **`occasion-grid` / `studio-grid` 中等寬度滾動過長**(b-room § 4.4 + about § 2.7)

### 第三輪 · 細節
11. 🟡 **中文 `drop-cap` first-letter 不正確**(index § 1.10 + about § 2.3)
12. 🟡 **Service flow 流程在 320 大數字 + 中英標題擠**(services § 3.4/5.4)
13. 🟡 **Filter bar 按鈕在 768 換行凌亂**(portfolio § 6.1)
14. 🟡 **QR fallback 對比度差**(booking § 7.3)

### 第四輪 · 內容層次
15. ⚠️ `[待業主提供]` 文字在主理人卡看起來像 bug(about § 2.6),應改用更友善的暫時文案

---

## 結論

**根本問題**(這也是為什麼補丁式修不徹底):
- 我寫的 inline styles 在每頁 `<style>` 重複,有 8 套不同的 `.eyebrow-bilingual` / `.commitment-card` / `.scenario-card` 等定義
- 沒有統一 `.responsive-grid` 或 `.cards-3` 這種抽象的網格系統
- mobile-nav.css 處理 ≤768px 的補丁,但 769-1023px 的「平板/小筆電」區段完全沒人管

**比較徹底的解法**:把所有自訂 CSS(`.eyebrow-bilingual` / `.bilingual-subtitle` / `.commitment-grid` / `.scenario-grid` / `.service-item` / `.process-step` / `.theme-card` / `.line-card` / `.info-card` / `.qa-list` 等)抽出來建一個 `site.css`,集中管理 + 加完整 breakpoint(480 / 768 / 1024 / 1280),刪掉每頁 inline 的重複定義。

**實務建議**:第一輪 6 個必修 → 第二輪 4 個 → 第三輪細節 → 最後做 CSS 重構。

---

## 等你決策

請告訴我:
1. **同意這份報告嗎?** 有遺漏的請補充
2. **要先修第一輪 6 個必修嗎?** 還是要先做 CSS 重構(把 inline style 抽出)?
3. **`[待業主提供]` 暫時文案怎麼處理?**(主理人卡)
