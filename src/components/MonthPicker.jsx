// 選月份的小視窗：上方切年份，下方 12 個月份按鈕；選了就回傳 'YYYY-MM'。
import { useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'

const navBtn = { background: 'none', border: 'none', fontSize: 22, lineHeight: 1, padding: '0 10px', cursor: 'pointer', color: 'var(--cs-text-sub)' }

const MonthPicker = ({ value, onPick, onClose }) => {
  const { t } = useI18n()
  const [year, setYear] = useState(Number(value.split('-')[0]))
  const selectedMonth = Number(value.split('-')[1])
  const selectedYear = Number(value.split('-')[0])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', width: '100%', maxWidth: 320, padding: 16, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={() => setYear(y => y - 1)} aria-label={t('month.prevYear')} style={navBtn}>‹</button>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cs-text)' }}>{year}</div>
          <button onClick={() => setYear(y => y + 1)} aria-label={t('month.nextYear')} style={navBtn}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
            const active = year === selectedYear && m === selectedMonth
            return (
              <button
                key={m}
                onClick={() => onPick(`${year}-${String(m).padStart(2, '0')}`)}
                style={{ padding: '10px 0', borderRadius: 6, fontSize: 14, cursor: 'pointer', border: active ? '1.5px solid var(--cs-rc-stamp)' : '0.5px solid var(--cs-border)', background: active ? 'var(--cs-soft)' : 'var(--cs-card)', color: active ? 'var(--cs-rc-owe)' : 'var(--cs-text)' }}
              >
                {t(`stats.month.${m}`)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default MonthPicker
