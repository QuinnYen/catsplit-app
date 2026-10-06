// 收款方式的分類與清單。要新增一家，加進 PROVIDERS 即可。
export const REGIONS = [
  { id: 'tw', label: '台灣' },
  { id: 'cn', label: '大陸' },
]

// kind: 'app' 填一組收款碼；'bank' 填銀行代碼＋帳號
// openUrl(value)：回傳「點了會開啟已安裝 App」的連結，null 表示尚未確認格式（預覽只能複製）。
// 各家個人收款連結的格式官方沒有公開，確認後在這裡填入，例如：openUrl: (code) => `https://.../${encodeURIComponent(code)}`
export const PROVIDERS = [
  { id: 'richart', region: 'tw', name: 'Richart', kind: 'app', valueLabel: '收款碼', openUrl: null },
  { id: 'jkopay', region: 'tw', name: '街口支付', kind: 'app', valueLabel: '收款碼', openUrl: null },
  { id: 'bank', region: 'tw', name: '銀行轉帳', kind: 'bank' },
]

export const getProvider = (id) => PROVIDERS.find(p => p.id === id)

// 回傳錯誤訊息，通過則回傳空字串
export const validatePayment = (provider, { value, bankCode }) => {
  if (provider.kind === 'bank') {
    if (!/^\d{3}$/.test(bankCode)) return '銀行代碼為 3 碼數字'
    if (!/^\d{6,16}$/.test(value)) return '帳號請輸入 6～16 碼數字'
    return ''
  }
  if (!value) return `請輸入${provider.valueLabel}`
  if (value.length > 100) return `${provider.valueLabel}太長`
  return ''
}
