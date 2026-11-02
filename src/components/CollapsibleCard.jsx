// 可摺疊的卡片（預設收合）。有內容時標題旁顯示橘點，收合時也看得出來。
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const CollapsibleCard = ({ label, hasContent, children }) => {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)' }}>{label}</span>
        {hasContent && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cs-rc-stamp)' }} />}
        <ChevronDown size={16} color="var(--cs-text-sub)" style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  )
}

export default CollapsibleCard
