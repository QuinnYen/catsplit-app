import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { GROUP_ICONS, GROUP_COLORS, DEFAULT_GROUP_ICON, DEFAULT_GROUP_COLOR } from '../config/groupIcons'
import { useI18n } from '../i18n/I18nProvider'

const labelStyle = { fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 6 }

const GroupIconPicker = ({ icon, color, onChange, disabled = false }) => {
  const { t } = useI18n()
  const [open, setOpen] = useState(null) // 'color' | 'icon' | null
  const currentIcon = icon || DEFAULT_GROUP_ICON
  const currentColor = color || DEFAULT_GROUP_COLOR
  const palette = GROUP_COLORS[currentColor] || GROUP_COLORS[DEFAULT_GROUP_COLOR]
  const CurrentIcon = GROUP_ICONS[currentIcon]

  const toggle = (name) => setOpen(v => (v === name ? null : name))

  const trigger = (name, children) => (
    <button
      onClick={() => toggle(name)}
      disabled={disabled}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10,
        cursor: disabled ? 'not-allowed' : 'pointer', border: open === name ? '1px solid #FF8C42' : '0.5px solid #f0d5c0', background: '#fff8f4',
      }}
    >
      {children}
      <ChevronDown size={16} color="#FF8C42" style={{ transform: open === name ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
    </button>
  )

  return (
    <div style={{ position: 'relative', opacity: disabled ? 0.6 : 1 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={labelStyle}>{t('picker.color')}</div>
          {trigger('color', <span style={{ width: 24, height: 24, borderRadius: '50%', background: palette.fg }} />)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={labelStyle}>{t('picker.icon')}</div>
          {trigger('icon', <CurrentIcon size={24} color={palette.fg} strokeWidth={2} />)}
        </div>
      </div>

      {open && (
        <>
          <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 11, padding: 10,
            display: 'flex', flexWrap: 'wrap', gap: 8,
            background: '#fff', borderRadius: 12, border: '0.5px solid #f0d5c0', boxShadow: '0 4px 16px rgba(255,140,66,0.18)',
          }}>
            {open === 'color' && Object.entries(GROUP_COLORS).map(([key, c]) => (
              <button
                key={key}
                onClick={() => { onChange({ iconColor: key }); setOpen(null) }}
                aria-label={key}
                style={{
                  width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', padding: 0,
                  background: c.fg, border: '2px solid #fff',
                  boxShadow: currentColor === key ? `0 0 0 2px ${c.fg}` : 'none',
                }}
              />
            ))}
            {open === 'icon' && Object.entries(GROUP_ICONS).map(([key, Icon]) => {
              const active = currentIcon === key
              return (
                <button
                  key={key}
                  onClick={() => { onChange({ icon: key }); setOpen(null) }}
                  aria-label={key}
                  style={{
                    width: 42, height: 42, borderRadius: 12, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: active ? `1.5px solid ${palette.fg}` : '0.5px solid #f0d5c0',
                    background: active ? palette.bg : '#fff8f4',
                  }}
                >
                  <Icon size={20} color={active ? palette.fg : '#b08060'} strokeWidth={2} />
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default GroupIconPicker
