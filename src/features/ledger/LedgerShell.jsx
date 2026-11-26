// /ledger/* 的殼層：載入帳本與帳戶、提供共用資料、放底部導覽列與記帳面板。
// 沒有任何帳本時先建立預設帳本（見 hooks.js 的 useEnsureDefaultLedger）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useI18n } from '../../i18n/I18nProvider'
import { LedgerContext } from './LedgerContext'
import { useLedgers, useAccounts, useGroupLinks, useCategoryDocs, useRecurringRules, useEnsureDefaultLedger, useActiveLedger } from './hooks'
import { resolveCategories, categoryKeys, categoryName } from './categories'
import { useLedgerSync } from './useLedgerSync'
import { useRecurringRun } from './useRecurringRun'
import { todayStr } from './dates'
import LedgerTabBar from './LedgerTabBar'
import LedgerBookPage from './LedgerBookPage'
import LedgerSettingsPage from './LedgerSettingsPage'
import LedgerSettingsSubPage from './LedgerSettingsSubPage'
import LedgerAccountsPage from './LedgerAccountsPage'
import LedgerStatsPage from './LedgerStatsPage'
import LedgerEntrySheet from './LedgerEntrySheet'
import SnapshotTxSheet from './SnapshotTxSheet'
import { isSnapshotTx } from './source'

const LedgerShell = () => {
  const { user } = useApp()
  const { t } = useI18n()
  const uid = user.uid
  const ledgers = useLedgers(uid)
  const labels = useMemo(() => ({ name: t('ledger.default.name'), baseCurrency: 'TWD', cashName: t('ledger.default.cash') }), [t])
  useEnsureDefaultLedger(uid, ledgers, labels)
  const [ledger, setActiveLedger] = useActiveLedger(uid, ledgers)
  const accounts = useAccounts(uid, ledger?.id)
  const links = useGroupLinks(uid, ledger?.id)
  const categoryDocs = useCategoryDocs(uid, ledger?.id)
  const recurringRules = useRecurringRules(uid, ledger?.id)
  const categories = useMemo(() => resolveCategories(categoryDocs ?? []), [categoryDocs])
  const catName = useCallback((kind, key) => categoryName(categories, kind, key, t), [categories, t])
  const [selectedDate, setSelectedDate] = useState(() => todayStr())
  const [entry, setEntry] = useState(null) // null | { tx?: 編輯中的帳目 }
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  const showToast = useCallback((message) => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2200)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const onUnreadable = useCallback((list) => showToast(t('ledger.sync.unreadable', { name: list.map((l) => l.groupName).join(', ') })), [showToast, t])
  const sync = useLedgerSync({ uid, ledger, links, accounts, categories: categoryKeys(categories), onUnreadable })

  const onRecurringDone = useCallback(({ added, capped }) => {
    if (added > 0) showToast(t(capped ? 'ledger.recurring.addedMore' : 'ledger.recurring.added', { n: added }))
  }, [showToast, t])
  const { runNow: runRecurringNow } = useRecurringRun({ uid, ledger, rules: recurringRules, accounts, onDone: onRecurringDone })

  const openEntry = useCallback((tx) => setEntry({ tx }), [])
  const ctx = useMemo(
    () => ({ uid, ledger, ledgers, accounts, links: links ?? [], sync, categories, categoryDocs: categoryDocs ?? [], catName, recurringRules: recurringRules ?? [], runRecurringNow, setActiveLedger, selectedDate, setSelectedDate, openEntry, showToast }),
    [uid, ledger, ledgers, accounts, links, sync, categories, categoryDocs, catName, recurringRules, runRecurringNow, setActiveLedger, selectedDate, openEntry, showToast],
  )

  if (!ledger || !accounts) {
    return <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', display: 'grid', placeItems: 'center', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div>
  }

  return (
    <LedgerContext.Provider value={ctx}>
      <Routes>
        <Route index element={<LedgerBookPage />} />
        <Route path="accounts" element={<LedgerAccountsPage />} />
        <Route path="stats" element={<LedgerStatsPage />} />
        <Route path="settings" element={<LedgerSettingsPage />} />
        <Route path="settings/:section" element={<LedgerSettingsSubPage />} />
        <Route path="*" element={<Navigate to="/ledger" replace />} />
      </Routes>
      <LedgerTabBar onAdd={() => openEntry(undefined)} />
      {entry && (isSnapshotTx(entry.tx)
        ? <SnapshotTxSheet key={`${ledger.id}/${entry.tx.id}`} tx={entry.tx} onClose={() => setEntry(null)} />
        : <LedgerEntrySheet key={`${ledger.id}/${entry.tx?.id ?? 'new'}`} editing={entry.tx} onClose={() => setEntry(null)} />)}
      {toast && (
        <div role="status" style={{ position: 'fixed', left: 16, right: 16, top: 'calc(env(safe-area-inset-top, 0px) + 72px)', zIndex: 300, margin: '0 auto', maxWidth: 360, background: 'var(--cs-text)', color: 'var(--cs-bg)', borderRadius: 6, padding: '10px 14px', fontSize: 13, lineHeight: 1.5, textAlign: 'center' }}>
          {toast}
        </div>
      )}
    </LedgerContext.Provider>
  )
}

export default LedgerShell
