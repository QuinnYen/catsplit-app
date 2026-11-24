// 記帳面板的常駐數字鍵盤：0–9、小數點、⌫、＋−×÷。按鍵規則在 expression.js 的 pressKey。
import { useI18n } from '../../i18n/I18nProvider'

const KEYS = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  ['.', '0', '⌫', '+'],
]
const OP_LABEL = { '÷': 'ledger.pad.divide', '×': 'ledger.pad.times', '−': 'ledger.pad.minus', '+': 'ledger.pad.plus', '⌫': 'ledger.pad.backspace' }
const isOp = (k) => '÷×−+'.includes(k)

const NumberPad = ({ onKey }) => {
  const { t } = useI18n()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--cs-border)', borderTop: '1px solid var(--cs-border)', flexShrink: 0 }}>
      {KEYS.flat().map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onKey(k)}
          aria-label={OP_LABEL[k] ? t(OP_LABEL[k]) : k}
          style={{
            border: 'none', height: 46, fontSize: 20, fontVariantNumeric: 'tabular-nums', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            background: isOp(k) || k === '⌫' ? 'var(--cs-soft)' : 'var(--cs-card)',
            color: isOp(k) ? 'var(--cs-rc-stamp)' : 'var(--cs-text)', fontWeight: isOp(k) ? 600 : 400,
          }}
        >
          {k}
        </button>
      ))}
    </div>
  )
}

export default NumberPad
