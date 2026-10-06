import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toLocalDateStr } from '../utils/expenseHelpers'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const pad = (n) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i))
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i))

const selectStyle = {
  border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px',
  fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4', flex: 1, minWidth: 0,
}
const chipStyle = (active) => ({
  flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13,
  background: active ? '#FF8C42' : '#fff3ec', color: active ? '#fff' : '#b08060', fontWeight: active ? 500 : 400,
})

const shiftDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toLocalDateStr(d)
}

// value / onChange 使用 YYYY-MM-DDTHH:mm（同 datetime-local），可選未來日期
const DateTimeField = ({ value, onChange }) => {
  const [datePart, timePart = '00:00'] = value.split('T')
  const [hh, mm] = timePart.split(':')
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const [y, m] = datePart.split('-').map(Number)
    return { y, m: m - 1 }
  })

  const setDate = (d) => onChange(`${d}T${timePart}`)
  const setTime = (h, m) => onChange(`${datePart}T${h}:${m}`)
  const moveMonth = (delta) => setView(({ y, m }) => {
    const d = new Date(y, m + delta, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const firstWeekday = new Date(view.y, view.m, 1).getDay()
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const today = toLocalDateStr(new Date())
  const quick = [['今天', shiftDays(0)], ['昨天', shiftDays(-1)], ['前天', shiftDays(-2)]]
  const isQuick = quick.some(([, d]) => d === datePart)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {quick.map(([label, d]) => (
          <button key={label} type="button" onClick={() => { setDate(d); setOpen(false) }} style={chipStyle(datePart === d)}>{label}</button>
        ))}
        <button type="button" onClick={() => setOpen(v => !v)} style={chipStyle(open || !isQuick)}>
          {isQuick ? '其他日期' : datePart.replaceAll('-', '/')}
        </button>
      </div>

      {open && (
        <div style={{ border: '0.5px solid #f0d5c0', borderRadius: 12, padding: 10, background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <button type="button" onClick={() => moveMonth(-1)} style={{ border: 'none', background: 'none', padding: 6, cursor: 'pointer' }}>
              <ChevronLeft size={18} color="#b08060" />
            </button>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f' }}>{view.y} 年 {view.m + 1} 月</div>
            <button type="button" onClick={() => moveMonth(1)} style={{ border: 'none', background: 'none', padding: 6, cursor: 'pointer' }}>
              <ChevronRight size={18} color="#b08060" />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
            {WEEKDAYS.map(w => <div key={w} style={{ fontSize: 11, color: '#c4a882', padding: '4px 0' }}>{w}</div>)}
            {cells.map((day, i) => {
              if (!day) return <div key={i} />
              const d = `${view.y}-${pad(view.m + 1)}-${pad(day)}`
              const selected = d === datePart
              return (
                <button
                  key={i} type="button"
                  onClick={() => { setDate(d); setOpen(false) }}
                  style={{
                    border: d === today && !selected ? '1px solid #FF8C42' : 'none', borderRadius: 8, padding: '8px 0', cursor: 'pointer', fontSize: 14,
                    background: selected ? '#FF8C42' : 'transparent', color: selected ? '#fff' : '#3d2b1f', fontWeight: selected ? 500 : 400,
                  }}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <select value={hh} onChange={e => setTime(e.target.value, mm)} style={selectStyle}>
          {HOURS.map(h => <option key={h} value={h}>{h} 時</option>)}
        </select>
        <span style={{ color: '#b08060' }}>:</span>
        <select value={mm} onChange={e => setTime(hh, e.target.value)} style={selectStyle}>
          {MINUTES.map(m => <option key={m} value={m}>{m} 分</option>)}
        </select>
      </div>
    </div>
  )
}

export default DateTimeField
