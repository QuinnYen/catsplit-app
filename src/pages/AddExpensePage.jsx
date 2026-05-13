import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, increment } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import TabBar from '../components/TabBar'
import Avatar from '../components/Avatar'
import { CURRENCIES, getCurrency, fetchExchangeRate } from '../config/currencies'

const DEFAULT_CATEGORIES = ['餐飲', '交通', '住宿', '購物', '娛樂', '日用品', '其他']
const SPLIT_TYPES = [
  { key: 'equal',      label: '均分' },
  { key: 'subset',     label: '部分人' },
  { key: 'shares',     label: '依份數' },
  { key: 'percentage', label: '依比例' },
  { key: 'custom',     label: '自訂金額' },
]

const AddExpensePage = () => {
  const { id } = useParams()
  const { user } = useApp()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('餐飲')
  const [customCategory, setCustomCategory] = useState('')
  const [isEditingCategory, setIsEditingCategory] = useState(false)
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(user?.uid)
  const [payerExcluded, setPayerExcluded] = useState(false)
  const [splitType, setSplitType] = useState('equal')
  const [customAmounts, setCustomAmounts] = useState({})
  const [percentages, setPercentages] = useState({})
  const [shares, setShares] = useState({})
  const [subsetMembers, setSubsetMembers] = useState({})
  const [loading, setLoading] = useState(false)
  const [currency, setCurrency] = useState('TWD')
  const [exchangeRate, setExchangeRate] = useState(1)
  const [rateLoading, setRateLoading] = useState(false)
  const [baseCurrency, setBaseCurrency] = useState('TWD')

  useEffect(() => {
    const fetchGroup = async () => {
      const snap = await getDoc(doc(db, 'groups', id))
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() }
        setGroup(data)
        const base = data.baseCurrency || 'TWD'
        setBaseCurrency(base)
        setCurrency(base)
        const init = {}
        data.members.forEach(uid => { init[uid] = '' })
        setCustomAmounts(init)
        setPercentages(init)
        const sharesInit = {}
        data.members.forEach(uid => { sharesInit[uid] = '1' })
        setShares(sharesInit)
        const subsetInit = {}
        data.members.forEach(uid => { subsetInit[uid] = true })
        setSubsetMembers(subsetInit)
      }
    }
    fetchGroup()
  }, [id])

  useEffect(() => {
    if (!baseCurrency) return
    if (currency === baseCurrency) {
      setExchangeRate(1)
      return
    }
    setRateLoading(true)
    fetchExchangeRate(currency, baseCurrency)
      .then(rate => setExchangeRate(rate))
      .catch(() => setExchangeRate(null))
      .finally(() => setRateLoading(false))
  }, [currency, baseCurrency])

  // 計算目前分帳的有效成員（subset 模式下排除未勾選；payerExcluded 排除付款者）
  const effectiveMembers = (allMembers) => {
    let uids = allMembers.map(([uid]) => uid)
    if (splitType === 'subset') {
      uids = uids.filter(uid => subsetMembers[uid])
    }
    if (payerExcluded) {
      uids = uids.filter(uid => uid !== paidBy)
    }
    return uids
  }

  const customTotal = Object.values(customAmounts)
    .reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

  const percentageTotal = Object.values(percentages)
    .reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

  const sharesTotal = Object.values(shares)
    .reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

  const isValid = () => {
    if (!title.trim()) return false
    if (!amount || parseFloat(amount) <= 0) return false
    if (splitType === 'custom') {
      if (Math.abs(customTotal - parseFloat(amount)) > 0.01) return false
    }
    if (splitType === 'percentage') {
      if (Math.abs(percentageTotal - 100) > 0.01) return false
    }
    if (splitType === 'subset') {
      const selected = Object.values(subsetMembers).filter(Boolean).length
      const minCount = payerExcluded ? 1 : 1
      if (selected < minCount) return false
      if (payerExcluded && selected === 1 && subsetMembers[paidBy]) return false
    }
    if (splitType === 'shares') {
      if (sharesTotal <= 0) return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!isValid()) return
    setLoading(true)
    try {
      const totalAmount = parseFloat(amount)
      const allMemberEntries = Object.entries(group.memberProfiles || {})
      const eff = effectiveMembers(allMemberEntries)
      let splits = {}

      if (splitType === 'equal' || splitType === 'subset') {
        const each = parseFloat((totalAmount / eff.length).toFixed(2))
        eff.forEach(uid => { splits[uid] = each })
      } else if (splitType === 'shares') {
        eff.forEach(uid => {
          const s = parseFloat(shares[uid]) || 0
          splits[uid] = parseFloat((s / sharesTotal * totalAmount).toFixed(2))
        })
      } else if (splitType === 'percentage') {
        eff.forEach(uid => {
          splits[uid] = parseFloat(((parseFloat(percentages[uid]) || 0) / 100 * totalAmount).toFixed(2))
        })
      } else {
        allMemberEntries.forEach(([uid]) => {
          splits[uid] = parseFloat(customAmounts[uid]) || 0
        })
      }

      const rate = exchangeRate ?? 1
      const baseAmount = parseFloat((totalAmount * rate).toFixed(2))

      await addDoc(collection(db, 'groups', id, 'expenses'), {
        title: title.trim(),
        category,
        currency,
        originalAmount: totalAmount,
        exchangeRate: rate,
        amount: baseAmount,
        paidBy,
        payerExcluded,
        splitType,
        splits: Object.fromEntries(
          Object.entries(splits).map(([uid, v]) => [uid, parseFloat((v * rate).toFixed(2))])
        ),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      })

      await updateDoc(doc(db, 'groups', id), {
        totalAmount: increment(baseAmount),
        totalExpenses: increment(1),
      })

      navigate(`/group/${id}`)
    } catch (error) {
      console.error('新增失敗', error)
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

  const members = Object.entries(group.memberProfiles || {})

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: 10, bottom: -10, fontSize: 64, opacity: 0.12, userSelect: 'none' }}>🐾</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >
            ‹
          </button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>新增支出</div>
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 類別 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>類別</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: isEditingCategory ? 10 : 0 }}>
            {DEFAULT_CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => { setCategory(c); setIsEditingCategory(false) }}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 13, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: category === c && !isEditingCategory ? '#FF8C42' : '#fff3ec',
                  color: category === c && !isEditingCategory ? '#fff' : '#b08060',
                  fontWeight: category === c && !isEditingCategory ? 500 : 400,
                }}
              >
                {c}
              </button>
            ))}
            <button
              onClick={() => setIsEditingCategory(true)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 13, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: isEditingCategory ? '#FF8C42' : '#fff3ec',
                color: isEditingCategory ? '#fff' : '#b08060',
              }}
            >
              自訂
            </button>
          </div>
          {isEditingCategory && (
            <input
              type="text"
              value={customCategory}
              onChange={e => { setCustomCategory(e.target.value); setCategory(e.target.value) }}
              placeholder="輸入自訂類別..."
              maxLength={10}
              autoFocus
              style={{ width: '100%', border: '0.5px solid #FF8C42', borderRadius: 10, padding: '9px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4', marginTop: 4 }}
            />
          )}
        </div>

        {/* 名稱 & 金額 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 8 }}>項目名稱</div>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：晚餐、計程車..."
              maxLength={20}
              style={{ width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 8 }}>貨幣</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CURRENCIES.map(c => (
                <button
                  key={c.code}
                  onClick={() => setCurrency(c.code)}
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 12, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    background: currency === c.code ? '#FF8C42' : '#fff3ec',
                    color: currency === c.code ? '#fff' : '#b08060',
                    fontWeight: currency === c.code ? 500 : 400,
                  }}
                >
                  {c.symbol} {c.code}
                </button>
              ))}
            </div>
            {currency !== baseCurrency && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#b08060' }}>匯率 1 {currency} =</span>
                {rateLoading ? (
                  <span style={{ fontSize: 11, color: '#c4a882' }}>抓取中...</span>
                ) : (
                  <input
                    type="number"
                    value={exchangeRate ?? ''}
                    onChange={e => setExchangeRate(parseFloat(e.target.value) || null)}
                    style={{ width: 90, border: '0.5px solid #f0d5c0', borderRadius: 8, padding: '4px 8px', fontSize: 12, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
                  />
                )}
                <span style={{ fontSize: 11, color: '#b08060' }}>{baseCurrency}</span>
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 8 }}>金額</div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#b08060', fontSize: 13 }}>
                {getCurrency(currency).symbol}
              </span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                style={{ width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px 10px 44px', fontSize: 20, fontWeight: 500, color: '#FF6B1A', outline: 'none', background: '#fff8f4' }}
              />
            </div>
            {currency !== baseCurrency && amount && exchangeRate && (
              <div style={{ textAlign: 'right', fontSize: 12, color: '#b08060', marginTop: 6 }}>
                ≈ {getCurrency(baseCurrency).symbol} {(parseFloat(amount) * exchangeRate).toFixed(0)} {baseCurrency}
              </div>
            )}
          </div>
        </div>

        {/* 誰付錢 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>誰付錢</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map(([uid, profile]) => (
              <button
                key={uid}
                onClick={() => setPaidBy(uid)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s', border: 'none',
                  background: paidBy === uid ? '#fff3ec' : '#fff8f4',
                  outline: paidBy === uid ? '1.5px solid #FF8C42' : '0.5px solid #f0d5c0',
                }}
              >
                <Avatar src={profile.avatar} name={profile.name} size={32} />
                <span style={{ fontSize: 14, color: '#3d2b1f', fontWeight: paidBy === uid ? 500 : 400, flex: 1, textAlign: 'left' }}>{profile.name}</span>
                {paidBy === uid && <span style={{ color: '#FF8C42', fontSize: 16 }}>✓</span>}
              </button>
            ))}
          </div>

          {/* 付款人不參與分攤 */}
          <button
            onClick={() => setPayerExcluded(v => !v)}
            style={{
              marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', width: '100%',
              background: payerExcluded ? '#fff3ec' : '#fff8f4',
              outline: payerExcluded ? '1.5px solid #FF8C42' : '0.5px solid #f0d5c0',
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: 4, border: payerExcluded ? 'none' : '1.5px solid #d0b09a',
              background: payerExcluded ? '#FF8C42' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {payerExcluded && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
            </div>
            <span style={{ fontSize: 13, color: payerExcluded ? '#FF6B1A' : '#b08060', fontWeight: payerExcluded ? 500 : 400 }}>
              付款人不參與分攤（純代墊）
            </span>
          </button>
        </div>

        {/* 分帳方式 */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 10 }}>分帳方式</div>

          {/* 切換按鈕 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
            {SPLIT_TYPES.map(type => (
              <button
                key={type.key}
                onClick={() => setSplitType(type.key)}
                style={{
                  padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                  background: splitType === type.key ? '#FF8C42' : '#fff3ec',
                  color: splitType === type.key ? '#fff' : '#b08060',
                }}
              >
                {type.label}
              </button>
            ))}
          </div>

          {/* 均分預覽 */}
          {splitType === 'equal' && amount && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members
                .filter(([uid]) => !payerExcluded || uid !== paidBy)
                .map(([uid, profile]) => (
                  <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar src={profile.avatar} name={profile.name} size={24} />
                    <span style={{ flex: 1, fontSize: 13, color: '#3d2b1f' }}>{profile.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#FF6B1A' }}>
                      NT$ {(parseFloat(amount) / (payerExcluded ? members.filter(([uid]) => uid !== paidBy).length : members.length)).toFixed(0)}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* 部分人分攤 */}
          {splitType === 'subset' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: '#b08060', marginBottom: 2 }}>勾選參與此項費用的成員</div>
              {members.map(([uid, profile]) => {
                const excluded = payerExcluded && uid === paidBy
                const checked = !excluded && subsetMembers[uid]
                return (
                  <button
                    key={uid}
                    onClick={() => !excluded && setSubsetMembers(prev => ({ ...prev, [uid]: !prev[uid] }))}
                    disabled={excluded}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, border: 'none', cursor: excluded ? 'default' : 'pointer', transition: 'all 0.15s',
                      background: excluded ? '#f5f5f5' : checked ? '#fff3ec' : '#fff8f4',
                      outline: checked ? '1.5px solid #FF8C42' : '0.5px solid #f0d5c0',
                      opacity: excluded ? 0.4 : 1,
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 4, border: checked ? 'none' : '1.5px solid #d0b09a',
                      background: checked ? '#FF8C42' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {checked && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
                    </div>
                    <Avatar src={profile.avatar} name={profile.name} size={24} />
                    <span style={{ flex: 1, fontSize: 13, color: '#3d2b1f', textAlign: 'left' }}>{profile.name}</span>
                    {amount && checked && (() => {
                      const eff = effectiveMembers(members)
                      return eff.length > 0 ? (
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#FF6B1A' }}>
                          NT$ {(parseFloat(amount) / eff.length).toFixed(0)}
                        </span>
                      ) : null
                    })()}
                  </button>
                )
              })}
            </div>
          )}

          {/* 依份數 */}
          {splitType === 'shares' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, color: '#b08060', marginBottom: 2 }}>輸入每人份數（例：吃兩份填 2）</div>
              {members
                .filter(([uid]) => !payerExcluded || uid !== paidBy)
                .map(([uid, profile]) => {
                  const s = parseFloat(shares[uid]) || 0
                  const amountNum = parseFloat(amount) || 0
                  return (
                    <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar src={profile.avatar} name={profile.name} size={24} />
                      <span style={{ flex: 1, fontSize: 13, color: '#3d2b1f' }}>{profile.name}</span>
                      <div style={{ position: 'relative', width: 70 }}>
                        <input
                          type="number"
                          min="0"
                          value={shares[uid]}
                          onChange={e => setShares(prev => ({ ...prev, [uid]: e.target.value }))}
                          placeholder="0"
                          style={{ width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 8, padding: '7px 8px', fontSize: 13, color: '#3d2b1f', outline: 'none', background: '#fff8f4', textAlign: 'center' }}
                        />
                      </div>
                      <span style={{ fontSize: 11, color: '#b08060', width: 16 }}>份</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#FF6B1A', width: 64, textAlign: 'right', visibility: amount ? 'visible' : 'hidden' }}>
                        {getCurrency(currency).symbol} {sharesTotal > 0 ? (s / sharesTotal * amountNum).toFixed(0) : '0'}
                      </span>
                    </div>
                  )
                })}
              <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 500, color: '#b08060' }}>
                共 {sharesTotal} 份
              </div>
            </div>
          )}

          {/* 依比例 */}
          {splitType === 'percentage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {members
                .filter(([uid]) => !payerExcluded || uid !== paidBy)
                .map(([uid, profile]) => (
                  <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar src={profile.avatar} name={profile.name} size={24} />
                    <span style={{ flex: 1, fontSize: 13, color: '#3d2b1f' }}>{profile.name}</span>
                    <div style={{ position: 'relative', width: 90 }}>
                      <input
                        type="number"
                        value={percentages[uid]}
                        onChange={e => setPercentages(prev => ({ ...prev, [uid]: e.target.value }))}
                        placeholder="0"
                        style={{ width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 8, padding: '7px 24px 7px 8px', fontSize: 13, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
                      />
                      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#b08060', fontSize: 12 }}>%</span>
                    </div>
                    {amount && percentages[uid] && (
                      <span style={{ fontSize: 12, color: '#FF6B1A', width: 60, textAlign: 'right' }}>
                        NT$ {((parseFloat(percentages[uid]) || 0) / 100 * parseFloat(amount)).toFixed(0)}
                      </span>
                    )}
                  </div>
                ))}
              <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 500, color: Math.abs(percentageTotal - 100) < 0.01 ? '#4caf50' : '#FF6B1A' }}>
                已分配 {percentageTotal.toFixed(0)}% / 100%
              </div>
            </div>
          )}

          {/* 自訂金額 */}
          {splitType === 'custom' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {members
                .filter(([uid]) => !payerExcluded || uid !== paidBy)
                .map(([uid, profile]) => (
                  <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar src={profile.avatar} name={profile.name} size={24} />
                    <span style={{ flex: 1, fontSize: 13, color: '#3d2b1f' }}>{profile.name}</span>
                    <div style={{ position: 'relative', width: 110 }}>
                      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#b08060', fontSize: 12 }}>NT$</span>
                      <input
                        type="number"
                        value={customAmounts[uid]}
                        onChange={e => setCustomAmounts(prev => ({ ...prev, [uid]: e.target.value }))}
                        placeholder="0"
                        style={{ width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 8, padding: '7px 8px 7px 34px', fontSize: 13, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
                      />
                    </div>
                  </div>
                ))}
              <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 500, color: Math.abs(customTotal - (parseFloat(amount) || 0)) < 0.01 ? '#4caf50' : '#FF6B1A' }}>
                已分配 NT$ {customTotal.toFixed(0)} / {amount || 0}
              </div>
            </div>
          )}
        </div>

        {/* 送出按鈕 */}
        <button
          onClick={handleSubmit}
          disabled={!isValid() || loading}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', fontSize: 15, fontWeight: 500, cursor: isValid() && !loading ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
            background: isValid() && !loading ? '#FF8C42' : '#e0c4b0',
            color: '#fff',
          }}
        >
          {loading ? '新增中...' : '✅ 確認新增'}
        </button>
      </div>

      <TabBar context="expense" groupId={id} />
    </div>
  )
}

export default AddExpensePage
