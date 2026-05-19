# Google Reviews Widget 設定 SOP
## CHUN.EN 首頁「客戶評論」區塊（§ 9.5）連動 Google Maps 評論

---

## 推薦工具：Elfsight Google Reviews Widget

**為什麼選 Elfsight**
- 免費版可顯示最近 5-10 條評論，月 view 200 次（多數小品牌夠用）
- 自動每天從 Google Maps 同步新評論
- 樣式可客製（顏色、字體、卡片排列），能配合 atelier 風格
- 不需要寫程式，純拷貝貼上

**月費（如果未來想升級）**
- Basic ~$5/月：更多 view 數、移除 Powered by Elfsight 浮水印
- Pro ~$10/月：完整評論顯示、進階版型

---

## 設定流程（約 5-10 分鐘）

### Step 1 — 註冊 Elfsight 帳號
1. 開啟 https://elfsight.com/
2. 右上「Sign Up」用 Google 帳號或 Email 註冊
3. 進入 Dashboard

### Step 2 — 新增 Google Reviews Widget
1. Dashboard → 「Create Widget」或「Add Widget」
2. 搜尋「Google Reviews」→ 點擊
3. 選樣式（推薦：**Carousel** 或 **List**，與 atelier 風格搭）
4. 點「Continue with this template」

### Step 3 — 連結 CHUN.EN 的 Google Maps
1. 在 Widget 編輯器內，點「Source」或「Account」
2. 輸入 CHUN.EN 形象美學的 Google Maps URL：
   ```
   https://maps.app.goo.gl/ey2JQd5JV9D5Xh4f8
   ```
   （或直接搜尋「CHUN.EN 形象美學」找到你的店家）
3. 授權連動（Elfsight 需要讀取你 Google Business 的權限）

### Step 4 — 客製外觀（搭配 atelier 風格）⚠️ 重要

審稿指出 Elfsight **預設模板**有亮藍 Write a Review 按鈕 + 多彩 Google logo，
與我們米色 atelier 風格嚴重衝突。**必須做以下調整**：

#### 4.1 模板選擇
- 推薦：**Carousel · Minimal** 或 **List · Editorial**
- **避開**：任何有大型 Write a Review 按鈕、星數面板的模板

#### 4.2 顏色設定
| 項目 | 設定值 |
|---|---|
| 背景 Background | `transparent`（或 `#F5F1E8`） |
| 主色 Accent / Primary | `#A88A5C` |
| 文字 Text color | `#1A1611` |
| 卡片背景 Card BG | `#FFFFFF` 或 `#FAF7F2` |
| 卡片邊框 Card border | `#E5E0D3`（0.5px） |
| 星星色 Star color | `#A88A5C`（金色） |
| 引號裝飾 Quote mark | `#A88A5C` |

#### 4.3 字體設定
- Primary Font：`Cormorant Garamond` 或 `Playfair Display`（若 Elfsight 提供）
- Fallback：`Serif`

#### 4.4 顯示行為設定 — **關鍵**
| 項目 | 設定 |
|---|---|
| ❌ **隱藏** Write a Review 按鈕 | OFF（hide） |
| ❌ **隱藏** Google branding logo | OFF（hide） |
| ❌ **隱藏** Rating Summary 大數字 | OFF |
| ✅ **顯示** 個別評論卡 | ON |
| ✅ **顯示** 評論者頭像 | ON |
| ✅ **顯示** 評論日期 | ON |
| ✅ **顯示** 5 星 star rating | ON |

#### 4.5 篩選條件
- Min rating：**4 stars**
- Max age：**12 個月** 內
- 每次顯示：**3-5 條**輪播
- 排序：Newest first 或 Most helpful

### Step 5 — 取得 embed code
1. 編輯完成 → 點「Publish」
2. Elfsight 會給你一段程式碼，**長這樣**：
   ```html
   <script src="https://static.elfsight.com/platform/platform.js" data-use-service-core defer></script>
   <div class="elfsight-app-XXXXXXXXX" data-elfsight-app-lazy></div>
   ```
3. **完整複製這段**

### Step 6 — 把 embed code 給我

把那段 `<script>` + `<div>` 程式碼貼到我們的對話中。我會：
1. 替換 `index.html` 中 `<div class="google-reviews-embed">` 內的 placeholder
2. 確保樣式與站內一致
3. 推上線

---

## 替代方案（如果不想用 Elfsight）

### 替代 A：Trustindex
- https://trustindex.io/
- 免費版顯示無限條評論（含浮水印）
- 設定流程類似
- 同樣會給你 `<script>` + `<div>` 拷貝貼上

### 替代 B：手動精選 3-5 條
- 你從 Google Maps 後台選 3-5 條最好的評論
- 把文字（含客戶名／日期／星數）給我
- 我做成靜態 HTML 直接貼在區塊內
- 缺點：不會自動更新

### 替代 C：基本 Google Maps Embed
- 用 Google 官方 iframe，顯示地圖+店家卡+部分評論
- 已在 contact.html 使用類似的，但只能顯示有限資訊
- 不推薦作為主要 Testimonials 呈現

---

## 提醒

- **Elfsight 的免費版**會有 "Powered by Elfsight" 小字（在 widget 底部）。若想移除需付月費 ~$5。
- **流量**：免費版 200 view/月，超過後 widget 暫停顯示直到次月。CHUN.EN 目前流量應該夠用，未來流量爆發再升級不遲。
- **更新頻率**：Elfsight 預設**每天**從 Google 同步一次新評論。
- **隱私**：所有評論都已經是 Google Maps 公開的，無額外隱私問題。

---

## 完成後 Section 在網站的位置

```
首頁 (index.html) 區塊順序：
  1. Hero
  2. About 三大子品牌
  3. Core Philosophy
  4. Visual Positioning Blueprint 預覽
  5. Three Studios
  6. Scenarios (3)
  ★ 7. Client Voices（Google 評論）  ← 新加在這
  8. The Atelier (勤美店空間)
  9. By Appointment Only
  10. Begin CTA
```

Client Voices 放在「我已認識服務」之後、「我想看實體空間」之前——這是建立信任的最佳轉換時機。
