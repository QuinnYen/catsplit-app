// 匯率計算機（截圖 1、4）：多列換算、實付（免稅、刷卡、服務費、外加稅、小費與自訂捷徑）、數字鍵盤、收據鍵記帳。
// 這個元件只管計算與畫面，不碰 Firestore 或帳本：旅程、換算列的存取與「記帳」由外層（FxCalculatorPage）以 props 傳入。
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import CurrencySelect from '../../components/CurrencySelect'
import UserHeader from '../../components/UserHeader'
import { PINNED_CURRENCIES, getCurrency } from '../../config/currencies'
import { pressKey, evaluateExpression, commitExpression, hasOperator } from '../ledger/expression'
import { todayStr } from '../ledger/dates'
import { DEFAULT_FX_SETTINGS, adjustRates, convertRows, computePay, pairRate, usesCustom, formatFixed, formatExpr, roundTo, recordAmount } from './fxMath'
import { shortcutList, payParams, activeSet } from './shortcuts'
import { useFxRates } from './hooks'
import FxKeypad from './FxKeypad'
import FxTabBar, { FX_TABBAR_HEIGHT } from './FxTabBar'
import FxHomeButton from './FxHomeButton'

// 計算機只有換算與鍵盤，不需要全站內容的寬度（720）：寬螢幕上限寬置中（頂部藍色條與底部列是全站共用的，不動）
const CALC_MAX_WIDTH = 420

// 這個匯率用的是使用者的自訂匯率（不是網路匯率）
const customBadge = { fontSize: 10, fontWeight: 600, color: 'var(--cs-rc-stamp)', border: '1px solid var(--cs-rc-stamp)', borderRadius: 999, padding: '1px 6px', marginRight: 6, verticalAlign: 'middle', whiteSpace: 'nowrap' }
const chip = (on) => ({
  border: `1px solid ${on ? 'var(--cs-rc-stamp)' : 'var(--cs-border)'}`, borderRadius: 999, padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  background: on ? 'var(--cs-soft)' : 'var(--cs-card)', color: on ? 'var(--cs-rc-stamp)' : 'var(--cs-text-sub)', WebkitTapHighlightColor: 'transparent',
})

/**
 * @param base         帳本統計幣別（訪客是 TWD）
 * @param settings     計算機設定（fxMath 的 DEFAULT_FX_SETTINGS；第五階段改讀雲端）
 * @param currentTrip  目前選的旅程或 null
 * @param rows         換算列的幣別（1–6 個，帳號全域）
 * @param onRowsChange(rows)  換算列改了（外層決定存哪）
 * @param onManageTrips()  開「管理旅程」頁（頂部的旅程連結；訪客沒有旅程，沒給就不顯示連結）
 * @param onOpenDetail()、onOpenCurrencies()、onOpenSettings()  底部列的明細（目前旅程的明細）、幣別、設定（訪客沒有明細與設定，沒給就不顯示）
 * @param canRecord    能不能記帳（已登入非訪客）；onRecord(preset) 開記帳面板，preset 見 LedgerEntrySheet 的 initialDraft
 */
const FxCalculator = ({ base, settings = DEFAULT_FX_SETTINGS, currentTrip, rows, onRowsChange, onManageTrips, onOpenDetail, onOpenCurrencies, onOpenSettings, canRecord, onRecord }) => {
  const { t } = useI18n()
  const [active, setActive] = useState(0)
  // 預設金額（設定裡填 0 或留空就不預填）；開啟與按 C 都回到它
  const defaultExpr = settings.defaultAmount > 0 ? String(settings.defaultAmount) : ''
  const [expr, setExpr] = useState(defaultExpr)
  // 算式還是帶入的值（預設金額或切換列帶入的換算值）：第一個按的數字鍵是取代它，不是接在後面
  const [fresh, setFresh] = useState(defaultExpr !== '')
  const [on, setOn] = useState(() => new Set()) // 開啟的捷徑 id（見 shortcuts.js）
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
  const { rates, loading, error, retry } = useFxRates([...rows, base])
  // 自訂匯率（每種幣別對基準幣）先套進匯率表，之後任兩種幣別的換算都用這一份，結果一致
  const effRates = useMemo(() => adjustRates(rates, customRates, base), [rates, customRates, base])
  // 換算結果（不含捷徑）：切換列時帶入輸入框的是這個，才不會把捷徑重複計算
  const plainValues = useMemo(() => convertRows({ value, from: activeCode, codes: rows, rates: effRates }), [value, activeCode, rows, effRates])
  // 實付：實付幣別就是選中那一列的幣別，捷徑直接算在它上面
  const list = useMemo(() => shortcutList(settings), [settings])
  const pay = useMemo(
    () => computePay({ amount: value, from: activeCode, pay: activeCode, rates: effRates, ...payParams(list, on) }),
    [value, activeCode, effRates, list, on],
  )
  const act = useMemo(() => activeSet(list, on), [list, on]) // 開著而且顯示中的捷徑
  const showPay = act.size > 0 && !!pay
  // 有開捷徑時，其他列顯示「實付金額」換算出來的數字（台幣列就是真正要付的台幣）
  const rowValues = useMemo(
    () => (showPay ? convertRows({ value: pay.total, from: activeCode, codes: rows, rates: effRates }) : plainValues),
    [showPay, pay, activeCode, rows, effRates, plainValues],
  )
  const sym = (code) => (settings.showSymbol ? getCurrency(code).symbol : '')
  const cell = (v) => (loading && v == null ? '…' : formatFixed(v, decimals))

  const onKey = (k) => {
    const start = fresh ? '' : expr // 帶入的值還沒動過：數字與小數點從空白開始（取代它），運算符號與刪除照常接在後面
    const restart = fresh && /^(\d|00|\.)$/.test(k)
    setFresh(false)
    if (k === 'C') {
      setExpr(defaultExpr)
      setFresh(defaultExpr !== '')
      return
    }
    if (k === '=') return hasOperator(expr) ? setExpr(commitExpression(expr, 2)) : undefined
    if (k === '00') return setExpr(pressKey(pressKey(restart ? start : expr, '0'), '0'))
    setExpr(pressKey(restart ? start : expr, k))
  }

  // 點別列＝改成從那一列輸入；金額帶那一列目前換算出來的數字
  const activate = (i) => {
    if (i === activeIdx) return
    const v = plainValues[rows[i]]
    setActive(i)
    setExpr(v != null && v > 0 ? String(roundTo(v, decimals)) : '')
    setFresh(v != null && v > 0)
  }

  // 實體鍵盤：數字、小數點、+ - * /、Enter 或 = 計算、Backspace 刪一格、Esc 或 Delete 清除。
  // 焦點在輸入框，或有面板、選單開著時不攔截
  const keyRef = useRef(null)
  useEffect(() => { keyRef.current = onKey })
  useEffect(() => {
    const MAP = { '+': '+', '-': '−', '*': '×', x: '×', X: '×', '/': '÷', '=': '=', Enter: '=', Backspace: '⌫', Delete: 'C', Escape: 'C', '.': '.' }
    const handle = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      const k = /^[0-9]$/.test(e.key) ? e.key : MAP[e.key]
      if (!k) return
      e.preventDefault()
      keyRef.current(k)
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])

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
      return onManageTrips?.()
    }
    const amount = pay && pay.total > 0 ? recordAmount(pay.total, activeCode) : 0
    if (!(amount > 0)) return showHint(t('fx.calc.needAmount'))
    const baseRate = pairRate(effRates, activeCode, base)
    onRecord({
      tripId: currentTrip.id, currency: activeCode, expr: String(amount), sourceType: 'fx', date: todayStr(),
      ...(baseRate && { baseRate }),
      onSaved: () => { setExpr(defaultExpr); setFresh(defaultExpr !== '') }, // 記完回到預設金額，保留旅程與換算列
    })
  }

  // 底部列「明細」：進目前旅程的明細；還沒選旅程就提示
  const openDetail = () => (currentTrip ? onOpenDetail() : showHint(t('fx.calc.needTripDetail')))

  const pct = (n) => parseFloat(n.toFixed(2))
  const labelOf = (x) => (x.labelKey ? t(x.labelKey, { pct: pct(x.percent) }) : t('fx.calc.customShortcut', { name: x.name, sign: x.sign > 0 ? '+' : '−', pct: pct(x.percent) }))
  // 明細裡只寫名稱（百分比在設定頁看）：內建的用名稱文案，自訂的用自己取的名字
  const nameOf = (x) => (x.labelKey ? t(`fx.calc.short.${x.id}`) : x.name)
  const toggle = (id) => setOn((prev) => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next })
  // 選中列下方的明細：免稅扣掉多少、各項加收多少、刷卡手續費（正負號與金額分開顯示）
  const byId = Object.fromEntries(list.map((x) => [x.id, x]))
  const payLines = !showPay ? [] : [
    act.has('taxFree') && { key: 'taxFree', label: nameOf(byId.taxFree), sign: -1, amount: pay.taxDeduct },
    ...pay.lines.map((l) => ({ key: l.key, label: nameOf(byId[l.key]), sign: l.amount < 0 ? -1 : 1, amount: Math.abs(l.amount) })),
    act.has('card') && { key: 'card', label: nameOf(byId.card), sign: 1, amount: pay.fee },
  ].filter(Boolean)

  return (
    <div style={{ height: '100dvh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: 'var(--cs-bg)', paddingBottom: `calc(${FX_TABBAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))` }}>
      {/* 頂部藍色條是全站共用的 UserHeader（頭像、招呼語、帳號選單）；下方是目前旅程的連結文字，點了進「管理旅程」 */}
      <UserHeader right={<FxHomeButton />}>
        {onManageTrips && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <button
              onClick={onManageTrips} aria-label={t('fx.calc.pickTrip')}
              style={{ display: 'flex', alignItems: 'center', gap: 2, maxWidth: '100%', background: 'none', border: 'none', padding: '4px 2px', color: 'var(--cs-rc-head-text)', fontSize: 20, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTrip?.name ?? t('fx.calc.pickTrip')}</span>
              <ChevronRight size={20} style={{ flexShrink: 0 }} />
            </button>
          </div>
        )}
      </UserHeader>

      {/* 匯率區：撐滿剩下的高度，實付資訊貼在鍵盤上方 */}
      <div className="cs-body" style={{ maxWidth: CALC_MAX_WIDTH, flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '4px 16px 4px', boxSizing: 'border-box' }}>
        {/* 換算列：點金額從那一列輸入，點幣別代碼換幣別 */}
        <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column' }}>
          {rows.map((code, i) => {
            const isOn = i === activeIdx
            const withPay = isOn && showPay
            const shown = isOn ? formatExpr(expr || '0') : cell(rowValues[code])
            const preview = isOn && hasOperator(expr) && value != null ? `= ${formatFixed(value, decimals)}` : ''
            return (
              <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--cs-border)', padding: withPay ? '6px 8px' : '0 8px', margin: '0 -8px', borderRadius: 8, background: isOn ? 'color-mix(in srgb, var(--cs-rc-stamp) 14%, transparent)' : 'transparent', flex: withPay ? '0 0 auto' : '1 1 0', minHeight: 'clamp(40px, 6vh, 58px)', maxHeight: withPay ? 'none' : 92 }}>
                {/* 選擇鈕本身是撐滿寬度的，要包一層固定寬度，金額才有位置 */}
                <div style={{ width: 96, flexShrink: 0 }}>
                  <CurrencySelect value={code} onChange={(c) => changeRow(i, c)} compact pinned={PINNED_CURRENCIES} ariaLabel={t('fx.calc.rowCurrency', { n: i + 1 })} style={{ fontWeight: 700, fontSize: 16, padding: '6px 10px' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button onClick={() => activate(i)} aria-pressed={isOn} aria-label={`${code} ${shown}`} style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right', padding: '2px 0', lineHeight: 1.2, color: isOn ? 'var(--cs-text)' : 'var(--cs-text-sub)', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontSize: shown.length > 11 ? 20 : 28, fontWeight: 700, wordBreak: 'break-all' }}>{shown}</span>
                    {isOn && <span aria-hidden="true" style={{ display: 'inline-block', width: 2, height: 28, marginLeft: 3, background: 'var(--cs-rc-stamp)', verticalAlign: 'middle' }} />}
                    {!isOn && usesCustom(customRates, base, activeCode, code) && <span style={{ ...customBadge, marginLeft: 8 }}>{t('fx.calc.custom')}</span>}
                    <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 6, color: 'var(--cs-text-sub)' }}>{sym(code)}</span>
                    {preview && <span style={{ display: 'block', fontSize: 12, color: 'var(--cs-text-sub)' }}>{preview}</span>}
                  </button>
                  {/* 選中列的實付：捷徑開著時，明細與實付金額就在這一列裡 */}
                  {withPay && (
                    <div>
                      <div style={{ textAlign: 'right', fontSize: 11.5, lineHeight: 1.6, color: 'var(--cs-text-sub)' }}>
                        {payLines.map((l) => <span key={l.key} style={{ display: 'inline-block', marginLeft: 8, whiteSpace: 'nowrap' }}>{l.label} {l.sign > 0 ? '+' : '−'}{sym(code)}{formatFixed(l.amount, decimals)}</span>)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--cs-text-sub)' }}>{t('fx.calc.pay')}</span>
                        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--cs-rc-stamp)', fontVariantNumeric: 'tabular-nums' }}>{sym(code)}{formatFixed(pay.total, decimals)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {error
          ? <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)', padding: '8px 0' }}>{t('fx.calc.rateError')} <button onClick={retry} style={{ background: 'none', border: 'none', color: 'var(--cs-rc-stamp)', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>{t('fx.calc.retry')}</button></div>
          : <div style={{ fontSize: 11, color: hint ? 'var(--cs-rc-stamp)' : 'var(--cs-text-mute)', fontWeight: hint ? 600 : 400, padding: '2px 0' }}>{hint || t('fx.calc.rateNote')}</div>}
      </div>

      {/* 鍵盤面板：和匯率區分開，貼齊底部導覽列 */}
      <div style={{ width: '100%', maxWidth: CALC_MAX_WIDTH, margin: '0 auto', boxSizing: 'border-box', background: 'var(--cs-soft)', borderTop: '1px solid var(--cs-border)', borderRadius: '16px 16px 0 0', padding: '8px 12px 10px', flexShrink: 0 }}>
        {/* 捷徑：一行可左右滑動；實付就是目前選中那一列的幣別，捷徑直接算在它上面 */}
        <div role="group" aria-label={t('fx.calc.shortcuts')} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {list.filter((x) => x.visible).map((x) => <button key={x.id} onClick={() => toggle(x.id)} aria-pressed={on.has(x.id)} style={chip(on.has(x.id))}>{labelOf(x)}</button>)}
        </div>

        <FxKeypad onKey={onKey} onRecord={record} recordDisabled={!canRecord || !currentTrip} />
      </div>

      <FxTabBar onDetail={onOpenDetail && openDetail} onCurrencies={onOpenCurrencies} onSettings={onOpenSettings} />
    </div>
  )
}

export default FxCalculator
