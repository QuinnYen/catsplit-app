// 主題模式的純判斷。index.html 的內嵌腳本有一份同樣的邏輯（畫面繪製前先設好 data-theme），修改時兩處要同步
export const THEME_STORAGE_KEY = 'cs-theme'

// 只有 'light'、'dark' 原樣保留，其餘（含讀不到、亂碼）一律當作跟隨系統
export const normalizeMode = (value) => (value === 'light' || value === 'dark' ? value : 'system')

export const resolveTheme = (mode, systemPrefersDark) =>
  mode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : mode
