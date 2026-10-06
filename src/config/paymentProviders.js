// 收款方式的分類與清單。要新增一家，加進 PROVIDERS 即可。
export const REGIONS = [
  { id: 'tw', label: '台灣' },
  { id: 'cn', label: '大陸' },
]

// kind: 'app' 填一組識別資料；'bank' 填銀行代碼＋帳號
// parse(raw)：把使用者輸入（可能是整條連結）轉成要儲存的值，格式不對回傳 ''
// openUrl(value)：點了會開啟已安裝 App 的連結
// display(value)：畫面上顯示的文字（預設直接顯示 value）
export const PROVIDERS = [
  {
    id: 'richart', region: 'tw', name: 'Richart', kind: 'app',
    valueLabel: '收款連結', placeholder: 'https://richart.tw/...?token=...',
    invalidMsg: '請貼上 Richart 的收款連結',
    // token 由 Richart App 產生，無法自行組出，所以要使用者貼上 App 分享的連結（也接受只貼 token）
    parse: (raw) => raw.match(/token=([0-9a-f]{32})/i)?.[1] ?? (/^[0-9a-f]{32}$/i.test(raw) ? raw : ''),
    openUrl: (token) => `https://richart.tw/TSDIB_RichartWeb/RC04/RC040300?token=${token}`,
    display: () => '已設定收款連結',
  },
  {
    id: 'jkopay', region: 'tw', name: '街口支付', kind: 'app',
    valueLabel: '街口帳號', placeholder: '例如：900587854（也可貼上收款連結）',
    invalidMsg: '街口帳號為 6～12 碼數字',
    parse: (raw) => raw.match(/Transfer:(\d{6,12})/)?.[1] ?? (/^\d{6,12}$/.test(raw) ? raw : ''),
    openUrl: (account) => `https://service.jkopay.com/r/transfer?j=Transfer:${account}`,
  },
  { id: 'bank', region: 'tw', name: '銀行轉帳', kind: 'bank' },
]

export const getProvider = (id) => PROVIDERS.find(p => p.id === id)

// 使用者輸入 → 要儲存的值
export const normalizeValue = (provider, raw) => {
  const text = raw.trim()
  if (provider.kind === 'bank') return text.replace(/[\s-]/g, '')
  return provider.parse(text)
}

export const formatValue = (provider, value) => provider?.display?.(value) ?? value

// 回傳錯誤訊息，通過則回傳空字串（value 為 normalizeValue 的結果）
export const validatePayment = (provider, { value, bankCode }) => {
  if (provider.kind === 'bank') {
    if (!/^\d{3}$/.test(bankCode)) return '銀行代碼為 3 碼數字'
    if (!/^\d{6,16}$/.test(value)) return '帳號請輸入 6～16 碼數字'
    return ''
  }
  return value ? '' : provider.invalidMsg
}
