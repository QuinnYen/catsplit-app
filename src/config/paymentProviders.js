// 收款方式的分類與清單。要新增一家，加進 PROVIDERS 即可。
import BANKS from './bankCodes.json' with { type: 'json' }
import zhTW from '../i18n/zh-TW.js'
import { translate } from '../i18n/core.js'

// 沒傳 t 時用中文，讓測試與舊呼叫維持原本輸出
const zhT = (key, params) => translate({ 'zh-TW': zhTW }, 'zh-TW', key, params)

// 目前只有台灣；只剩一個分類時，管理頁不顯示分類選擇。要加地區就在這裡加一筆
export const REGIONS = [
  { id: 'tw', labelKey: 'region.tw' },
]

// 名稱、說明文字存的是字典 key（nameKey、valueLabelKey…），畫面用 t() 取字；品牌名稱沒有翻譯就直接放 name
// kind: 'app' 填一組識別資料；'bank' 填銀行代碼＋帳號
// parse(raw)：把使用者輸入（可能是整條連結）轉成要儲存的值，格式不對回傳 ''
// openUrl(value)：點了會開啟已安裝 App 的連結
// display(value)：畫面上顯示的文字（預設直接顯示 value）
export const PROVIDERS = [
  {
    id: 'richart', region: 'tw', name: 'Richart', kind: 'app',
    valueLabelKey: 'provider.richart.valueLabel', placeholder: 'https://richart.tw/...?token=...',
    hintKey: 'provider.richart.hint',
    invalidKey: 'provider.richart.invalid',
    // token 由 Richart App 產生，無法自行組出，所以要使用者貼上 App 分享的連結（也接受只貼 token）
    parse: (raw) => raw.match(/token=([0-9a-f]{32})/i)?.[1] ?? (/^[0-9a-f]{32}$/i.test(raw) ? raw : ''),
    openUrl: (token) => `https://richart.tw/TSDIB_RichartWeb/RC04/RC040300?token=${token}`,
    displayKey: 'provider.richart.display',
  },
  {
    id: 'jkopay', region: 'tw', nameKey: 'payMethod.jkopay', kind: 'app',
    valueLabelKey: 'provider.jkopay.valueLabel', placeholderKey: 'provider.jkopay.placeholder',
    hintKey: 'provider.jkopay.hint',
    invalidKey: 'provider.jkopay.invalid',
    parse: (raw) => raw.match(/Transfer:(\d{6,12})/)?.[1] ?? (/^\d{6,12}$/.test(raw) ? raw : ''),
    openUrl: (account) => `https://service.jkopay.com/r/transfer?j=Transfer:${account}`,
  },
  { id: 'bank', region: 'tw', nameKey: 'payMethod.bank', kind: 'bank' },
  // 清單裡沒有的收款方式：使用者自己填名稱與收款資訊，所有分類都會出現（region '*'）
  { id: 'custom', region: '*', nameKey: 'provider.custom', kind: 'custom' },
]

export const getProvider = (id) => PROVIDERS.find(p => p.id === id)

// 收款方式的名稱；自行輸入的用使用者填的名稱
export const providerName = (p, t = zhT) => p.nameKey ? t(p.nameKey) : p.name

export const methodName = (m, t = zhT) => {
  if (m.providerId === 'custom') return m.customName
  const p = getProvider(m.providerId)
  return p ? providerName(p, t) : m.providerId
}

export const getBankName = (code) => BANKS.find(b => b.code === code)?.name

// 依代碼開頭或名稱關鍵字搜尋銀行；沒輸入回傳空陣列
export const searchBanks = (keyword, limit = 8) => {
  const q = keyword.trim()
  if (!q) return []
  return BANKS.filter(b => b.code.startsWith(q) || b.name.includes(q)).slice(0, limit)
}

// 使用者輸入 → 要儲存的值
export const normalizeValue = (provider, raw) => {
  const text = raw.trim()
  if (provider.kind === 'bank') return text.replace(/[\s-]/g, '')
  if (provider.kind === 'custom') return text
  return provider.parse(text)
}

export const formatValue = (provider, value, t = zhT) => provider?.displayKey ? t(provider.displayKey) : value

// 收款方式在畫面上的顯示文字
export const describeMethod = (m, t = zhT) =>
  m.providerId === 'custom' ? m.value : m.providerId === 'bank' ? `${getBankName(m.bankCode) ?? ''} (${m.bankCode}) ${m.value}`.trim() : formatValue(getProvider(m.providerId), m.value, t)

// 回傳錯誤訊息，通過則回傳空字串（value 為 normalizeValue 的結果）
export const validatePayment = (provider, { value, bankCode, customName }, t = zhT) => {
  if (provider.kind === 'custom') {
    if (!customName) return t('pay.err.customName')
    return value ? '' : t('pay.err.customValue')
  }
  if (provider.kind === 'bank') {
    if (!getBankName(bankCode)) return t('pay.err.bank')
    if (!/^\d{6,16}$/.test(value)) return t('pay.err.account')
    return ''
  }
  return value ? '' : t(provider.invalidKey)
}
