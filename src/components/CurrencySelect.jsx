// 選貨幣：點開後底部彈出可搜尋的清單（代碼、名稱、符號都能搜），常用的（呼叫端指定 + 最近選過的）排在最前面。
// compact 只顯示代碼，給金額欄旁邊這類窄位置用；noneLabel 有值時多一個「不選」選項（value 為空字串）。
import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { CURRENCIES, getCurrency, currencyName } from '../config/currencies'

const RECENT_KEY = 'cs-recent-currencies'
const RECENT_MAX = 4

const readRecent = () => {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY))
    return Array.isArray(list) ? list.filter(c => CURRENCIES.some(x => x.code === c)) : []
  } catch {
    return []
  }
}
const writeRecent = (code) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([code, ...readRecent().filter(c => c !== code)].slice(0, RECENT_MAX)))
  } catch { /* 存不了就不記，不影響選擇 */ }
}

const FIELD_STYLE = {
  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'left',
  border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14,
  color: 'var(--cs-text)', background: 'var(--cs-bg)', cursor: 'pointer', outline: 'none',
}

// triggerLabel：有值時觸發鈕顯示這段文字（不顯示目前幣別與箭頭），當成「新增幣別」之類的純挑選入口；value 傳空字串
const CurrencySelect = ({ value, onChange, exclude = [], pinned = [], noneLabel, triggerLabel, compact = false, disabled = false, style, ariaLabel }) => {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  // 選單開著時鎖住背景捲動，關閉後還原
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const available = useMemo(() => CURRENCIES.filter(c => !exclude.includes(c.code)), [exclude])
  const q = query.trim().toLowerCase()
  const matches = (c) => !q
    || c.code.toLowerCase().includes(q)
    || c.symbol.toLowerCase().includes(q)
    || currencyName(c.code, 'zh-TW').toLowerCase().includes(q)
    || currencyName(c.code, 'en').toLowerCase().includes(q)

  const shown = available.filter(matches)
  const favoriteCodes = [...new Set([...pinned, ...(open ? readRecent() : [])])]
  const favorites = q ? [] : favoriteCodes.map(code => shown.find(c => c.code === code)).filter(Boolean)
  const others = q ? shown : shown.filter(c => !favorites.includes(c))

  const pick = (code) => {
    if (code) writeRecent(code)
    onChange(code)
    setOpen(false)
    setQuery('')
  }
  const close = () => { setOpen(false); setQuery('') }

  const current = value ? getCurrency(value) : null
  const triggerText = triggerLabel ?? (!current ? (noneLabel ?? '') : compact ? current.code : `${current.symbol} ${currencyName(current.code, lang)} (${current.code})`)

  const row = (key, label, selected, onPick) => (
    <button
      key={key}
      type="button"
      onClick={onPick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px', border: 'none', borderBottom: '0.5px solid var(--cs-track)', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'var(--cs-text)', fontSize: 14 }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {selected && <Check size={16} color="var(--cs-rc-stamp)" />}
    </button>
  )
  const currencyRow = (c) => row(c.code, (
    <>
      <span style={{ display: 'inline-block', minWidth: 44, color: 'var(--cs-text-sub)' }}>{c.symbol}</span>
      {currencyName(c.code, lang)} <span style={{ color: 'var(--cs-text-mute)', fontSize: 12 }}>{c.code}</span>
    </>
  ), c.code === value, () => pick(c.code))
  const sectionTitle = (text) => <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', padding: '14px 4px 2px' }}>{text}</div>

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
        style={{ ...FIELD_STYLE, ...(disabled && { opacity: 0.6, cursor: 'not-allowed' }), ...style }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{triggerText}</span>
        {!triggerLabel && <ChevronDown size={16} style={{ flexShrink: 0, opacity: 0.7 }} />}
      </button>

      {open && (
        <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.35)', touchAction: 'none' }} />
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 71, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            background: 'var(--cs-card)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 720, margin: '0 auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 8px' }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--cs-text)' }}>{t('cur.title')}</div>
              <button type="button" onClick={close} aria-label={t('common.cancel')} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--cs-text-sub)', display: 'flex' }}>
                <X size={22} />
              </button>
            </div>
            <div style={{ padding: '0 18px 8px', position: 'relative' }}>
              <Search size={16} color="var(--cs-text-mute)" style={{ position: 'absolute', left: 30, top: 12 }} />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('cur.search')}
                style={{ width: '100%', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px 10px 34px', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-bg)' }}
              />
            </div>
            <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 18px 24px' }}>
              {noneLabel && !q && row('none', noneLabel, !value, () => pick(''))}
              {favorites.length > 0 && <>{sectionTitle(t('cur.recent'))}{favorites.map(currencyRow)}</>}
              {others.length > 0 && <>{favorites.length > 0 && sectionTitle(t('cur.all'))}{others.map(currencyRow)}</>}
              {shown.length === 0 && <div style={{ textAlign: 'center', padding: '28px 0', fontSize: 13, color: 'var(--cs-text-mute)' }}>{t('cur.none')}</div>}
            </div>
          </div>
        </>
      )}
    </>
  )
}

export default CurrencySelect
