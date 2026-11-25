// 設定頁「連結分帳群組」：每一列左邊是群組下拉、右邊是開關。開啟後把連結之後「我的分攤」同步進快照帳戶；
// 關閉會刪除快照帳戶與還沒匯入的帳目。底下分隔線後是「匯入到帳戶」。
import { useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import useMyGroups from '../../hooks/useMyGroups'
import { useLedger } from './LedgerContext'
import { linkGroup, unlinkGroup } from './groupSync'
import { snapshotAccountId } from './paths'
import GroupImportDialog from './GroupImportDialog'

const selectStyle = { flex: 1, minWidth: 0, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '9px 10px', fontSize: 14, color: 'var(--cs-text)', background: 'var(--cs-bg)', outline: 'none' }

const Switch = ({ on, onChange, disabled, label }) => (
  <button
    role="switch" aria-checked={on} aria-label={label} onClick={onChange} disabled={disabled}
    style={{ width: 46, height: 26, borderRadius: 13, border: 'none', background: on ? 'var(--cs-rc-stamp)' : 'var(--cs-line-soft)', position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: disabled ? 0.5 : 1, transition: 'background 0.15s' }}
  >
    <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: 'var(--cs-card)', transition: 'left 0.15s' }} />
  </button>
)

const LedgerGroupLinks = () => {
  const { uid, ledger, accounts, links, sync, showToast } = useLedger()
  const { t } = useI18n()
  const { groups, groupsLoaded } = useMyGroups()
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)

  const linkedIds = new Set(links.map((l) => l.id))
  const available = groups.filter((g) => !linkedIds.has(g.id))
  const countOf = (groupId) => accounts.find((a) => a.id === snapshotAccountId(groupId))?.syncedCount ?? 0
  const unreadable = new Set(sync.unreadable.map((l) => l.id))

  // 同步 0 筆時說明原因：群組裡有帳目但都沒有「我的分攤」，或群組裡根本還沒有帳目
  const syncedText = (l) => {
    const n = countOf(l.id)
    const scanned = sync.scanned[l.id]
    if (n === 0 && scanned > 0) return t('ledger.link.noShare', { n: scanned })
    if (n === 0 && scanned === 0) return t('ledger.link.noEntries')
    return t('ledger.link.synced', { n })
  }

  const run = async (fn, errorKey = 'ledger.sync.failed') => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      console.error('Group link operation failed', e)
      showToast(t(errorKey))
    }
    setBusy(false)
  }

  const turnOn = () => {
    const group = available.find((g) => g.id === pick)
    if (!group) return showToast(t('ledger.link.pickFirst'))
    run(async () => {
      await linkGroup(uid, ledger, { id: group.id, name: group.name })
      sync.forget(group.id)
      setPick('')
      showToast(t('ledger.link.linked', { name: group.name }))
    })
  }

  const turnOff = (link) => {
    if (!window.confirm(t('ledger.link.unlinkConfirm', { name: link.groupName }))) return
    run(async () => {
      await unlinkGroup(uid, ledger.id, link.id)
      sync.forget(link.id)
      showToast(t('ledger.link.unlinked'))
    })
  }

  return (
    <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cs-text)' }}>{t('ledger.link.title')}</div>
      <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.6, margin: '4px 0 12px' }}>{t('ledger.link.desc')}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {links.map((l) => (
          <div key={l.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select value={l.id} disabled aria-label={t('ledger.link.group')} style={{ ...selectStyle, opacity: 0.8 }}>
                <option value={l.id}>{l.groupName}</option>
              </select>
              <Switch on label={t('ledger.link.switch', { name: l.groupName })} onChange={() => turnOff(l)} disabled={busy} />
            </div>
            <div style={{ fontSize: 11.5, marginTop: 4, color: unreadable.has(l.id) ? 'var(--cs-danger)' : 'var(--cs-text-sub)' }}>
              {unreadable.has(l.id) ? t('ledger.link.unreadable') : syncedText(l)}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t('ledger.link.group')} disabled={busy} style={selectStyle}>
            <option value="">{groupsLoaded && available.length === 0 ? t('ledger.link.noGroups') : t('ledger.link.choose')}</option>
            {available.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <Switch on={false} label={t('ledger.link.switchNew')} onChange={turnOn} disabled={busy} />
        </div>
      </div>

      <div style={{ borderTop: '0.5px solid var(--cs-border)', marginTop: 14, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <button onClick={sync.refresh} disabled={sync.syncing || links.length === 0} style={{ background: 'none', border: 'none', color: 'var(--cs-text-sub)', fontSize: 13, cursor: 'pointer', padding: 0, opacity: links.length === 0 ? 0.4 : 1 }}>
          {sync.syncing ? t('ledger.link.syncing') : t('ledger.link.refresh')}
        </button>
        <button onClick={() => setImporting(true)} disabled={links.length === 0} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text)', fontSize: 13.5, cursor: links.length === 0 ? 'not-allowed' : 'pointer', opacity: links.length === 0 ? 0.4 : 1 }}>
          {t('ledger.link.import')}
        </button>
      </div>
      {sync.ratePending && <div style={{ fontSize: 11.5, color: 'var(--cs-danger)', marginTop: 8 }}>{t('ledger.link.ratePending')}</div>}

      {importing && <GroupImportDialog onClose={() => setImporting(false)} />}
    </div>
  )
}

export default LedgerGroupLinks
