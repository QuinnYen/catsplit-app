import { useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, Clock } from 'lucide-react'
import { toLocalDateStr } from '../utils/expenseHelpers'
import { useI18n } from '../i18n/I18nProvider'

const WEEKDAY_KEYS = ['date.weekday.0', 'date.weekday.1', 'date.weekday.2', 'date.weekday.3', 'date.weekday.4', 'date.weekday.5', 'date.weekday.6']
const MONTH_KEYS = ['date.month.1', 'date.month.2', 'date.month.3', 'date.month.4', 'date.month.5', 'date.month.6', 'date.month.7', 'date.month.8', 'date.month.9', 'date.month.10', 'date.month.11', 'date.month.12']
const pad = (n) => String(n).padStart(2, '0')

const segmentStyle = (active) => ({
  flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: 'none', cursor: 'pointer',
  fontSize: 14, color: 'var(--cs-text)', background: active ? 'var(--cs-soft)' : 'transparent', textAlign: 'left',
})
const navBtnStyle = { border: 'none', background: 'none', padding: 6, cursor: 'pointer', display: 'flex' }
const titleBtnStyle = { border: 'none', background: 'none', padding: '4px 8px', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: 'var(--cs-text)', borderRadius: 6 }
const cellStyle = (selected, outlined) => ({
  border: outlined && !selected ? '1px solid var(--cs-rc-stamp)' : 'none', borderRadius: 6, padding: '8px 0', cursor: 'pointer', fontSize: 14,
  background: selected ? 'var(--cs-rc-stamp)' : 'transparent', color: selected ? '#fff' : 'var(--cs-text)', fontWeight: selected ? 500 : 400,
})

// 日曆：日 → 點標題進月份 → 再點標題進年份，選完逐層返回
const CalendarPopup = ({ datePart, onPick }) => {
  const { t } = useI18n()
  const [y0, m0] = datePart.split('-').map(Number)
  const [view, setView] = useState({ y: y0, m: m0 - 1 })
  const [level, setLevel] = useState('day')
  const [yearPageStart, setYearPageStart] = useState(y0 - 4)
  const today = toLocalDateStr(new Date())

  const moveMonth = (delta) => setView(({ y, m }) => {
    const d = new Date(y, m + delta, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  if (level === 'year') {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button type="button" onClick={() => setYearPageStart(s => s - 12)} style={navBtnStyle}><ChevronLeft size={18} color="var(--cs-text-sub)" /></button>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cs-text)' }}>{yearPageStart} – {yearPageStart + 11}</div>
          <button type="button" onClick={() => setYearPageStart(s => s + 12)} style={navBtnStyle}><ChevronRight size={18} color="var(--cs-text-sub)" /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {Array.from({ length: 12 }, (_, i) => yearPageStart + i).map(y => (
            <button key={y} type="button" onClick={() => { setView(v => ({ ...v, y })); setLevel('month') }} style={{ ...cellStyle(y === view.y, y === new Date().getFullYear()), padding: '12px 0' }}>{y}</button>
          ))}
        </div>
      </>
    )
  }

  if (level === 'month') {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button type="button" onClick={() => setView(v => ({ ...v, y: v.y - 1 }))} style={navBtnStyle}><ChevronLeft size={18} color="var(--cs-text-sub)" /></button>
          <button type="button" onClick={() => { setYearPageStart(view.y - 4); setLevel('year') }} style={titleBtnStyle}>{t('date.year', { y: view.y })}</button>
          <button type="button" onClick={() => setView(v => ({ ...v, y: v.y + 1 }))} style={navBtnStyle}><ChevronRight size={18} color="var(--cs-text-sub)" /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {Array.from({ length: 12 }, (_, m) => (
            <button key={m} type="button" onClick={() => { setView(v => ({ ...v, m })); setLevel('day') }} style={{ ...cellStyle(m === view.m, false), padding: '12px 0' }}>{t(MONTH_KEYS[m])}</button>
          ))}
        </div>
      </>
    )
  }

  const firstWeekday = new Date(view.y, view.m, 1).getDay()
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <button type="button" onClick={() => moveMonth(-1)} style={navBtnStyle}><ChevronLeft size={18} color="var(--cs-text-sub)" /></button>
        <button type="button" onClick={() => setLevel('month')} style={titleBtnStyle}>{t('date.monthTitle', { y: view.y, month: t(MONTH_KEYS[view.m]) })}</button>
        <button type="button" onClick={() => moveMonth(1)} style={navBtnStyle}><ChevronRight size={18} color="var(--cs-text-sub)" /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
        {WEEKDAY_KEYS.map(k => <div key={k} style={{ fontSize: 11, color: 'var(--cs-text-mute)', padding: '4px 0' }}>{t(k)}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const d = `${view.y}-${pad(view.m + 1)}-${pad(day)}`
          return <button key={i} type="button" onClick={() => onPick(d)} style={cellStyle(d === datePart, d === today)}>{day}</button>
        })}
      </div>
    </>
  )
}

const CLOCK_SIZE = 240
const CLOCK_R = 90
const CLOCK_R_INNER = 58

// 時鐘：先選小時（24 小時制，外圈 12、1–11，內圈 00、13–23），選完自動切到分鐘，放開手指即套用並關閉
const ClockPopup = ({ hour, minute, onChange, onDone }) => {
  const [mode, setMode] = useState('hour')
  const [dragging, setDragging] = useState(false)
  // 24 小時制：外圈 12、1–11，內圈 00、13–23
  const outer = hour >= 1 && hour <= 12

  const apply = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height / 2)
    const angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360
    if (mode === 'hour') {
      const idx = Math.round(angle / 30) % 12
      const isOuter = Math.hypot(dx, dy) > (CLOCK_R + CLOCK_R_INNER) / 2 * (rect.width / CLOCK_SIZE)
      onChange(isOuter ? idx || 12 : idx ? idx + 12 : 0, minute)
    } else {
      onChange(hour, Math.round(angle / 6) % 60)
    }
  }

  const handAngle = mode === 'hour' ? (hour % 12) * 30 : minute * 6
  const handR = mode === 'hour' && !outer ? CLOCK_R_INNER : CLOCK_R
  const rad = (handAngle * Math.PI) / 180
  const hx = CLOCK_SIZE / 2 + handR * Math.sin(rad)
  const hy = CLOCK_SIZE / 2 - handR * Math.cos(rad)
  const labels = mode === 'hour'
    ? [
        ...Array.from({ length: 12 }, (_, i) => ({ text: String(i || 12), value: i || 12, r: CLOCK_R, i })),
        ...Array.from({ length: 12 }, (_, i) => ({ text: pad(i ? i + 12 : 0), value: i ? i + 12 : 0, r: CLOCK_R_INNER, i })),
      ]
    : Array.from({ length: 12 }, (_, i) => ({ text: pad(i * 5), value: i * 5, r: CLOCK_R, i }))

  const bigBtn = (active) => ({ border: 'none', background: active ? 'var(--cs-soft)' : 'transparent', borderRadius: 6, padding: '4px 10px', fontSize: 32, fontWeight: 500, cursor: 'pointer', color: active ? 'var(--cs-rc-owe)' : 'var(--cs-text)' })

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10 }}>
        <button type="button" onClick={() => setMode('hour')} style={bigBtn(mode === 'hour')}>{pad(hour)}</button>
        <span style={{ fontSize: 32, color: 'var(--cs-text-sub)' }}>:</span>
        <button type="button" onClick={() => setMode('minute')} style={bigBtn(mode === 'minute')}>{pad(minute)}</button>
      </div>
      <svg
        width={CLOCK_SIZE} height={CLOCK_SIZE} viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`}
        style={{ display: 'block', margin: '0 auto', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); apply(e) }}
        onPointerMove={e => { if (dragging) apply(e) }}
        onPointerUp={() => {
          setDragging(false)
          if (mode === 'hour') setMode('minute')
          else onDone()
        }}
      >
        <circle cx={CLOCK_SIZE / 2} cy={CLOCK_SIZE / 2} r={CLOCK_SIZE / 2 - 4} fill="var(--cs-soft)" />
        <line x1={CLOCK_SIZE / 2} y1={CLOCK_SIZE / 2} x2={hx} y2={hy} stroke="var(--cs-rc-stamp)" strokeWidth={2} />
        <circle cx={CLOCK_SIZE / 2} cy={CLOCK_SIZE / 2} r={3} fill="var(--cs-rc-stamp)" />
        <circle cx={hx} cy={hy} r={18} fill="var(--cs-rc-stamp)" />
        {labels.map(({ text, value, r, i }, k) => {
          const a = (i * 30 * Math.PI) / 180
          const x = CLOCK_SIZE / 2 + r * Math.sin(a)
          const y = CLOCK_SIZE / 2 - r * Math.cos(a)
          const selected = mode === 'hour' ? value === hour : value === minute
          return (
            <text key={k} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={r === CLOCK_R_INNER ? 13 : 15} fill={selected ? 'var(--cs-on-brand)' : 'var(--cs-text)'} pointerEvents="none">
              {text}
            </text>
          )
        })}
        {mode === 'minute' && minute % 5 !== 0 && <circle cx={hx} cy={hy} r={3} fill="var(--cs-on-brand)" />}
      </svg>
    </>
  )
}

// value / onChange 使用 YYYY-MM-DDTHH:mm（同 datetime-local），可選未來日期
const DateTimeField = ({ value, onChange }) => {
  const [datePart, timePart] = value.split('T')
  const [hh, mm] = timePart.split(':').map(Number)
  const [popup, setPopup] = useState(null) // 'date' | 'time' | null
  const close = () => setPopup(null)

  return (
    <div>
      <div style={{ display: 'flex', border: '0.5px solid var(--cs-border)', borderRadius: 6, background: 'var(--cs-bg)', overflow: 'hidden' }}>
        <button type="button" onClick={() => setPopup('date')} style={segmentStyle(popup === 'date')}>
          <CalendarDays size={16} color="var(--cs-rc-stamp)" />{datePart.replaceAll('-', '/')}
        </button>
        <div style={{ width: 0.5, background: 'var(--cs-border)' }} />
        <button type="button" onClick={() => setPopup('time')} style={segmentStyle(popup === 'time')}>
          <Clock size={16} color="var(--cs-rc-stamp)" />{pad(hh)}:{pad(mm)}
        </button>
      </div>

      {popup && (
        <div
          onClick={close}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--cs-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cs-card)', borderRadius: 6, padding: 14, width: '100%', maxWidth: 320 }}>
            {popup === 'date' ? (
              <CalendarPopup datePart={datePart} onPick={d => { onChange(`${d}T${timePart}`); close() }} />
            ) : (
              <ClockPopup hour={hh} minute={mm} onChange={(h, m) => onChange(`${datePart}T${pad(h)}:${pad(m)}`)} onDone={close} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default DateTimeField
