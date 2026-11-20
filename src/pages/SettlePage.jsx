// /group/:id/settle — 結算：每人餘額、最少轉帳次數的轉帳建議（可換算貨幣）與已結清紀錄。
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, collection, getDoc, getDocs } from 'firebase/firestore'
import { Check, CheckCircle2, Info, PartyPopper } from 'lucide-react'
import { db } from '../config/firebase'
import TabBar from '../components/TabBar'
import Avatar from '../components/Avatar'
import GroupIcon from '../components/GroupIcon'
import CollapsibleCard from '../components/CollapsibleCard'
import SettleBreakdownModal from '../components/SettleBreakdownModal'
import { roundToCurrency, PINNED_CURRENCIES } from '../config/currencies'
import CurrencySelect from '../components/CurrencySelect'
import useExchangeRate from '../hooks/useExchangeRate'
import { computeMemberBalances } from '../utils/expenseHelpers'
import { computeSettleSuggestions } from '../utils/settleSuggestions'
import { getBalanceStatus } from '../utils/balanceStatus'
import { buildPersonBreakdown } from '../utils/settleBreakdown'
import { useI18n } from '../i18n/I18nProvider'
import { paymentMethodLabel } from '../i18n/codes'

// 單筆轉帳建議：幣別與匯率由最上方總覽卡片統一選擇後傳入，金額依即時匯率換算；紀錄會存實際轉的幣別與匯率
const TransferCard = ({ s, from, to, baseCurrency, currency, exchangeRate, rateLoading, onGo, onInfo }) => {
  const { t, fmt } = useI18n()
  const isForeign = currency !== baseCurrency
  const ready = !isForeign || (exchangeRate != null && exchangeRate > 0)
  const shown = isForeign ? roundToCurrency(s.amount * (exchangeRate ?? 0), currency) : s.amount
  const amountText = !ready ? (rateLoading ? '...' : '—') : fmt.money(shown, currency)

  const handleGo = () => {
    if (!ready) return
    onGo(`amount=${s.amount}&currency=${currency}`)
  }

  return (
    <div style={{ background: 'var(--cs-soft)', borderRadius: 6, padding: '12px 14px', border: isForeign ? '1.5px solid var(--cs-warn)' : '0.5px solid var(--cs-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Avatar src={from?.avatar} name={from?.name} size={32} />
        <div style={{ fontSize: 13, color: 'var(--cs-text)', flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{from?.name}</div>
          <div style={{ display: 'flex', marginTop: 2 }}>
            <span style={{ color: 'var(--cs-text-sub)', flexShrink: 0, whiteSpace: 'nowrap' }}>{t('settle.to')}&nbsp;</span>
            <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{to?.name}</span>
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--cs-rc-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 700, color: 'var(--cs-rc-owe)' }}>{amountText}</div>
          {isForeign && (
            <div style={{ fontSize: 11, color: 'var(--cs-text-mute)', marginTop: 1 }}>≈ {fmt.money(s.amount, baseCurrency)}</div>
          )}
        </div>
        <Avatar src={to?.avatar} name={to?.name} size={32} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', borderRadius: 6, overflow: 'hidden', background: 'var(--cs-rc-stamp)', opacity: ready ? 1 : 0.6 }}>
          <button
            onClick={handleGo}
            disabled={!ready}
            style={{ flex: 1, padding: '10px 0', border: 'none', background: 'transparent', color: 'var(--cs-rc-stamp-text)', fontSize: 14, fontWeight: 500, cursor: ready ? 'pointer' : 'default' }}
          >
            {t('settle.goTransfer')}
          </button>
        </div>
        <button
          onClick={onInfo}
          aria-label={t('settle.breakdown')}
          title={t('settle.breakdown')}
          style={{ width: 42, borderRadius: 6, border: '0.5px solid var(--cs-border)', background: 'var(--cs-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Info size={18} color="var(--cs-text-sub)" />
        </button>
      </div>
    </div>
  )
}

const SettlePage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, fmt: i18nFmt } = useI18n()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [balances, setBalances] = useState({})
  const [settledRecords, setSettledRecords] = useState([])
  const [settlements, setSettlements] = useState([])
  const [incomes, setIncomes] = useState([])
  const [breakdown, setBreakdown] = useState(null)
  const [loading, setLoading] = useState(true)
  // 轉帳幣別：null 代表沿用群組基準幣；整頁的轉帳建議共用同一個幣別與匯率
  const [transferCurrency, setTransferCurrency] = useState(null)

  const baseCurrency = group?.baseCurrency || 'TWD'
  const currency = transferCurrency ?? baseCurrency
  const { exchangeRate, rateLoading } = useExchangeRate(baseCurrency, currency)

  useEffect(() => {
    const fetchData = async () => {
      const groupSnap = await getDoc(doc(db, 'groups', id))
      if (!groupSnap.exists()) return
      const groupData = { id: groupSnap.id, ...groupSnap.data() }
      setGroup(groupData)

      const [expensesSnap, settlementsSnap, incomesSnap] = await Promise.all([
        getDocs(collection(db, 'groups', id, 'expenses')),
        getDocs(collection(db, 'groups', id, 'settlements')),
        getDocs(collection(db, 'groups', id, 'incomes')),
      ])
      const expensesData = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setExpenses(expensesData)
      const settlementsData = settlementsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setSettledRecords(settlementsData)
      const incomesData = incomesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setIncomes(incomesData)

      // 計算餘額：支出分帳 + 已結清紀錄 + 收入（含贊助）
      const balance = computeMemberBalances(groupData.members, expensesData, settlementsData, incomesData)
      setBalances(balance)

      const result = computeSettleSuggestions(balance, groupData.baseCurrency || 'TWD')

      setSettlements(result)
      setLoading(false)
    }
    fetchData()
  }, [id])

  if (loading || !group) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--cs-bg)', color: 'var(--cs-text-sub)' }}>
        {t('settle.calculating')}
      </div>
    )
  }

  const fmt = (amount) => i18nFmt.money(amount, baseCurrency)

  // 某人的餘額由哪些部分組成（付了、應付、已結清轉帳、收入／退款、贊助），加總等於他的餘額
  const personBreakdown = (uid) => buildPersonBreakdown(uid, { expenses, settlements: settledRecords, incomes })
  const signedFmt = (v) => `${v > 0 ? '+' : '-'}${fmt(Math.abs(v))}`
  const breakdownRows = (breakdown ? [breakdown.from, breakdown.to] : []).map(uid => ({
    uid, name: group.memberProfiles?.[uid]?.name, avatar: group.memberProfiles?.[uid]?.avatar, ...personBreakdown(uid),
  }))

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const totalText = fmt(total)

  // 金額位數多時逐級縮小字體，最後才用「…」截斷
  const amountStyle = (text) => ({
    fontSize: text.length <= 10 ? 22 : text.length <= 13 ? 18 : text.length <= 16 ? 15 : 13,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', display: 'flex', flexDirection: 'column', paddingBottom: 80 }}>

      {/* Header */}
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '16px 16px 20px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(`/group/${id}`)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >
            ‹
          </button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{t('settle.title')}</div>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 總覽卡片 */}
        <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GroupIcon icon={group.icon} color={group.iconColor} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</div>
              <div style={{ fontSize: 12, color: 'var(--cs-text-sub)' }}>{t('settle.summary', { members: group.members.length, count: expenses.length })}</div>
            </div>
            <div style={{ flexShrink: 0, maxWidth: '50%', textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--cs-text-sub)', marginBottom: 2 }}>{t('settle.total')}</div>
              <div style={{ ...amountStyle(totalText), fontWeight: 500, color: 'var(--cs-rc-owe)' }}>{totalText}</div>
            </div>
          </div>
          {/* 轉帳幣別：整頁的轉帳建議都用這個幣別換算 */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--cs-text-sub)', marginBottom: 6 }}>{t('settle.currency')}</div>
            <CurrencySelect
              value={currency}
              onChange={setTransferCurrency}
              pinned={[baseCurrency, ...PINNED_CURRENCIES]}
              ariaLabel={t('settle.currency')}
            />
          </div>
        </div>

        {/* 每人明細 */}
        <CollapsibleCard label={t('settle.perPerson')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {group.members.map(uid => {
              const profile = group.memberProfiles?.[uid]
              const d = personBreakdown(uid)
              const diff = balances[uid] ?? 0
              const diffStatus = getBalanceStatus(diff, group.baseCurrency)

              return (
                <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar src={profile?.avatar} name={profile?.name} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cs-text)', marginBottom: 2 }}>{profile?.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--cs-text-sub)' }}>{t('settle.paid', { amount: fmt(d.paid) })}</div>
                    <div style={{ fontSize: 11, color: 'var(--cs-text-sub)' }}>{t('settle.owes', { amount: fmt(d.owes) })}</div>
                    {[[t('settle.lineSettled'), d.settled], [t('settle.lineIncome'), d.income], [t('settle.sponsorLine'), d.sponsor]]
                      .filter(([, v]) => Math.abs(v) > 0.01)
                      .map(([label, v]) => (
                        <div key={label} style={{ fontSize: 11, color: 'var(--cs-text-sub)' }}>{label} {signedFmt(v)}</div>
                      ))}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 500, flexShrink: 0,
                    color: diffStatus === 'receive' ? 'var(--cs-rc-get)' : diffStatus === 'pay' ? 'var(--cs-rc-owe)' : 'var(--cs-text-sub)'
                  }}>
                    {diffStatus === 'receive' ? `+${fmt(diff)}` : diffStatus === 'pay' ? fmt(diff) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Check size={13} strokeWidth={3} /> {t('home.settled')}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CollapsibleCard>

        {/* 轉帳建議 */}
        <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 12 }}>{t('settle.suggestions')}</div>

          {settlements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><PartyPopper size={48} color="var(--cs-rc-stamp)" /></div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cs-text)', marginBottom: 4 }}>{t('settle.allSettled')}</div>
              <div style={{ fontSize: 13, color: 'var(--cs-text-sub)' }}>{t('settle.noTransfers')}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {settlements.map((s, i) => (
                <TransferCard
                  key={i}
                  s={s}
                  from={group.memberProfiles?.[s.from]}
                  to={group.memberProfiles?.[s.to]}
                  baseCurrency={baseCurrency}
                  currency={currency}
                  exchangeRate={exchangeRate}
                  rateLoading={rateLoading}
                  onGo={(query) => navigate(`/group/${id}/transfer?from=${s.from}&to=${s.to}&${query}`)}
                  onInfo={() => setBreakdown(s)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 已結清紀錄 */}
        {settledRecords.length > 0 && (
          <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 12 }}>{t('settle.history')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {settledRecords.map(s => {
                const from = group.memberProfiles?.[s.from]
                const to = group.memberProfiles?.[s.to]
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '0.5px solid var(--cs-track)' }}>
                    <CheckCircle2 size={16} color="var(--cs-rc-get)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--cs-text-sub)' }}>
                      <div style={{ color: 'var(--cs-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{from?.name}</div>
                      <div style={{ display: 'flex', marginTop: 2 }}>
                        <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{t('settle.to')}&nbsp;</span>
                        <span style={{ color: 'var(--cs-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{to?.name}</span>
                        {s.paymentMethod && <span style={{ marginLeft: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>· {paymentMethodLabel(s.paymentMethod, t)}</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cs-rc-get)', flexShrink: 0 }}>
                      {i18nFmt.money(s.originalAmount ?? s.amount, s.currency || baseCurrency)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {breakdown && (
        <SettleBreakdownModal rows={breakdownRows} amount={breakdown.amount} fmt={fmt} onClose={() => setBreakdown(null)} />
      )}
      <TabBar context="settle" groupId={id} />
    </div>
  )
}

export default SettlePage
