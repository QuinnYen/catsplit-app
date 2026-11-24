// /ledger/accounts — 淨資產、帳戶清單與餘額、新增與編輯帳戶、重新計算餘額。
// 快照帳戶（群組同步）獨立一區，不計入淨資產。
import { useEffect, useMemo, useState } from 'react'
import { Plus, ChevronRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { fetchExchangeRate } from '../../config/currencies'
import { useLedger } from './LedgerContext'
import { computeNetWorth, netWorthCurrencies } from './netWorth'
import { repairBalances } from './data'
import { MAX_ACCOUNTS } from './constants'
import AccountSheet from './AccountSheet'

const card = { background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)' }
const sectionTitle = { fontSize: 12, color: 'var(--cs-text-sub)', margin: '4px 2px 0' }

// 外幣帳戶換成統計幣別用的匯率；抓不到的幣別不放進結果（淨資產會標註）
const useBaseRates = (currencies, base) => {
  const key = `${base}:${currencies.join(',')}`
  const [state, setState] = useState({ key: null, rates: {} })
  useEffect(() => {
    if (currencies.length === 0) return
    let cancelled = false
    Promise.all(currencies.map((c) => fetchExchangeRate(c, base).then((r) => [c, r]).catch(() => null)))
      .then((pairs) => { if (!cancelled) setState({ key, rates: Object.fromEntries(pairs.filter(Boolean)) }) })
    return () => { cancelled = true }
  }, [key, base]) // eslint-disable-line react-hooks/exhaustive-deps
  return { rates: state.key === key ? state.rates : {}, loading: currencies.length > 0 && state.key !== key }
}

const AccountRow = ({ account, base, rate, onOpen }) => {
  const { t, fmt } = useI18n()
  const foreign = account.currency !== base
  return (
    <button onClick={onOpen} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'none', border: 'none', borderTop: '0.5px solid var(--cs-border)', cursor: 'pointer', textAlign: 'left', color: 'var(--cs-text)' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cs-text-sub)', marginTop: 2 }}>{t(`ledger.accountType.${account.type}`)}</span>
      </span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: (account.balance ?? 0) < 0 ? 'var(--cs-danger)' : 'var(--cs-text)' }}>{fmt.money(account.balance ?? 0, account.currency)}</span>
        {foreign && rate && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cs-text-sub)', marginTop: 2 }}>≈ {fmt.money((account.balance ?? 0) * rate, base)}</span>}
      </span>
      <ChevronRight size={16} color="var(--cs-text-mute)" />
    </button>
  )
}

const LedgerAccountsPage = () => {
  const { uid, ledger, accounts, showToast } = useLedger()
  const { t, fmt } = useI18n()
  const base = ledger.baseCurrency
  const [sheet, setSheet] = useState(null) // null | { account? }
  const [repairing, setRepairing] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const normal = useMemo(() => accounts.filter((a) => a.kind !== 'group'), [accounts])
  const active = normal.filter((a) => !a.archived)
  const archived = normal.filter((a) => a.archived)
  const snapshots = accounts.filter((a) => a.kind === 'group')

  const currencies = useMemo(() => netWorthCurrencies(accounts, base), [accounts, base])
  const { rates, loading } = useBaseRates(currencies, base)
  const worth = computeNetWorth({ accounts, baseCurrency: base, rates })

  const repair = async () => {
    if (repairing || !window.confirm(t('ledger.accounts.repairConfirm'))) return
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

  const add = () => {
    if (normal.length >= MAX_ACCOUNTS) return showToast(t('ledger.account.limit', { n: MAX_ACCOUNTS }))
    setSheet({})
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 'calc(var(--tabbar-h) + 24px)' }}>
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '20px 16px 22px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: 'var(--cs-rc-head-text)', fontSize: 16, fontWeight: 500 }}>{t('ledger.tab.accounts')}</div>
          <button onClick={add} aria-label={t('ledger.account.newTitle')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.5)', borderRadius: '50%', width: 32, height: 32, display: 'grid', placeItems: 'center', color: 'var(--cs-rc-head-text)', cursor: 'pointer' }}>
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...card, padding: '16px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--cs-text-sub)' }}>{t('ledger.accounts.netWorth')}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: worth.total < 0 ? 'var(--cs-danger)' : 'var(--cs-text)', margin: '6px 0 4px', opacity: loading ? 0.5 : 1 }}>{fmt.money(worth.total, base)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--cs-text-sub)', lineHeight: 1.5 }}>
            {t('ledger.baseCaption', { currency: base })}
            {worth.estimated && ` · ${t('ledger.accounts.estimated')}`}
          </div>
          {worth.missing.length > 0 && !loading && (
            <div role="status" style={{ fontSize: 11.5, color: 'var(--cs-danger)', marginTop: 6 }}>{t('ledger.accounts.missingRate', { currencies: worth.missing.join(', ') })}</div>
          )}
        </div>

        <div style={sectionTitle}>{t('ledger.accounts.list')}</div>
        <div style={{ ...card, overflow: 'hidden' }}>
          {active.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--cs-text-mute)', textAlign: 'center' }}>{t('ledger.accounts.empty')}</div>}
          {active.map((a, i) => (
            <div key={a.id} style={i === 0 ? { marginTop: -0.5 } : undefined}>
              <AccountRow account={a} base={base} rate={rates[a.currency]} onOpen={() => setSheet({ account: a })} />
            </div>
          ))}
        </div>

        {snapshots.length > 0 && (
          <>
            <div style={sectionTitle}>{t('ledger.accounts.snapshots')}</div>
            <div style={{ ...card, overflow: 'hidden' }}>
              {snapshots.map((a) => (
                <div key={a.id} style={{ padding: '12px 14px', borderTop: '0.5px solid var(--cs-border)', display: 'flex', justifyContent: 'space-between', gap: 10, color: 'var(--cs-text)' }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cs-text-sub)', marginTop: 2 }}>{t('ledger.accounts.snapshotNote', { n: a.syncedCount ?? 0 })}</span>
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{fmt.money(a.syncedNet ?? 0, a.currency)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {archived.length > 0 && (
          <>
            <button onClick={() => setShowArchived((v) => !v)} style={{ ...sectionTitle, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
              {showArchived ? '▾' : '▸'} {t('ledger.accounts.archived', { n: archived.length })}
            </button>
            {showArchived && (
              <div style={{ ...card, overflow: 'hidden' }}>
                {archived.map((a) => <AccountRow key={a.id} account={a} base={base} rate={rates[a.currency]} onOpen={() => setSheet({ account: a })} />)}
              </div>
            )}
          </>
        )}

        <div style={{ ...card, padding: 14 }}>
          <button onClick={repair} disabled={repairing} style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text)', fontSize: 14, cursor: repairing ? 'not-allowed' : 'pointer' }}>
            {repairing ? t('common.processing') : t('ledger.accounts.repair')}
          </button>
          <div style={{ fontSize: 11.5, color: 'var(--cs-text-mute)', lineHeight: 1.5, marginTop: 8 }}>{t('ledger.accounts.repairHint')}</div>
        </div>
      </div>

      {sheet && <AccountSheet key={sheet.account?.id ?? 'new'} account={sheet.account} activeNormalCount={active.length} onClose={() => setSheet(null)} />}
    </div>
  )
}

export default LedgerAccountsPage
