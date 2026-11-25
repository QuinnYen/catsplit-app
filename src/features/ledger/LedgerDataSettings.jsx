// 設定頁「資料」分頁：匯出 CSV（整個帳本的全部帳目）。備份與還原之後再做。
// 一般瀏覽器直接下載；LINE 內建瀏覽器無法下載 blob，改由雲端函式存檔並回傳下載網址（見 utils/ledgerApi.js）。
import { useState } from 'react'
import { getDocs, collection } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { useApp } from '../../context/AppContext'
import { useI18n } from '../../i18n/I18nProvider'
import { uploadLedgerCsv, canExportViaFunction } from '../../utils/ledgerApi'
import { useLedger } from './LedgerContext'
import { transactionsPath } from './paths'
import { buildLedgerCsv, ledgerCsvFileName } from './csvExport'

const LedgerDataSettings = () => {
  const { uid, ledger, accounts } = useLedger()
  const { liffInstance } = useApp()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  const exportCsv = async () => {
    if (busy) return
    setBusy(true)
    try {
      // 畫面只載入單月帳目，匯出要抓整個帳本
      const snap = await getDocs(collection(db, ...transactionsPath(uid, ledger.id)))
      const csv = buildLedgerCsv({ ledger, accounts, transactions: snap.docs.map((d) => ({ id: d.id, ...d.data() })), t })
      const filename = ledgerCsvFileName(ledger)

      if (liffInstance?.isInClient?.() && canExportViaFunction()) {
        const url = await uploadLedgerCsv(ledger.id, csv, filename)
        try {
          await navigator.clipboard.writeText(url)
          alert(t('group.exportLinkCopied'))
        } catch {
          window.prompt(t('group.exportLinkManual'), url)
        }
      } else {
        const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = filename
        document.body.appendChild(a) // 部分瀏覽器要掛在頁面上才認 download 檔名
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      }
    } catch (e) {
      console.error('Ledger CSV export failed', e)
      alert(t('group.exportFailed'))
    }
    setBusy(false)
  }

  return (
    <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cs-text)' }}>{t('ledger.data.exportTitle')}</div>
      <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.6, margin: '4px 0 12px' }}>{t('ledger.data.exportDesc', { name: ledger.name })}</div>
      <button onClick={exportCsv} disabled={busy} style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer' }}>
        {busy ? t('common.processing') : t('ledger.data.export')}
      </button>
    </div>
  )
}

export default LedgerDataSettings
