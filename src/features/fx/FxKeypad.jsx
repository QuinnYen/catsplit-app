// 匯率計算機的鍵盤（截圖版面）：收據（記帳）、C、⌫、÷ / 7 8 9 × / 4 5 6 − / 1 2 3 + / 00 0 . ＝。
// 算式規則在 ledger/expression.js；這裡只負責把按鍵交給 onKey，收據鍵交給 onRecord。
import { Receipt } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'

const LAYOUT = [
  ['record', 'C', '⌫', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['00', '0', '.', '='],
]
const OPS = '÷×−+'
const ARIA = { C: 'fx.pad.clear', '⌫': 'ledger.pad.backspace', '÷': 'ledger.pad.divide', '×': 'ledger.pad.times', '−': 'ledger.pad.minus', '+': 'ledger.pad.plus', '=': 'fx.pad.equals', record: 'fx.pad.record' }

const base = { border: '0.5px solid var(--cs-border)', borderRadius: 10, height: 'clamp(38px, 5.4vh, 46px)', fontSize: 22, fontVariantNumeric: 'tabular-nums', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', display: 'grid', placeItems: 'center', padding: 0 }

const styleOf = (k, recordDisabled) => {
  if (k === 'record') return { ...base, background: 'var(--cs-soft)', color: 'var(--cs-rc-stamp)', opacity: recordDisabled ? 0.45 : 1 }
  if (k === '=') return { ...base, background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', border: 'none', fontWeight: 700 }
  if (OPS.includes(k) || k === 'C' || k === '⌫') return { ...base, background: 'var(--cs-soft)', color: 'var(--cs-text)', fontWeight: 600 }
  return { ...base, background: 'var(--cs-card)', color: 'var(--cs-text)', fontWeight: 600 }
}

// recordDisabled：訪客或沒選旅程時收據鍵灰色，但仍可按（按了會提示原因）
const FxKeypad = ({ onKey, onRecord, recordDisabled = false }) => {
  const { t } = useI18n()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
      {LAYOUT.flat().map((k) => (
        <button
          key={k} type="button" onClick={() => (k === 'record' ? onRecord() : onKey(k))}
          aria-label={ARIA[k] ? t(ARIA[k]) : k} aria-disabled={k === 'record' && recordDisabled ? true : undefined}
          style={styleOf(k, recordDisabled)}
        >
          {k === 'record' ? <Receipt size={22} /> : k}
        </button>
      ))}
    </div>
  )
}

export default FxKeypad
