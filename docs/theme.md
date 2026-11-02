# 暗黑模式

設定頁的「外觀」可選**跟隨系統**（預設）、**淺色**、**深色**。設定只存在這台裝置的 `localStorage`（key `cs-theme`），不同步到帳號。

## 運作方式

- `<html data-theme="light|dark">` 決定目前主題；`src/index.css` 的 `:root` 定義淺色變數，`:root[data-theme="dark"]` 覆寫成深色。
- `src/theme/ThemeProvider.jsx` 提供 `useTheme()`（`mode`、`resolved`、`setMode`）。`system` 模式會監聽系統主題，中途切換即時生效。
- `index.html` 有一小段內嵌腳本，在畫面繪製前先設好 `data-theme`，避免深色使用者載入時閃白。它的判斷邏輯與 `src/theme/theme.js` 的 `resolveTheme` 相同，**兩處要同步修改**。
- 純判斷（`normalizeMode`、`resolveTheme`）在 `src/theme/theme.js`，有測試。

## 顏色一律用變數

程式裡不要寫死色碼，改用 `var(--cs-…)`：

| 變數 | 用途 |
|---|---|
| `--cs-bg` | 頁面底 |
| `--cs-card` | 卡片、彈窗底 |
| `--cs-soft`、`--cs-soft-2` | 淡橘底 |
| `--cs-border`、`--cs-line-soft` | 邊框、分隔線 |
| `--cs-track` | 進度條軌道等淡底 |
| `--cs-text`、`--cs-text-2`、`--cs-text-sub`、`--cs-text-mute` | 文字，由深到淡 |
| `--cs-overlay` | 彈窗遮罩 |
| `--cs-accent-border` | 橘色系邊框、頭像底 |
| `--cs-danger`／`-bg`／`-border`、`--cs-success…`、`--cs-info…`、`--cs-warn…` | 狀態色 |
| `--cs-gi-{name}-bg`／`-fg` | 群組圖示配色 |
| `--cs-on-brand`、`--cs-on-brand-warn`、`--cs-on-brand-over` | 橘色頁首上的填色，兩種模式不變 |

兩種模式都不變、可直接寫色碼的：橘色品牌色（`#FF8C42`、`#FF6B1A`、`#E8703A`、`#D98C5F`）、LINE 綠與綠色填色、`color` 屬性的 `#fff`、半透明白／黑／橘／LINE 綠。

`npm run check:colors`（也在 `npm test` 裡）會掃出 `src` 裡其他寫死的色碼。真的需要固定色時（例如圖表色盤），在該行尾端加 `// cs-color-ok`。QR code 的 `dark`／`light` 色必須是真正的色碼，掃描器也會放行。

## 不在範圍內

`public/` 的靜態頁（條款、隱私權）、LINE 的 Flex 分享訊息（`flexMessages.js`、`shareContent.js`）、裁切畫面（`CropModal.jsx`，本來就是黑底）維持原樣。
