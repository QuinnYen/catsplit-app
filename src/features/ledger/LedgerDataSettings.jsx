// 設定頁「資料」分頁：匯出 CSV（整個帳本的全部帳目）、備份與還原（單一帳本的 JSON 檔，還原成新帳本）、重新計算帳戶餘額。
// 一般瀏覽器直接下載；LINE 內建瀏覽器無法下載 blob，改由雲端函式存檔並回傳下載網址（見 utils/ledgerApi.js）。
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDocs, collection } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { useApp } from '../../context/AppContext'
import { useI18n } from '../../i18n/I18nProvider'
import { uploadLedgerCsv, canExportViaFunction } from '../../utils/ledgerApi'
import { useLedger } from './LedgerContext'
import { transactionsPath } from './paths'
import { buildLedgerCsv, ledgerCsvFileName } from './csvExport'
import { buildBackup, parseBackup, backupFileName, LIMITS } from './backup'
import { restoreBackup } from './backupData'
import { repairBalances } from './data'
import { MAX_LEDGERS, LEDGER_NAME_MAX } from './constants'

const card = { background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }
const heading = { fontSize: 14, fontWeight: 600, color: 'var(--cs-text)' }
const hint = { fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.6, margin: '4px 0 12px' }
const button = (busy) => ({ width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer' })

const LedgerDataSettings = () => {
  const { uid, ledger, ledgers, accounts, categories, categoryDocs, recurringRules, setActiveLedger, showToast } = useLedger()
  const { liffInstance } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null) // 選好的備份檔：{ backup, summary }
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(null) // { done, total }
  const fileInput = useRef(null)
  const [repairing, setRepairing] = useState(false)

  // 畫面只載入單月帳目，匯出與備份要抓整個帳本
  const loadTransactions = async () => (await getDocs(collection(db, ...transactionsPath(uid, ledger.id)))).docs.map((d) => ({ id: d.id, ...d.data() }))

  // 一般瀏覽器下載；LINE 內建瀏覽器請雲端函式存檔，複製 5 分鐘有效的下載連結
  const deliver = async ({ content, filename, mime, format }) => {
    if (liffInstance?.isInClient?.() && canExportViaFunction()) {
      const url = await uploadLedgerCsv(ledger.id, content, filename, format)
      try {
        await navigator.clipboard.writeText(url)
        alert(t('group.exportLinkCopied'))
      } catch {
        window.prompt(t('group.exportLinkManual'), url)
      }
      return
    }
    const blobUrl = URL.createObjectURL(new Blob([content], { type: mime }))
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a) // 部分瀏覽器要掛在頁面上才認 download 檔名
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  }

  const run = async (fn) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      console.error('Ledger data operation failed', e)
      alert(t('group.exportFailed'))
    }
    setBusy(false)
  }

  const exportCsv = () => run(async () => {
    const csv = buildLedgerCsv({ ledger, accounts, categories, transactions: await loadTransactions(), t })
    await deliver({ content: csv, filename: ledgerCsvFileName(ledger), mime: 'text/csv;charset=utf-8;', format: 'csv' })
  })

  const downloadBackup = () => run(async () => {
    const backup = buildBackup({ ledger, accounts, transactions: await loadTransactions(), categories: categoryDocs, recurring: recurringRules })
    await deliver({ content: JSON.stringify(backup), filename: backupFileName(ledger), mime: 'application/json;charset=utf-8;', format: 'json' })
  })

  // 讀整個帳本的帳目，依「期初餘額＋帳目」重算每個帳戶，與記錄不同的才寫回（餘額漂移或帳號合併後用）
  const repair = async () => {
    if (repairing || busy || !window.confirm(t('ledger.accounts.repairConfirm'))) return
    setRepairing(true)
    try {
      const fixes = await repairBalances(uid, ledger.id, accounts)
      showToast(fixes.length === 0 ? t('ledger.accounts.repairNone') : t('ledger.accounts.repairDone', { n: fixes.length }))
    } catch (e) {
      console.error('Failed to repair balances', e)
      showToast(t('ledger.accounts.repairFailed'))
    }
    setRepairing(false)
  }

  const pickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 同一個檔案可以再選一次
    setError('')
    setPending(null)
    if (!file) return
    if (file.size > LIMITS.bytes) return setError(t('ledger.backup.err.size'))
    let json
    try {
      json = JSON.parse(await file.text())
    } catch {
      return setError(t('ledger.backup.err.format'))
    }
    const r = parseBackup(json)
    if (!r.ok) return setError(t(`ledger.backup.err.${r.reason}`, { detail: String(r.detail ?? '') }))
    if (ledgers.length >= MAX_LEDGERS) return setError(t('ledger.new.limit', { n: MAX_LEDGERS }))
    setPending(r)
  }

  const restore = async () => {
    if (!pending || busy) return
    setBusy(true)
    setError('')
    setProgress({ done: 0, total: 1 })
    try {
      const name = t('ledger.backup.restoredName', { name: pending.summary.name }).slice(0, LEDGER_NAME_MAX)
      const id = await restoreBackup(uid, pending.backup, { name, onProgress: (done, total) => setProgress({ done, total }) })
      setActiveLedger(id)
      showToast(t('ledger.backup.restored', { name }))
      setPending(null)
      navigate('/ledger')
    } catch (e) {
      console.error('Failed to restore backup', e)
      setError(t('ledger.backup.err.failed'))
    }
    setProgress(null)
    setBusy(false)
  }

  const s = pending?.summary
  return (
    <>
      <div style={card}>
        <div style={heading}>{t('ledger.data.exportTitle')}</div>
        <div style={hint}>{t('ledger.data.exportDesc', { name: ledger.name })}</div>
        <button onClick={exportCsv} disabled={busy} style={button(busy)}>{busy ? t('common.processing') : t('ledger.data.export')}</button>
      </div>

      <div style={card}>
        <div style={heading}>{t('ledger.accounts.repair')}</div>
        <div style={hint}>{t('ledger.accounts.repairHint')}</div>
        <button onClick={repair} disabled={repairing || busy} style={button(repairing || busy)}>{repairing ? t('common.processing') : t('ledger.accounts.repair')}</button>
      </div>

      <div style={card}>
        <div style={heading}>{t('ledger.backup.title')}</div>
        <div style={hint}>{t('ledger.backup.desc', { name: ledger.name })}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={downloadBackup} disabled={busy} style={{ ...button(busy), flex: 1 }}>{t('ledger.backup.download')}</button>
          <button onClick={() => fileInput.current?.click()} disabled={busy} style={{ ...button(busy), flex: 1 }}>{t('ledger.backup.restore')}</button>
        </div>
        <input ref={fileInput} type="file" accept="application/json,.json" onChange={pickFile} aria-label={t('ledger.backup.file')} style={{ display: 'none' }} />
        {error && <div role="alert" style={{ marginTop: 10, fontSize: 12, color: 'var(--cs-danger)', lineHeight: 1.6 }}>{error}</div>}
        {pending && (
          <div role="region" aria-label={t('ledger.backup.confirmTitle')} style={{ marginTop: 12, border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: 12, background: 'var(--cs-bg)', fontSize: 13, lineHeight: 1.8, color: 'var(--cs-text)' }}>
            <div style={{ fontWeight: 600 }}>{t('ledger.backup.confirmTitle')}</div>
            <div>{t('ledger.backup.sumName', { name: s.name, currency: s.baseCurrency })}</div>
            <div>{t('ledger.backup.sumCounts', { accounts: s.accounts, transactions: s.transactions })}</div>
            {s.minDate && <div>{t('ledger.backup.sumRange', { from: s.minDate, to: s.maxDate })}</div>}
            <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', margin: '6px 0 10px' }}>{t('ledger.backup.confirmHint')}</div>
            {progress && <div role="status" style={{ fontSize: 12, color: 'var(--cs-text-sub)', marginBottom: 8 }}>{t('ledger.backup.progress', { done: progress.done, total: progress.total })}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={restore} disabled={busy} style={{ flex: 1, padding: '10px 0', borderRadius: 6, border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>{busy ? t('common.processing') : t('ledger.backup.restoreNew')}</button>
              <button onClick={() => setPending(null)} disabled={busy} style={{ flex: 1, ...button(busy) }}>{t('common.cancel')}</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default LedgerDataSettings
