// /group/:id/settle — 結算：每人餘額、最少轉帳次數的轉帳建議（可換算貨幣）與已結清紀錄。
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, collection, getDoc, getDocs } from 'firebase/firestore'
import { AlertTriangle, Check, CheckCircle2, Info, PartyPopper } from 'lucide-react'
import { db } from '../config/firebase'
import TabBar from '../components/TabBar'
import Avatar from '../components/Avatar'
import GroupIcon from '../components/GroupIcon'
import CollapsibleCard from '../components/CollapsibleCard'
import SettleBreakdownModal from '../components/SettleBreakdownModal'
import { CURRENCIES, getCurrency } from '../config/currencies'
import useExchangeRate from '../hooks/useExchangeRate'
import { computeMemberBalances } from '../utils/expenseHelpers'
import { useI18n } from '../i18n/I18nProvider'
import { paymentMethodLabel } from '../i18n/codes'

const SettlePage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, fmt: i18nFmt } = useI18n()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [balances, setBalances] = useState({})
  const [settledRecords, setSettledRecords] = useState([])
  const [settlements, setSettlements] = useState([])
  const [sponsorships, setSponsorships] = useState([])
  const [breakdown, setBreakdown] = useState(null)
  const [loading, setLoading] = useState(true)
  const [displayCurrency, setDisplayCurrency] = useState(null)

  const baseCurrency = group?.baseCurrency || 'TWD'
  // hook: fetchExchangeRate(from=baseCurrency, to=displayCurrency)
  const { exchangeRate, rateLoading } = useExchangeRate(baseCurrency, displayCurrency || baseCurrency)
  const displayRate = exchangeRate ?? 1

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
      setSponsorships(incomesData.filter(i => i.isSponsorship))

      // 計算餘額：支出分帳 + 已結清紀錄 + 收入（含贊助）
      const balance = computeMemberBalances(groupData.members, expensesData, settlementsData, incomesData)
      setBalances(balance)

      const result = []
      const creditors = []
      const debtors = []
      Object.entries(balance).forEach(([uid, amt]) => {
        if (amt > 0.01) creditors.push({ uid, amt })
        else if (amt < -0.01) debtors.push({ uid, amt: -amt })
      })
      creditors.sort((a, b) => b.amt - a.amt)
      debtors.sort((a, b) => b.amt - a.amt)

      let i = 0, j = 0
      while (i < creditors.length && j < debtors.length) {
        const creditor = creditors[i]
        const debtor = debtors[j]
        const amount = Math.min(creditor.amt, debtor.amt)
        // 四捨五入後為 0 的殘餘（分帳除不盡）不列成建議
        if (Math.round(amount) > 0) {
          result.push({
            from: debtor.uid,
            to: creditor.uid,
            amount: Math.round(amount),
          })
        }
        creditor.amt -= amount
        debtor.amt -= amount
        if (creditor.amt < 0.01) i++
        if (debtor.amt < 0.01) j++
      }

      setSettlements(result)
      setDisplayCurrency(groupData.baseCurrency || 'TWD')
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

  const dispCurr = getCurrency(displayCurrency || baseCurrency)
  const fmt = (amount) => `${dispCurr.symbol} ${i18nFmt.num(Math.round(amount * displayRate))}`

  // 贊助：給出去為負、收到為正
  const sponsoredOf = (uid) => sponsorships.reduce((sum, s) => sum + (s.splits?.[uid] || 0) - (s.received?.[uid] || 0), 0)
  const breakdownRows = (breakdown ? [breakdown.from, breakdown.to] : []).map(uid => {
    const net = balances[uid] ?? 0
    const sponsor = sponsoredOf(uid)
    return { uid, name: group.memberProfiles?.[uid]?.name, avatar: group.memberProfiles?.[uid]?.avatar, trip: net - sponsor, sponsor, net }
  })

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const totalText = rateLoading ? '...' : fmt(total)

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <GroupIcon icon={group.icon} color={group.iconColor} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cs-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</div>
              <div style={{ fontSize: 12, color: 'var(--cs-text-sub)' }}>{t('settle.summary', { members: group.members.length, count: expenses.length })}</div>
            </div>
          </div>

          {/* 貨幣選單 + 總支出 */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <select
                value={displayCurrency}
                onChange={e => setDisplayCurrency(e.target.value)}
                style={{ width: '100%', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '8px 10px', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-bg)' }}
              >
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
              {displayCurrency !== baseCurrency && (
                <div style={{ fontSize: 11, color: 'var(--cs-text-mute)', marginTop: 6, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                  <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} /> {t('settle.fxNote', { currency: `${getCurrency(baseCurrency).symbol} ${baseCurrency}` })}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--cs-text-sub)', marginBottom: 2 }}>{t('settle.total')}</div>
              <div style={{ ...amountStyle(totalText), fontWeight: 500, color: 'var(--cs-rc-owe)' }}>{totalText}</div>
            </div>
          </div>
        </div>

        {/* 每人明細 */}
        <CollapsibleCard label={t('settle.perPerson')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {group.members.map(uid => {
              const profile = group.memberProfiles?.[uid]
              const paid = expenses.reduce((sum, e) => sum + (e.payments?.[uid] || 0), 0)
              const shouldPay = expenses.reduce((sum, e) => sum + (e.splits?.[uid] || 0), 0)
              const diff = balances[uid] ?? 0
              const sponsored = sponsoredOf(uid)

              return (
                <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar src={profile?.avatar} name={profile?.name} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cs-text)', marginBottom: 2 }}>{profile?.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--cs-text-sub)' }}>{t('settle.paid', { amount: fmt(paid) })}</div>
                    <div style={{ fontSize: 11, color: 'var(--cs-text-sub)' }}>{t('settle.owes', { amount: fmt(shouldPay) })}</div>
                    {Math.abs(sponsored) > 0.01 && (
                      <div style={{ fontSize: 11, color: 'var(--cs-text-sub)' }}>{t('settle.sponsored', { amount: `${sponsored > 0 ? '+' : '-'}${fmt(Math.abs(sponsored))}` })}</div>
                    )}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 500, flexShrink: 0,
                    color: diff > 0.01 ? 'var(--cs-rc-get)' : diff < -0.01 ? 'var(--cs-rc-owe)' : 'var(--cs-text-sub)'
                  }}>
                    {diff > 0.01 ? `+${fmt(diff)}` : diff < -0.01 ? fmt(diff) : (
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
              {settlements.map((s, i) => {
                const from = group.memberProfiles?.[s.from]
                const to = group.memberProfiles?.[s.to]
                return (
                  <div
                    key={i}
                    style={{ background: 'var(--cs-soft)', borderRadius: 6, padding: '12px 14px', border: '0.5px solid var(--cs-border)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <Avatar src={from?.avatar} name={from?.name} size={32} />
                      <div style={{ fontSize: 13, color: 'var(--cs-text)', flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{from?.name}</div>
                        <div style={{ display: 'flex', marginTop: 2 }}>
                          <span style={{ color: 'var(--cs-text-sub)', flexShrink: 0, whiteSpace: 'nowrap' }}>{t('settle.to')}&nbsp;</span>
                          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{to?.name}</span>
                        </div>
                      </div>
                      <div style={{ fontFamily: 'var(--cs-rc-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 700, color: 'var(--cs-rc-owe)', flexShrink: 0 }}>
                        {rateLoading ? '...' : fmt(s.amount)}
                      </div>
                      <Avatar src={to?.avatar} name={to?.name} size={32} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => navigate(
                          `/group/${id}/transfer?from=${s.from}&to=${s.to}&amount=${s.amount}&currency=${baseCurrency}`
                        )}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 6, border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                      >
                        {t('settle.goTransfer')}
                      </button>
                      {sponsorships.length > 0 && (
                        <button
                          onClick={() => setBreakdown(s)}
                          aria-label={t('settle.breakdown')}
                          title={t('settle.breakdown')}
                          style={{ width: 42, borderRadius: 6, border: '0.5px solid var(--cs-border)', background: 'var(--cs-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Info size={18} color="var(--cs-text-sub)" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
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
                      {getCurrency(s.currency || baseCurrency).symbol} {i18nFmt.num(s.amount)}
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
