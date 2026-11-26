// 匯率計算機（截圖 1、4）：多列換算、實付（免稅與刷卡）、數字鍵盤、收據鍵記帳。
// 這個元件只管計算與畫面，不碰 Firestore 或帳本：旅程、換算列的存取與「記帳」由外層（FxCalculatorPage）以 props 傳入。
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, List, SlidersHorizontal } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import CurrencySelect from '../../components/CurrencySelect'
import FeatureTabBar from '../../components/FeatureTabBar'
import { PINNED_CURRENCIES, getCurrency } from '../../config/currencies'
import { pressKey, evaluateExpression, commitExpression, hasOperator } from '../ledger/expression'
import { todayStr } from '../ledger/dates'
import { DEFAULT_FX_SETTINGS, convertRows, computePay, pairRate, formatFixed, roundTo, recordAmount } from './fxMath'
import { useFxRates } from './hooks'
import FxKeypad from './FxKeypad'
import TripPicker from './TripPicker'

const iconBtn = { background: 'none', border: 'none', color: 'var(--cs-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 6, minWidth: 0 }
const chip = (on) => ({
  border: `1px solid ${on ? 'var(--cs-rc-stamp)' : 'var(--cs-border)'}`, borderRadius: 999, padding: '9px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  background: on ? 'var(--cs-soft)' : 'var(--cs-card)', color: on ? 'var(--cs-rc-stamp)' : 'var(--cs-text-sub)', WebkitTapHighlightColor: 'transparent',
})

/**
 * @param base         帳本統計幣別（訪客是 TWD）
 * @param settings     計算機設定（fxMath 的 DEFAULT_FX_SETTINGS；第五階段改讀雲端）
 * @param trips        可選的旅程（不含封存與垃圾桶）
 * @param currentTrip  目前選的旅程或 null
 * @param rows         換算列的幣別（1–6 個）；payCurrency 實付幣別
 * @param onRowsChange(rows)、onPayChange(code)  換算列或實付幣別改了（外層決定存哪）
 * @param onPickTrip(id|null)、onCreateTrip()、onManageTrips()、onOpenDetail()  旅程相關；onOpenSettings() 開設定頁（沒給就不顯示齒輪）
 * @param canRecord    能不能記帳（已登入非訪客）；onRecord(preset) 開記帳面板，preset 見 LedgerEntrySheet 的 initialDraft
 */
const FxCalculator = ({ base, settings = DEFAULT_FX_SETTINGS, trips, currentTrip, rows, payCurrency, onRowsChange, onPayChange, onPickTrip, onCreateTrip, onManageTrips, onOpenDetail, onOpenSettings, canRecord, onRecord }) => {
  const { t } = useI18n()
  const [active, setActive] = useState(0)
  const [expr, setExpr] = useState(() => (settings.defaultAmount > 0 ? String(settings.defaultAmount) : ''))
  const [taxOn, setTaxOn] = useState(false)
  const [cardOn, setCardOn] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [hint, setHint] = useState('')
  const hintTimer = useRef(null)
  useEffect(() => () => clearTimeout(hintTimer.current), [])
  const showHint = (message) => {
    setHint(message)
    clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHint(''), 2200)
  }

  const activeIdx = Math.min(active, rows.length - 1)
  const activeCode = rows[activeIdx]
  const { decimals, customRates } = settings
  const value = evaluateExpression(expr) // 除以 0 是 null
  const { rates, loading, error, retry } = useFxRates([...rows, payCurrency, base])
  const rowValues = useMemo(() => convertRows({ value, from: activeCode, codes: rows, rates, custom: customRates }), [value, activeCode, rows, rates, customRates])
  const pay = useMemo(
    () => computePay({ amount: value, from: activeCode, pay: payCurrency, rates, custom: customRates, taxFree: taxOn, taxPercent: settings.taxFreePercent, card: cardOn, cardPercent: settings.cardFeePercent }),
    [value, activeCode, payCurrency, rates, customRates, taxOn, cardOn, settings.taxFreePercent, settings.cardFeePercent],
  )
  const sym = (code) => (settings.showSymbol ? getCurrency(code).symbol : '')
  const cell = (v) => (loading && v == null ? '…' : formatFixed(v, decimals))

  const onKey = (k) => {
    if (k === 'C') return setExpr('')
    if (k === '=') return hasOperator(expr) ? setExpr(commitExpression(expr, 2)) : undefined
    if (k === '00') return setExpr(pressKey(pressKey(expr, '0'), '0'))
    setExpr(pressKey(expr, k))
  }

  // 點別列＝改成從那一列輸入；金額帶那一列目前換算出來的數字
  const activate = (i) => {
    if (i === activeIdx) return
    const v = rowValues[rows[i]]
    setActive(i)
    setExpr(v != null && v > 0 ? String(roundTo(v, decimals)) : '')
  }

  // 改某一列的幣別；選到別列已有的幣別就和那一列對調（不重複）
  const changeRow = (i, code) => {
    const j = rows.indexOf(code)
    const next = [...rows]
    if (j >= 0 && j !== i) next[j] = rows[i]
    next[i] = code
    onRowsChange(next)
  }

  const record = () => {
    if (!canRecord) return showHint(t('fx.calc.guestNoRecord'))
    if (!currentTrip) {
      showHint(t('fx.calc.needTrip'))
      return setPickerOpen(true)
    }
    const amount = pay && pay.total > 0 ? recordAmount(pay.total, payCurrency) : 0
    if (!(amount > 0)) return showHint(t('fx.calc.needAmount'))
    const baseRate = pairRate(rates, customRates, payCurrency, base)
    onRecord({
      tripId: currentTrip.id, currency: payCurrency, expr: String(amount), sourceType: 'fx', date: todayStr(),
      ...(baseRate && { baseRate }),
      onSaved: () => setExpr(''), // 記完清空金額，保留旅程與換算列
    })
  }

  const pct = (n) => parseFloat(n.toFixed(2))
  const showPay = (taxOn || cardOn) && pay

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 16px)' }}>
      <div className="cs-body" style={{ padding: '10px 16px 0' }}>
        {/* 頁首：旅程名稱（點開選旅程）與旅程明細 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
          {onPickTrip ? (
            <button onClick={() => setPickerOpen(true)} aria-haspopup="dialog" aria-label={t('fx.calc.pickTrip')} style={{ ...iconBtn, flex: 1, justifyContent: 'flex-start' }}>
              <BookOpen size={22} />
              <span style={{ fontSize: 18, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTrip?.name ?? t('fx.calc.noTrip')}</span>
            </button>
          ) : <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--cs-text)', padding: 6 }}>{t('fx.calc.title')}</div>}
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {currentTrip && <button onClick={onOpenDetail} aria-label={t('fx.calc.detail')} style={iconBtn}><List size={22} /></button>}
            {onOpenSettings && <button onClick={onOpenSettings} aria-label={t('fx.calc.settings')} style={iconBtn}><SlidersHorizontal size={22} /></button>}
          </div>
        </div>

        {/* 換算列：點金額從那一列輸入，點幣別代碼換幣別 */}
        <div>
          {rows.map((code, i) => {
            const on = i === activeIdx
            const preview = on && hasOperator(expr) && value != null ? `= ${formatFixed(value, decimals)}` : ''
            return (
              <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--cs-border)', minHeight: 58 }}>
                {/* 選擇鈕本身是撐滿寬度的，要包一層固定寬度，金額才有位置 */}
                <div style={{ width: 96, flexShrink: 0 }}>
                  <CurrencySelect value={code} onChange={(c) => changeRow(i, c)} compact pinned={PINNED_CURRENCIES} ariaLabel={t('fx.calc.rowCurrency', { n: i + 1 })} style={{ fontWeight: 700, fontSize: 16 }} />
                </div>
                <button onClick={() => activate(i)} aria-pressed={on} aria-label={`${code} ${on ? (expr || '0') : cell(rowValues[code])}`} style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right', padding: '6px 0', color: on ? 'var(--cs-text)' : 'var(--cs-text-sub)', fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ fontSize: (on ? (expr || '0') : cell(rowValues[code])).length > 11 ? 20 : 28, fontWeight: 700, wordBreak: 'break-all' }}>{on ? (expr || '0') : cell(rowValues[code])}</span>
                  {on && <span aria-hidden="true" style={{ display: 'inline-block', width: 2, height: 28, marginLeft: 3, background: 'var(--cs-rc-stamp)', verticalAlign: 'middle' }} />}
                  <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 6, color: 'var(--cs-text-sub)' }}>{sym(code)}</span>
                  {preview && <span style={{ display: 'block', fontSize: 12, color: 'var(--cs-text-sub)' }}>{preview}</span>}
                </button>
              </div>
            )
          })}
        </div>

        {error
          ? <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)', padding: '8px 0' }}>{t('fx.calc.rateError')} <button onClick={retry} style={{ background: 'none', border: 'none', color: 'var(--cs-rc-stamp)', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>{t('fx.calc.retry')}</button></div>
          : <div style={{ fontSize: 11, color: 'var(--cs-text-mute)', padding: '6px 0' }}>{hint || t('fx.calc.rateNote')}</div>}

        {/* 實付：免稅與刷卡打開時才出現 */}
        {showPay && (
          <div style={{ padding: '0 0 8px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
              {taxOn && <span style={{ ...chip(false), cursor: 'default', fontSize: 13 }}>{t('fx.calc.taxFree', { pct: pct(settings.taxFreePercent) })} −{sym(payCurrency)}{formatFixed(pay.taxDeduct, decimals)}</span>}
              {cardOn && <span style={{ ...chip(false), cursor: 'default', fontSize: 13 }}>{t('fx.calc.card', { pct: pct(settings.cardFeePercent) })} +{sym(payCurrency)}{formatFixed(pay.fee, decimals)}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--cs-text-sub)' }}>{t('fx.calc.pay')} {payCurrency}</span>
              <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--cs-rc-stamp)', fontVariantNumeric: 'tabular-nums' }}>{sym(payCurrency)}{formatFixed(pay.total, decimals)}</span>
            </div>
          </div>
        )}

        {/* 實付幣別與修飾鈕 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 10px', overflowX: 'auto' }}>
          <div style={{ width: 96, flexShrink: 0 }}>
            <CurrencySelect value={payCurrency} onChange={onPayChange} compact pinned={PINNED_CURRENCIES} ariaLabel={t('fx.calc.payCurrency')} style={{ fontWeight: 700 }} />
          </div>
          <button onClick={() => setCardOn(!cardOn)} aria-pressed={cardOn} style={chip(cardOn)}>{t('fx.calc.card', { pct: pct(settings.cardFeePercent) })}</button>
          <button onClick={() => setTaxOn(!taxOn)} aria-pressed={taxOn} style={chip(taxOn)}>{t('fx.calc.taxFree', { pct: pct(settings.taxFreePercent) })}</button>
        </div>

        <FxKeypad onKey={onKey} onRecord={record} recordDisabled={!canRecord || !currentTrip} />
      </div>

      <FeatureTabBar />
      {pickerOpen && onPickTrip && (
        <TripPicker
          trips={trips} currentId={currentTrip?.id ?? null}
          onPick={(id) => { onPickTrip(id); setPickerOpen(false) }}
          onNew={() => { setPickerOpen(false); onCreateTrip() }}
          onManage={() => { setPickerOpen(false); onManageTrips() }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

export default FxCalculator
