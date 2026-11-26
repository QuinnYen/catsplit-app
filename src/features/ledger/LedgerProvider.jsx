// 個人帳本的資料提供者：載入帳本與帳戶，提供 LedgerContext，並放記帳面板與提示。
// /ledger/*（LedgerShell）與 /fx/*（匯率頁，旅程記帳）共用同一份，沒有任何帳本時先建立預設帳本（hooks.js 的 useEnsureDefaultLedger）。
// lite：匯率頁用，不訂閱群組連結與固定收支，也不跑群組同步與固定收支補入（那是個人記帳的事，在 /ledger 開啟時才做）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useI18n } from '../../i18n/I18nProvider'
import { LedgerContext } from './LedgerContext'
import { useLedgers, useAccounts, useGroupLinks, useCategoryDocs, useRecurringRules, useTrips, useEnsureDefaultLedger, useActiveLedger } from './hooks'
import { resolveCategories, categoryKeys, categoryName } from './categories'
import { hiddenTripIds } from './summary'
import { useLedgerSync } from './useLedgerSync'
import { useRecurringRun } from './useRecurringRun'
import { todayStr } from './dates'
import LedgerEntrySheet from './LedgerEntrySheet'
import SnapshotTxSheet from './SnapshotTxSheet'
import { isSnapshotTx } from './source'

const LedgerProvider = ({ lite = false, children }) => {
  const { user } = useApp()
  const { t } = useI18n()
  const uid = user.uid
  const ledgers = useLedgers(uid)
  const labels = useMemo(() => ({ name: t('ledger.default.name'), baseCurrency: 'TWD', cashName: t('ledger.default.cash') }), [t])
  useEnsureDefaultLedger(uid, ledgers, labels)
  const [ledger, setActiveLedger] = useActiveLedger(uid, ledgers)
  const accounts = useAccounts(uid, ledger?.id)
  // lite 不給帳本 id：hook 不訂閱，回傳 null；下面的同步與固定收支補入看到 null 就不動作
  const links = useGroupLinks(uid, lite ? undefined : ledger?.id)
  const categoryDocs = useCategoryDocs(uid, ledger?.id)
  const recurringRules = useRecurringRules(uid, lite ? undefined : ledger?.id)
  const trips = useTrips(uid, ledger?.id)
  // 不屬於個人記帳的旅程 id；旅程載入前是 null（月曆與統計顯示載入中）
  const hiddenTrips = useMemo(() => (trips ? hiddenTripIds(trips) : null), [trips])
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
    () => ({ uid, ledger, ledgers, accounts, links: links ?? [], sync, categories, categoryDocs: categoryDocs ?? [], catName, recurringRules: recurringRules ?? [], trips: trips ?? [], hiddenTrips, runRecurringNow, setActiveLedger, selectedDate, setSelectedDate, openEntry, showToast }),
    [uid, ledger, ledgers, accounts, links, sync, categories, categoryDocs, catName, recurringRules, trips, hiddenTrips, runRecurringNow, setActiveLedger, selectedDate, openEntry, showToast],
  )

  if (!ledger || !accounts) {
    return <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', display: 'grid', placeItems: 'center', color: 'var(--cs-text-sub)' }}>{t('common.loading')}</div>
  }

  return (
    <LedgerContext.Provider value={ctx}>
      {children}
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

export default LedgerProvider
