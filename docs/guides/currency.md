# 貨幣與匯率

## 貨幣清單

`src/config/currencies.js` 的 `CURRENCIES` 是唯一來源，目前 29 種（台幣、日圓、美元、歐元、人民幣、港幣、韓元、英鎊、澳幣、加幣、新加坡幣、泰銖、越南盾、馬幣、菲律賓披索、印尼盾、印度盧比、紐幣、瑞士法郎、澳門幣、瑞典／挪威／丹麥克朗、土耳其里拉、阿聯迪拉姆、波蘭茲羅提、捷克克朗、墨西哥披索、巴西雷亞爾）。

每筆有三個欄位：

| 欄位 | 說明 |
|---|---|
| `code` | ISO 代碼，帳目與群組裡存的就是它 |
| `symbol` | 金額前的符號；和別的貨幣撞號的加前綴或用代碼（日圓 `¥`、人民幣 `CN¥`） |
| `decimals` | **實務慣用**的小數位數：日圓、韓元、越南盾、印尼盾與台幣是 0，其餘 2（不是 ISO 4217 的值） |

- 貨幣名稱不放字典，`currencyName(code, lang)` 用 `Intl.DisplayNames` 依語言產生（中文「日圓」、英文「Japanese Yen」），瀏覽器不支援時退回代碼。
- **新增一種貨幣**：確認 open.er-api.com 有這個代碼的匯率，再在 `CURRENCIES` 加一列即可；測試 `currencies.test.js` 會檢查代碼不重複、符號與小數位數齊全。
- 不認得的代碼（舊資料、外部帶入）`getCurrency` 退回第一個（台幣）。

## 匯率來源

`fetchExchangeRate(from, to)`：回傳「1 from = ? to」，來源是 open.er-api.com（免費、不需 key、網頁端直接呼叫）。同一個來源幣別的整份匯率表在記憶體快取 1 小時，失敗不快取。這是參考匯率，不是銀行或信用卡實際的結匯價。

`useExchangeRate(from, to, savedRate)`（`src/hooks/useExchangeRate.js`）：抓匯率並處理載入中、失敗、手動修改。`to` 為空字串時不抓、視為 1；`savedRate = { currency, rate }` 是編輯既有帳目時傳入，`from` 與它的幣別相同就沿用、不重抓。

## 基準幣與資料格式

群組的 `baseCurrency` 是所有金額的計價單位，**建立後沒有更改的介面**（改它要重算每一筆帳目、轉帳、彙總與預算）。

| 資料 | 欄位 | 單位 |
|---|---|---|
| 支出、收入 | `currency`（輸入的幣別）、`originalAmount`、`exchangeRate`（1 該幣別 = ? 基準幣） | 輸入幣別 |
| | `amount`、`splits`、`payments`／`received` | **基準幣**，兩位小數 |
| 轉帳 `settlements` | `amount` | **基準幣**，餘額照它加減 |
| | `currency`、`originalAmount`、`exchangeRate`（只有非基準幣才有） | 實際轉的幣別 |
| 群組 | `totalAmount`、`memberBalances`、`budget.amount` 等 | 基準幣 |

顯示轉帳或帳目的金額時用 `originalAmount ?? amount` 搭配 `currency`，非基準幣另外附 `≈ 基準幣金額`。

## 母國貨幣（參考用）

群組可選填 `homeCurrency`（建立群組時或群組編輯頁，不能與基準幣相同）。設了之後，支出與收入的明細頁在金額下方多顯示 `約 NT$ 149` 與 `匯率 0.2059`（1 基準幣 = ? 母國幣）。**只是參考，不影響結算與餘額，列表頁不顯示。**

- 記帳時 `buildHomeRef`（`expenseHelpers.js`）會把當下的匯率存進帳目：`homeCurrency`、`homeRate`。沒設母國幣、與基準幣相同、或這筆本身就是母國幣時不存；抓不到匯率也不擋記帳，只是不存。
- 明細頁用 `savedHomeRate` 取存下來的匯率；沒有（舊帳目），或帳目存的母國幣和群組現在的不同，就退回抓即時匯率。
- 編輯帳目：已存過且母國幣沒改就沿用原匯率（改備註、分帳不改匯率）；舊帳目第一次編輯存檔時補存**編輯當下**的匯率，不是當初記帳的。

## 轉帳可選幣別

結算頁每張轉帳建議卡片右下角可各自選幣別，金額依即時匯率換算，非基準幣的卡片外框為琥珀色。

- 網址只帶兩個參數：`amount`（基準幣的建議金額）與 `currency`（要轉的幣別）。**匯率由轉帳頁自己抓**，不從網址帶，避免被竄改。
- 換算在 `src/utils/transferAmounts.js`（`computeTransferAmounts`，有測試）：金額沒改就用精確的基準幣建議值記到餘額，改了就 `輸入值 × 匯率`（兩位小數）。
- 匯率還沒抓到不能送出；抓失敗顯示 `transfer.rateError`，可改用基準幣轉。

## 結算建議與金額顯示

- 結算建議在 `src/utils/settleSuggestions.js`（`computeSettleSuggestions`，有測試）：最少轉帳次數，金額依**基準幣的小數位數**取整（日圓整數、美元到分），取整後為 0 的殘餘不列。照建議轉完後不會再有建議。
- 金額一律用 `fmt.money(金額, 貨幣)`（含符號）或 `fmt.amount(金額, 貨幣)`（不含符號）顯示，依該貨幣的 `decimals` 固定位數（美元 `$ 12.50`、日圓 `¥ 1,235`）。不要再直接用 `fmt.num`、`toFixed(0)` 或 `Math.round` 處理金額。
- `roundToCurrency(金額, 貨幣)` 四捨五入到該貨幣的小數位數；`formatRate(匯率)` 保留 4 位有效數字（越南盾 0.0012 不會被截成 0）。

## 選貨幣的元件

`src/components/CurrencySelect.jsx`：點開後底部彈出可搜尋的清單（代碼、名稱、符號都能搜，中英文名稱都搜得到），最前面是「常用」：呼叫端用 `pinned` 指定的加上使用者最近選過的 4 種（存在 localStorage `cs-recent-currencies`，存不了不影響選擇）。

| prop | 說明 |
|---|---|
| `value`、`onChange(code)` | 受控；沒選時 `value` 為空字串 |
| `exclude` | 排除的貨幣（例如母國幣排除基準幣） |
| `pinned` | 固定排在「常用」的貨幣，通常用 `PINNED_CURRENCIES` |
| `noneLabel` | 有值時多一個「不選」選項（母國幣用） |
| `compact` | 觸發按鈕只顯示代碼，給金額欄旁、結算卡片這類窄位置 |
| `disabled`、`style`、`ariaLabel` | 一般用途 |

## 匯率換算頁

`/fx` 的多列換算計算機、免稅與刷卡的實付計算、自訂匯率與旅程記帳，見[個人記帳](personal-ledger.md)「旅程帳目與匯率頁」。計算機用同一份 open.er-api.com 匯率（以 USD 為 1 的一份表，記憶體快取 1 小時，任兩種幣別相除），自訂匯率優先。

## 已知限制

- 匯率在網頁端直接打外部 API，沒有集中管理或後端快取；API 掛掉時外幣帳目、轉帳與母國貨幣參考都抓不到匯率。
- 記帳頁輸入欄位不限制小數位數（日圓可以輸入 12.5），存檔時只統一成兩位小數。
- 沒有更改基準幣的功能。
