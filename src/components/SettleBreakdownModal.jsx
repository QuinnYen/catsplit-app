// 轉帳建議的計算說明彈窗：列出這筆轉帳兩個人的算式（付了、應付、已結清轉帳、收入／退款、贊助 ＝ 合計淨額）。
// rows：[{ uid, name, avatar, paid, owes, settled, income, sponsor, net }]，金額皆為群組基準幣別，fmt 負責換算與格式化。
import { X } from 'lucide-react'
import Avatar from './Avatar'
import { useI18n } from '../i18n/I18nProvider'

const BreakdownModal = ({ rows, amount, fmt, onClose }) => {
  const { t } = useI18n()
  const signed = (v) => (Math.abs(v) < 0.01 ? fmt(0) : `${v > 0 ? '+' : '-'}${fmt(Math.abs(v))}`)
  const color = (v) => (v > 0.01 ? 'var(--cs-rc-get)' : v < -0.01 ? 'var(--cs-rc-owe)' : 'var(--cs-text-sub)')

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--cs-overlay)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, background: 'var(--cs-card)', borderRadius: '20px 20px 0 0', padding: 20, paddingBottom: 28, maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cs-text)' }}>{t('settle.breakdownTitle')}</div>
          <button onClick={onClose} aria-label={t('settle.breakdownClose')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <X size={20} color="var(--cs-text-sub)" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {rows.map(r => (
            <div key={r.uid} style={{ background: 'var(--cs-soft)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Avatar src={r.avatar} name={r.name} size={28} />
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cs-text)' }}>{r.name}</div>
              </div>
              {[
                [t('settle.linePaid'), r.paid, true],
                [t('settle.lineOwes'), -r.owes, true],
                [t('settle.lineSettled'), r.settled],
                [t('settle.lineIncome'), r.income],
                [t('settle.sponsorLine'), r.sponsor],
              ].filter(([, v, always]) => always || Math.abs(v) > 0.01).map(([label, v]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--cs-text-sub)', marginBottom: 4 }}>
                  <span>{label}</span>
                  <span style={{ color: color(v), fontVariantNumeric: 'tabular-nums' }}>{signed(v)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 500, color: 'var(--cs-text)', borderTop: '0.5px solid var(--cs-border)', paddingTop: 6, marginTop: 2 }}>
                <span>{t('settle.netTotal')}</span>
                <span style={{ color: color(r.net), fontVariantNumeric: 'tabular-nums' }}>{signed(r.net)}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: 'var(--cs-text-sub)', lineHeight: 1.6 }}>
          {t('settle.breakdownNote', { amount: fmt(amount) })}
        </div>
      </div>
    </div>
  )
}

export default BreakdownModal
