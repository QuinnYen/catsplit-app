import { Check } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'

// 「儲存後分享到 LINE 群組」開關；僅在 LINE app 內使用
const ShareToLineToggle = ({ checked, onChange }) => {
  const { t } = useI18n()
  return (
  <button
    onClick={() => onChange(v => !v)}
    style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
      borderRadius: 16, border: 'none', cursor: 'pointer', width: '100%',
      background: checked ? '#e8f5e9' : '#fff',
      outline: checked ? '1.5px solid #06C755' : '0.5px solid #f0d5c0',
    }}
  >
    <div style={{
      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
      border: checked ? 'none' : '1.5px solid #d0b09a',
      background: checked ? '#06C755' : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {checked && <Check size={12} color="#fff" strokeWidth={3} />}
    </div>
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
      <path d="M11 2C6.03 2 2 5.58 2 10c0 3.54 2.56 6.57 6.24 7.73-.09.31-.56 1.97-.64 2.27 0 0-.04.14.07.19.11.06.24.01.24.01.32-.04 3.72-2.45 4.09-2.7.66.09 1.34.14 2.03.14 4.97 0 9-3.58 9-8s-4.03-8-9-8z" fill={checked ? '#06C755' : '#b08060'} />
    </svg>
    <span style={{ fontSize: 13, color: checked ? '#2e7d32' : '#b08060', fontWeight: checked ? 500 : 400 }}>
      {t('form.shareToLine')}
    </span>
  </button>
  )
}

export default ShareToLineToggle
