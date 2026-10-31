// 可摺疊的卡片（預設收合）。有內容時標題旁顯示橘點，收合時也看得出來。
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const CollapsibleCard = ({ label, hasContent, children }) => {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: '#b08060' }}>{label}</span>
        {hasContent && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF8C42' }} />}
        <ChevronDown size={16} color="#b08060" style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  )
}

export default CollapsibleCard
