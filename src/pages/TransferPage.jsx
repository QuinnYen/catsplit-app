import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, increment } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import Avatar from '../components/Avatar'
import TabBar from '../components/TabBar'
import { getCurrency } from '../config/currencies'

const PAYMENT_METHODS = ['現金', 'LINE Pay', '街口支付', '銀行轉帳', '其他']

const TransferPage = () => {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { user } = useApp()
  const navigate = useNavigate()

  const fromUid = searchParams.get('from')
  const toUid = searchParams.get('to')
  const suggestedAmount = parseFloat(searchParams.get('amount') || '0')
  const currency = searchParams.get('currency') || 'TWD'

  const [group, setGroup] = useState(null)
  const [customAmount, setCustomAmount] = useState(String(suggestedAmount))
  const [paymentMethod, setPaymentMethod] = useState('現金')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'groups', id)).then(snap => {
      if (snap.exists()) setGroup({ id: snap.id, ...snap.data() })
    })
  }, [id])

  const actualAmount = parseFloat(customAmount) || 0
  const isValid = actualAmount > 0

  const handleConfirm = async () => {
    if (!isValid) return
    setLoading(true)
    try {
      await addDoc(collection(db, 'groups', id, 'settlements'), {
        from: fromUid,
        to: toUid,
        amount: actualAmount,
        currency,
        paymentMethod,
        note: note.trim(),
        settledBy: user.uid,
        settledAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      })

      await updateDoc(doc(db, 'groups', id), {
        [`memberBalances.${fromUid}`]: increment(actualAmount),
        [`memberBalances.${toUid}`]: increment(-actualAmount),
      })

      navigate(`/group/${id}/settle`)
    } catch (error) {
      console.error('記錄轉帳失敗', error)
      setLoading(false)
    }
  }

  if (!group) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4', color: '#b08060' }}>
        載入中...
      </div>
    )
  }

  const fromProfile = group.memberProfiles?.[fromUid]
  const toProfile = group.memberProfiles?.[toUid]
  const currencyObj = getCurrency(currency)

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: 10, bottom: -10, fontSize: 64, opacity: 0.12, userSelect: 'none' }}>🐾</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(`/group/${id}/settle`)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >
            ‹
          </button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>記錄轉帳</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 轉帳資訊卡 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
              <Avatar src={fromProfile?.avatar} name={fromProfile?.name} size={48} />
              <div style={{ fontSize: 13, fontWeight: 500, color: '#3d2b1f' }}>{fromProfile?.name}</div>
              <div style={{ fontSize: 11, color: '#b08060' }}>付款方</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 22, color: '#FF8C42' }}>→</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff3ec', borderRadius: 10, border: '1px solid #FF8C42', padding: '6px 10px' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#FF6B1A', flexShrink: 0 }}>{currencyObj.symbol}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)}
                  style={{ width: 80, border: 'none', outline: 'none', background: 'transparent', fontSize: 18, fontWeight: 700, color: '#FF6B1A', textAlign: 'center' }}
                />
              </div>
              {actualAmount !== suggestedAmount && suggestedAmount > 0 && (
                <button
                  onClick={() => setCustomAmount(String(suggestedAmount))}
                  style={{ fontSize: 11, color: '#b08060', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                >
                  建議 {currencyObj.symbol} {suggestedAmount.toLocaleString()}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
              <Avatar src={toProfile?.avatar} name={toProfile?.name} size={48} />
              <div style={{ fontSize: 13, fontWeight: 500, color: '#3d2b1f' }}>{toProfile?.name}</div>
              <div style={{ fontSize: 11, color: '#b08060' }}>收款方</div>
            </div>
          </div>
        </div>

        {/* 付款方式 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>付款方式</div>
          <select
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value)}
            style={{
              width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10,
              padding: '11px 12px', fontSize: 14, color: '#3d2b1f',
              outline: 'none', background: '#fff8f4', appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23b08060' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 14px center',
              paddingRight: 36,
            }}
          >
            {PAYMENT_METHODS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* 備註 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 8 }}>備註（選填）</div>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="例如：已轉 LINE Pay、現金面交..."
            maxLength={30}
            style={{ width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
          />
        </div>

        {/* 確認按鈕 */}
        <button
          onClick={handleConfirm}
          disabled={loading || !isValid}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 16, border: 'none',
            fontSize: 15, fontWeight: 500, cursor: loading || !isValid ? 'not-allowed' : 'pointer',
            background: loading || !isValid ? '#e0c4b0' : '#FF8C42',
            color: '#fff', transition: 'all 0.15s',
          }}
        >
          {loading ? '記錄中...' : '✅ 確認已轉帳'}
        </button>
      </div>

      <TabBar context="transfer" groupId={id} />
    </div>
  )
}

export default TransferPage
