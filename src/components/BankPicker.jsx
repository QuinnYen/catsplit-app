import { useState } from 'react'
import { getBankName, searchBanks } from '../config/paymentProviders'
import { useI18n } from '../i18n/I18nProvider'

const box = { width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4', boxSizing: 'border-box' }

// 銀行選擇：輸入名稱關鍵字或代碼搜尋，點選後顯示「代碼 名稱」，可按「更換」重選
const BankPicker = ({ value, onChange }) => {
  const { t } = useI18n()
  const [keyword, setKeyword] = useState('')

  if (value) {
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span>{value} {getBankName(value)}</span>
        <button onClick={() => { onChange(''); setKeyword('') }} style={{ background: 'none', border: 'none', color: '#FF6B1A', fontSize: 13, cursor: 'pointer', padding: 0, flexShrink: 0 }}>{t('bank.change')}</button>
      </div>
    )
  }

  const results = searchBanks(keyword)
  return (
    <div>
      <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder={t('bank.placeholder')} style={box} />
      {keyword.trim() && (
        <div style={{ marginTop: 6, border: '0.5px solid #f0d5c0', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
          {results.length === 0
            ? <div style={{ padding: '10px 12px', fontSize: 13, color: '#c4a882' }}>{t('bank.none')}</div>
            : results.map(b => (
                <button key={b.code} onClick={() => onChange(b.code)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderTop: '0.5px solid #f5e8dc', background: 'none', fontSize: 14, color: '#3d2b1f', cursor: 'pointer' }}>
                  <span style={{ color: '#b08060', marginRight: 8 }}>{b.code}</span>{b.name}
                </button>
              ))}
        </div>
      )}
    </div>
  )
}

export default BankPicker
