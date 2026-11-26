// 匯入到帳戶：把某個群組的快照帳目覆寫匯入一個一般帳戶（旅程結束時用，免得分帳資料不見）。
// 帳目變成一般帳目（不再同步、可編輯、計入餘額）；跨幣別時顯示匯率讓使用者確認。
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { fetchExchangeRate, formatRate } from '../../config/currencies'
import { useLedger } from './LedgerContext'
import { loadSnapshotRows, importGroupRows, unlinkGroup } from './groupSync'
import { planImport } from './importPlan'
import BackClose from '../../components/BackClose'

const inputStyle = { display: 'block', width: '100%', marginTop: 6, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', background: 'var(--cs-card)', outline: 'none', boxSizing: 'border-box' }
const labelStyle = { fontSize: 12, color: 'var(--cs-text-sub)' }

const GroupImportDialog = ({ onClose }) => {
  const { uid, ledger, accounts, links, sync, showToast } = useLedger()
  const { t, fmt } = useI18n()
  const targets = accounts.filter((a) => a.kind !== 'group' && !a.archived)
  const [groupId, setGroupId] = useState(links[0]?.id ?? '')
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '')
  const [rows, setRows] = useState(null)
  const [rateText, setRateText] = useState({}) // { [幣別]: 輸入的匯率文字 }
  const [rateFailed, setRateFailed] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const target = targets.find((a) => a.id === targetId)

  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    loadSnapshotRows(uid, ledger.id, groupId)
      .then((r) => { if (!cancelled) setRows(r) })
      .catch((e) => { console.error('Failed to load snapshot rows', e); if (!cancelled) { setRows([]); setError(t('ledger.import.failed')) } })
    return () => { cancelled = true }
  }, [uid, ledger.id, groupId, t])

  // 需要匯率的幣別：帳目幣別與目標帳戶幣別不同者；自動抓一次，抓不到要手動輸入
  const foreign = rows && target ? [...new Set(rows.filter((r) => r.currency !== target.currency).map((r) => r.currency))] : []
  const foreignKey = foreign.join(',')
  const targetCurrency = target?.currency
  useEffect(() => {
    if (!targetCurrency) return
    let cancelled = false
    for (const cur of foreignKey ? foreignKey.split(',') : []) {
      const key = `${cur}>${targetCurrency}`
      fetchExchangeRate(cur, targetCurrency)
        .then((rate) => { if (!cancelled) setRateText((p) => (p[key] ? p : { ...p, [key]: String(formatRate(rate)) })) })
        .catch(() => { if (!cancelled) setRateFailed((p) => ({ ...p, [key]: true })) })
    }
    return () => { cancelled = true }
  }, [foreignKey, targetCurrency])

  const rates = {}
  for (const cur of foreign) {
    const v = Number(rateText[`${cur}>${target.currency}`])
    if (v > 0) rates[cur] = v
  }
  const plan = rows && target ? planImport({ rows, target, rates }) : null
  const importable = plan ? plan.updates.length : 0
  const canImport = !!plan && plan.missingRates.length === 0 && importable > 0 && !busy

  const run = async () => {
    if (!canImport) return
    setBusy(true)
    setError('')
    try {
      const n = await importGroupRows({ uid, ledgerId: ledger.id, groupId, rows, target, rates })
      showToast(t('ledger.import.done', { n }))
      if (window.confirm(t('ledger.import.stopSync'))) {
        await unlinkGroup(uid, ledger.id, groupId)
        sync.forget(groupId)
      }
      onClose()
    } catch (e) {
      console.error('Failed to import group rows', e)
      setError(t('ledger.import.failed'))
      setBusy(false)
    }
  }

  return (
    <>
      <BackClose onClose={onClose} />
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--cs-overlay)' }} />
      <div
        role="dialog" aria-modal="true" aria-label={t('ledger.import.title')}
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, margin: '0 auto', maxWidth: 480, zIndex: 201, maxHeight: '92vh', overflowY: 'auto', background: 'var(--cs-bg)', borderRadius: '16px 16px 0 0', padding: '14px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--cs-text)' }}>{t('ledger.import.title')}</div>
          <button onClick={onClose} aria-label={t('ledger.entry.close')} style={{ background: 'none', border: 'none', color: 'var(--cs-text-sub)', cursor: 'pointer', padding: 4, display: 'flex' }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--cs-text-sub)', lineHeight: 1.6 }}>{t('ledger.import.desc')}</div>

        <label style={labelStyle}>
          {t('ledger.import.group')}
          <select value={groupId} onChange={(e) => { setRows(null); setGroupId(e.target.value) }} style={inputStyle}>
            {links.map((l) => <option key={l.id} value={l.id}>{l.groupName}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          {t('ledger.import.target')}
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)} style={inputStyle}>
            {targets.map((a) => <option key={a.id} value={a.id}>{`${a.name} (${a.currency})`}</option>)}
          </select>
        </label>

        {rows === null && <div style={{ fontSize: 13, color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div>}
        {plan && (
          <div style={{ background: 'var(--cs-card)', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 14px', fontSize: 13.5, lineHeight: 1.8, color: 'var(--cs-text)' }}>
            <div>{t('ledger.import.count', { n: rows.length })}</div>
            {importable > 0 && <div>{t('ledger.import.effect', { amount: fmt.money(plan.balanceDelta, target.currency), account: target.name })}</div>}
            {rows.length === 0 && <div style={{ color: 'var(--cs-text-mute)' }}>{t('ledger.import.empty')}</div>}
          </div>
        )}
        {foreign.map((cur) => {
          const key = `${cur}>${target.currency}`
          return (
            <label key={cur} style={labelStyle}>
              {t('ledger.import.rate', { from: cur, to: target.currency })}
              <input value={rateText[key] ?? ''} onChange={(e) => setRateText((p) => ({ ...p, [key]: e.target.value }))} inputMode="decimal" style={inputStyle} />
              {rateFailed[key] && !rateText[key] && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cs-danger)', marginTop: 4 }}>{t('ledger.entry.needRate')}</span>}
            </label>
          )
        })}

        {error && <div role="alert" style={{ fontSize: 12, color: 'var(--cs-danger)' }}>{error}</div>}
        <button onClick={run} disabled={!canImport} style={{ width: '100%', padding: '11px 0', borderRadius: 6, border: 'none', background: canImport ? 'var(--cs-rc-stamp)' : 'var(--cs-soft)', color: canImport ? 'var(--cs-rc-stamp-text)' : 'var(--cs-text-mute)', fontSize: 14, fontWeight: 600, cursor: canImport ? 'pointer' : 'not-allowed' }}>
          {busy ? t('common.processing') : t('ledger.import.run')}
        </button>
      </div>
    </>
  )
}

export default GroupImportDialog
