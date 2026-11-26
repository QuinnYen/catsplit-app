// 「幣別」頁的編輯器（只管畫面，資料由外層傳入）：計算機顯示哪些幣別、順序（拖動排序）、新增與移除，
// 並且每種幣別可以直接設自訂匯率（1 幣別 = ? 基準幣），底下小字可「改為市場匯率」（= 移除這筆自訂匯率）。
// customRates 是 null（訪客）時不能自訂匯率，只顯示市場匯率。
import { useRef, useState } from 'react'
import { GripVertical, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import CurrencySelect from '../../components/CurrencySelect'
import { PINNED_CURRENCIES, currencyName, formatRate } from '../../config/currencies'
import { MAX_ROWS, pairRate, customRateOf } from './fxMath'
import { setCustomRate, removeCustomRate } from './fxSettings'
import { moveItem, dragTargetIndex } from './reorder'
import { useFxRates } from './hooks'

const MIN_ROWS = 2

// 匯率輸入：離開輸入框或按 Enter 時儲存；沒改就不動；不合法就還原並提示。外面用 key 帶上目前的值，外部改變時重新帶入
const RateField = ({ code, base, initial, onSave }) => {
  const { t } = useI18n()
  const [text, setText] = useState(initial)
  const [error, setError] = useState('')
  const commit = async () => {
    if (text.trim() === initial) return
    const reason = await onSave(text)
    if (reason) {
      setError(t(`fx.rates.err.${reason}`))
      setText(initial)
    } else setError('')
  }
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--cs-text-sub)' }}>
        <span style={{ whiteSpace: 'nowrap' }}>1 {code} =</span>
        <input
          value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          inputMode="decimal" placeholder="—" aria-label={t('fx.cur.rateOf', { code, base })}
          style={{ width: 96, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '5px 8px', fontSize: 14, color: 'var(--cs-text)', background: 'var(--cs-bg)', outline: 'none', textAlign: 'right' }}
        />
        <span>{base}</span>
      </label>
      {error && <div role="alert" style={{ fontSize: 11.5, color: 'var(--cs-danger)', marginTop: 2 }}>{error}</div>}
    </div>
  )
}

const CurrencyEditor = ({ base, rows, onRowsChange, customRates, onCustomRatesChange }) => {
  const { t, lang } = useI18n()
  const { rates, loading } = useFxRates([...rows, base])
  const rowEls = useRef({})
  const [drag, setDrag] = useState(null) // null | { index, startY, dy, h }
  const editable = customRates != null

  const marketOf = (code) => pairRate(rates, code, base)
  const reset = (code) => onCustomRatesChange(removeCustomRate(customRates, `${code}_${base}`))
  const saveRate = async (code, raw) => {
    const r = setCustomRate(customRates, code, base, raw) // 會一併移除反向的舊鍵
    if (!r.ok) return r.reason
    await onCustomRatesChange(r.customRates)
    return null
  }

  // 拖動：手柄按下後跟著手指移動，其他列讓位，放開時才寫入新順序
  const target = drag ? dragTargetIndex(drag.index, drag.dy, drag.h, rows.length) : null
  const onDown = (e, index) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag({ index, startY: e.clientY, dy: 0, h: rowEls.current[rows[index]]?.getBoundingClientRect().height ?? 0 })
  }
  const onMove = (e) => drag && setDrag({ ...drag, dy: e.clientY - drag.startY })
  const onUp = () => {
    if (drag && target !== drag.index) onRowsChange(moveItem(rows, drag.index, target))
    setDrag(null)
  }
  const shiftOf = (i) => {
    if (!drag || i === drag.index) return 0
    if (drag.index < i && i <= target) return -drag.h
    if (target <= i && i < drag.index) return drag.h
    return 0
  }

  const atMax = rows.length >= MAX_ROWS
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', overflow: 'hidden' }}>
        {rows.map((code, i) => {
          const dragging = drag?.index === i
          const custom = editable ? customRateOf(customRates, code, base) : null
          const market = marketOf(code)
          const marketText = market != null ? String(formatRate(market)) : ''
          return (
            <div
              key={code} ref={(el) => { rowEls.current[code] = el }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 6px 10px 4px', borderBottom: '0.5px solid var(--cs-border)', background: 'var(--cs-card)', position: 'relative',
                transform: `translateY(${dragging ? drag.dy : shiftOf(i)}px)`, transition: dragging ? 'none' : 'transform 0.12s', zIndex: dragging ? 2 : 0,
                boxShadow: dragging ? '0 4px 14px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              <button
                aria-label={t('fx.cur.drag', { code })} onPointerDown={(e) => onDown(e, i)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') { e.preventDefault(); onRowsChange(moveItem(rows, i, i - 1)) }
                  if (e.key === 'ArrowDown') { e.preventDefault(); onRowsChange(moveItem(rows, i, i + 1)) }
                }}
                style={{ background: 'none', border: 'none', padding: '8px 4px', color: 'var(--cs-text-mute)', cursor: 'grab', touchAction: 'none', display: 'flex', flexShrink: 0 }}
              ><GripVertical size={20} /></button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--cs-text)' }}>{code}</span>
                  <span style={{ fontSize: 12, color: 'var(--cs-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currencyName(code, lang)}</span>
                </div>
                {code === base ? (
                  <div style={{ fontSize: 12, color: 'var(--cs-text-mute)', marginTop: 4 }}>{t('fx.cur.baseHint')}</div>
                ) : (
                  <div style={{ marginTop: 6 }}>
                    {editable
                      ? <RateField key={`${code}|${custom ?? ''}|${marketText}`} code={code} base={base} initial={custom != null ? String(custom) : marketText} onSave={(raw) => saveRate(code, raw)} />
                      : <div style={{ fontSize: 13, color: 'var(--cs-text-sub)' }}>1 {code} = {loading && market == null ? '…' : marketText || '—'} {base}</div>}
                    {/* 底下小字：現在用的是市場匯率還是自訂匯率；自訂的可以改回市場匯率 */}
                    <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', marginTop: 4 }}>
                      {custom != null ? (
                        <>
                          {t('fx.cur.custom')}{marketText && ` · ${t('fx.cur.market', { rate: marketText })}`}{' · '}
                          <button onClick={() => reset(code)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--cs-rc-stamp)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>{t('fx.cur.useMarket')}</button>
                        </>
                      ) : t('fx.cur.marketRate')}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => onRowsChange(rows.filter((c) => c !== code))} disabled={rows.length <= MIN_ROWS} aria-label={t('fx.cur.remove', { code })}
                style={{ background: 'none', border: 'none', padding: 8, color: 'var(--cs-text-sub)', cursor: rows.length <= MIN_ROWS ? 'not-allowed' : 'pointer', opacity: rows.length <= MIN_ROWS ? 0.35 : 1, display: 'flex', flexShrink: 0 }}
              ><X size={18} /></button>
            </div>
          )
        })}
      </div>

      {atMax
        ? <div style={{ fontSize: 12, color: 'var(--cs-text-mute)', textAlign: 'center' }}>{t('fx.cur.max', { n: MAX_ROWS })}</div>
        : (
          <CurrencySelect
            value="" triggerLabel={t('fx.cur.add')} onChange={(code) => code && !rows.includes(code) && onRowsChange([...rows, code])}
            exclude={rows} pinned={PINNED_CURRENCIES} ariaLabel={t('fx.cur.add')}
            style={{ justifyContent: 'center', fontWeight: 600, color: 'var(--cs-rc-stamp)', padding: '11px 0', background: 'var(--cs-card)', border: '1px solid var(--cs-rc-stamp)' }}
          />
        )}
      <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.7 }}>{t('fx.cur.hint', { min: MIN_ROWS })}</div>
    </div>
  )
}

export default CurrencyEditor
