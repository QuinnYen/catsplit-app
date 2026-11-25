// /group/:id/transfer — 記錄一筆轉帳（結清欠款）：確認金額、付款方式與備註後存檔。
import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { collection, serverTimestamp, doc, getDoc, getDocs, query, where, writeBatch, increment } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import Avatar from '../components/Avatar'
import GroupTabBar from '../components/GroupTabBar'
import StickyFooter from '../components/StickyFooter'
import ShareToLineToggle from '../components/ShareToLineToggle'
import { PaymentMethodBody } from '../components/PaymentMethodModal'
import { getCurrency } from '../config/currencies'
import useExchangeRate from '../hooks/useExchangeRate'
import { computeTransferAmounts } from '../utils/transferAmounts'
import { buildLedgerFlex, groupLiffUrl, sendLedgerFlex } from '../utils/flexMessages'
import { useI18n } from '../i18n/I18nProvider'
import { PAYMENT_METHOD_CODES, paymentMethodLabel } from '../i18n/codes'

// 代碼與 paymentProviders 的 id 一致的項目，會自動帶出收款人對應的收款方式
const PAYMENT_METHODS = PAYMENT_METHOD_CODES

const TransferPage = () => {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { user, liffInstance } = useApp()
  const { t, fmt } = useI18n()
  const navigate = useNavigate()

  const fromUid = searchParams.get('from')
  const toUid = searchParams.get('to')
  const baseSuggested = parseFloat(searchParams.get('amount') || '0') // 結算頁的建議金額，單位是群組基準幣
  const currency = searchParams.get('currency') || 'TWD' // 這筆要用哪個幣別轉；匯率由本頁自己抓，不從網址帶

  const [group, setGroup] = useState(null)
  const [customAmount, setCustomAmount] = useState(null) // null：沒改過，沿用建議金額
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [shareToLine, setShareToLine] = useState(false)
  const [loading, setLoading] = useState(false)
  const [payeeMethods, setPayeeMethods] = useState([]) // 收款人公開的收款方式

  useEffect(() => {
    getDoc(doc(db, 'groups', id)).then(snap => {
      if (snap.exists()) setGroup({ id: snap.id, ...snap.data() })
    })
  }, [id])

  // 虛擬成員（p_ 開頭）沒有帳號；讀取失敗就當作沒有，不影響記錄轉帳
  useEffect(() => {
    if (!toUid || toUid.startsWith('p_')) return
    getDocs(query(collection(db, 'users', toUid, 'paymentMethods'), where('isPublic', '==', true)))
      .then(snap => setPayeeMethods(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
  }, [toUid])

  // 自行輸入的收款方式歸在「其他」底下
  const matchedMethods = payeeMethods.filter(m => m.providerId === 'custom' ? paymentMethod === 'other' : m.providerId === paymentMethod)

  const safeIsInClient = () => { try { return liffInstance?.isInClient() ?? false } catch { return false } }

  const baseCurrency = group?.baseCurrency || 'TWD'
  const isForeign = currency !== baseCurrency
  // 群組還沒載入時傳空字串，hook 不會去抓匯率
  const { exchangeRate: rateToCurrency, rateError } = useExchangeRate(baseCurrency, group ? currency : '')
  const { ready, suggested: suggestedAmount, actual: actualAmount, baseAmount, rate } = computeTransferAmounts({
    baseSuggested, currency, baseCurrency, rateToCurrency, customAmount,
  })
  const isValid = ready && actualAmount > 0

  const handleConfirm = async () => {
    if (!isValid) return
    setLoading(true)
    try {
      // 轉帳紀錄與餘額更新放同一個 batch，確保 recomputeGroupAggregates 的交易能偵測到
      const batch = writeBatch(db)
      batch.set(doc(collection(db, 'groups', id, 'settlements')), {
        from: fromUid,
        to: toUid,
        amount: baseAmount,
        currency,
        ...(isForeign && { originalAmount: actualAmount, exchangeRate: rate }),
        paymentMethod,
        note: note.trim(),
        settledBy: user.uid,
        settledAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      })
      batch.update(doc(db, 'groups', id), {
        [`memberBalances.${fromUid}`]: increment(baseAmount),
        [`memberBalances.${toUid}`]: increment(-baseAmount),
      })
      await batch.commit()

      if (shareToLine && safeIsInClient()) {
        const from = group.memberProfiles?.[fromUid]?.name ?? t('common.someone')
        const to = group.memberProfiles?.[toUid]?.name ?? t('common.someone')
        const symbol = getCurrency(currency).symbol
        try {
          await sendLedgerFlex(liffInstance, buildLedgerFlex({
            altText: t('flex.transferAlt', { from, to, amount: `${symbol}${fmt.amount(actualAmount, currency)}` }),
            headerText: t('flex.transferTitle'),
            title: `${from} → ${to}`,
            amount: fmt.money(actualAmount, currency),
            rows: [
              [t('group.detail.method'), paymentMethodLabel(paymentMethod, t)],
              ...(note.trim() ? [[t('group.detail.note'), note.trim()]] : []),
              [t('flex.group'), group.name],
            ],
            openLabel: t('flex.openGroup'),
            groupUrl: groupLiffUrl(id),
          }))
        } catch (e) {
          console.warn('liff.sendMessages failed', e)
        }
      }

      navigate(`/group/${id}/settle`)
    } catch (error) {
      console.error('Failed to record transfer', error)
      setLoading(false)
    }
  }

  if (!group) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--cs-bg)', color: 'var(--cs-text-sub)' }}>
        {t('common.loading')}
      </div>
    )
  }

  const fromProfile = group.memberProfiles?.[fromUid]
  const toProfile = group.memberProfiles?.[toUid]
  const currencyObj = getCurrency(currency)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 80 }}>

      {/* Header */}
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '16px 16px 20px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(`/group/${id}/settle`)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >
            ‹
          </button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{t('transfer.title')}</div>
        </div>
      </div>

      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 轉帳資訊卡 */}
        <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <Avatar src={fromProfile?.avatar} name={fromProfile?.name} size={48} />
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cs-text)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fromProfile?.name}</div>
              <div style={{ fontSize: 11, color: 'var(--cs-text-sub)' }}>{t('group.detail.from')}</div>
            </div>

            <div style={{ fontSize: 22, color: 'var(--cs-rc-stamp)', flexShrink: 0 }}>→</div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <Avatar src={toProfile?.avatar} name={toProfile?.name} size={48} />
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cs-text)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toProfile?.name}</div>
              <div style={{ fontSize: 11, color: 'var(--cs-text-sub)' }}>{t('group.detail.to')}</div>
            </div>
          </div>

          <div style={{ position: 'relative', background: 'var(--cs-soft)', borderRadius: 6, border: '1px solid var(--cs-rc-stamp)', padding: '10px 12px', marginTop: 16 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, fontWeight: 500, color: 'var(--cs-rc-owe)' }}>{currencyObj.symbol}</span>
            <input
              type="number"
              inputMode="decimal"
              value={customAmount ?? (ready ? String(suggestedAmount) : '')}
              onChange={e => setCustomAmount(e.target.value)}
              style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 22, fontWeight: 700, color: 'var(--cs-rc-owe)', textAlign: 'center' }}
            />
          </div>
          {isForeign && (
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--cs-text-mute)', marginTop: 6 }}>
              ≈ {fmt.money(baseAmount, baseCurrency)}
            </div>
          )}
          {isForeign && rateError && (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--cs-danger)', marginTop: 8 }}>{t('transfer.rateError')}</div>
          )}
          {ready && actualAmount !== suggestedAmount && suggestedAmount > 0 && (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button
                onClick={() => setCustomAmount(null)}
                style={{ fontSize: 11, color: 'var(--cs-text-sub)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                {t('transfer.suggested', { amount: fmt.money(suggestedAmount, currency) })}
              </button>
            </div>
          )}
        </div>

        {/* 付款方式 */}
        <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 10 }}>{t('group.detail.method')}</div>
          <select
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value)}
            style={{
              width: '100%', border: '0.5px solid var(--cs-border)', borderRadius: 6,
              padding: '11px 12px', fontSize: 14, color: 'var(--cs-text)',
              outline: 'none', background: 'var(--cs-bg)', appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23b08060' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 14px center',
              paddingRight: 36,
            }}
          >
            {PAYMENT_METHODS.map(m => (
              <option key={m} value={m}>{paymentMethodLabel(m, t)}</option>
            ))}
          </select>

          {matchedMethods.map(m => (
            <div key={m.id} style={{ marginTop: 12, background: 'var(--cs-soft)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
              <PaymentMethodBody method={m} heading={t('transfer.payeeMethods', { name: toProfile?.name ?? t('transfer.counterparty') })} />
            </div>
          ))}
        </div>

        {liffInstance && safeIsInClient() && <ShareToLineToggle checked={shareToLine} onChange={setShareToLine} />}

        {/* 備註 */}
        <div style={{ background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 8 }}>{t('pay.note')}</div>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t('transfer.notePlaceholder')}
            maxLength={30}
            style={{ width: '100%', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: 'var(--cs-text)', outline: 'none', background: 'var(--cs-bg)' }}
          />
        </div>

        {/* 確認按鈕 */}
        <StickyFooter>
        <button
          onClick={handleConfirm}
          disabled={loading || !isValid}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 6, border: 'none',
            fontSize: 15, fontWeight: 500, cursor: loading || !isValid ? 'not-allowed' : 'pointer',
            background: loading || !isValid ? 'var(--cs-line-soft)' : 'var(--cs-rc-stamp)',
            color: 'var(--cs-rc-stamp-text)', transition: 'all 0.15s',
          }}
        >
          {loading ? t('transfer.submitting') : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={16} /> {t('transfer.submit')}
            </span>
          )}
        </button>
        </StickyFooter>
      </div>

      <GroupTabBar groupId={id} active="settle" />
    </div>
  )
}

export default TransferPage
