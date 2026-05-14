import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, addDoc, Timestamp, doc, getDoc, updateDoc, increment } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../config/firebase'
import { useApp } from '../context/AppContext'
import TabBar from '../components/TabBar'
import ExpenseForm from '../components/ExpenseForm'
import useExchangeRate from '../hooks/useExchangeRate'
import { todayStr, computeSplits, applyExchangeRate } from '../utils/expenseHelpers'
import { getCurrency } from '../config/currencies'
import imageCompression from 'browser-image-compression'

const AddExpensePage = () => {
  const { id } = useParams()
  const { user, liffInstance } = useApp()
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
  const [currency, setCurrency] = useState('TWD')
  const [baseCurrency, setBaseCurrency] = useState('TWD')
  const [expenseDate, setExpenseDate] = useState(todayStr)
  const [shareToLine, setShareToLine] = useState(false)
  const [receiptFile, setReceiptFile] = useState(null)
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [loading, setLoading] = useState(false)

  const safeIsInClient = () => { try { return liffInstance?.isInClient() ?? false } catch { return false } }

  const { exchangeRate, setExchangeRate, rateLoading } = useExchangeRate(currency, baseCurrency)

  useEffect(() => {
    const fetchGroup = async () => {
      const snap = await getDoc(doc(db, 'groups', id))
      if (!snap.exists()) return
      const data = { id: snap.id, ...snap.data() }
      setGroup(data)
      const base = data.baseCurrency || 'TWD'
      setBaseCurrency(base)
      setCurrency(base)
      const initEmpty = {}
      data.members.forEach(uid => { initEmpty[uid] = '' })
      setCustomAmounts({ ...initEmpty })
      setPercentages({ ...initEmpty })
      const sharesInit = {}
      data.members.forEach(uid => { sharesInit[uid] = '1' })
      setShares(sharesInit)
      const subsetInit = {}
      data.members.forEach(uid => { subsetInit[uid] = true })
      setSubsetMembers(subsetInit)
    }
    fetchGroup()
  }, [id])

  const members = Object.entries(group?.memberProfiles || {})

  const sharesTotal = Object.values(shares).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const percentageTotal = Object.values(percentages).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const customTotal = Object.values(customAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)

  const effectiveUids = (() => {
    let uids = members.map(([uid]) => uid)
    if (splitType === 'subset') uids = uids.filter(uid => subsetMembers[uid])
    if (payerExcluded) uids = uids.filter(uid => uid !== paidBy)
    return uids
  })()

  const isValid = () => {
    if (!title.trim()) return false
    if (!amount || parseFloat(amount) <= 0) return false
    if (splitType === 'custom' && Math.abs(customTotal - parseFloat(amount)) > 0.01) return false
    if (splitType === 'percentage' && Math.abs(percentageTotal - 100) > 0.01) return false
    if (splitType === 'subset') {
      const selected = Object.values(subsetMembers).filter(Boolean).length
      if (selected < 1) return false
      if (payerExcluded && selected === 1 && subsetMembers[paidBy]) return false
    }
    if (splitType === 'shares' && sharesTotal <= 0) return false
    return true
  }

  const uploadReceipt = async (expenseId) => {
    if (!receiptFile) return null
    const compressed = await imageCompression(receiptFile, { maxSizeMB: 0.3, maxWidthOrHeight: 1200, useWebWorker: true })
    const ext = receiptFile.type === 'image/png' ? 'png' : 'jpg'
    const storageRef = ref(storage, `receipts/${id}/${expenseId}/${Date.now()}.${ext}`)
    const snapshot = await uploadBytes(storageRef, compressed, { contentType: compressed.type || 'image/jpeg' })
    return getDownloadURL(snapshot.ref)
  }

  const handleSubmit = async () => {
    if (!isValid()) return
    setLoading(true)
    try {
      const totalAmount = parseFloat(amount)
      const splits = computeSplits({ splitType, totalAmount, effectiveUids, allMemberEntries: members, shares, percentages, customAmounts })
      const { rate, baseAmount, baseSplits } = applyExchangeRate({ totalAmount, splits, currency, baseCurrency, exchangeRate })

      const docRef = await addDoc(collection(db, 'groups', id, 'expenses'), {
        title: title.trim(),
        category,
        currency,
        originalAmount: totalAmount,
        exchangeRate: rate,
        amount: baseAmount,
        paidBy,
        payerExcluded,
        splitType,
        splits: baseSplits,
        ...(splitType === 'shares' && { shares }),
        createdBy: user.uid,
        createdAt: Timestamp.fromDate(new Date(expenseDate)),
      })

      try {
        const receiptUrl = await uploadReceipt(docRef.id)
        if (receiptUrl) await updateDoc(docRef, { receiptUrl })
      } catch (uploadErr) {
        console.error('收據上傳失敗', uploadErr)
        alert('支出已儲存，但收據上傳失敗：' + (uploadErr?.code || uploadErr?.message || '未知錯誤'))
      }

      const balanceDelta = {}
      balanceDelta[`memberBalances.${paidBy}`] = increment(baseAmount)
      Object.entries(baseSplits).forEach(([uid, amt]) => {
        balanceDelta[`memberBalances.${uid}`] = increment(-amt)
      })
      await updateDoc(doc(db, 'groups', id), {
        totalAmount: increment(baseAmount),
        totalExpenses: increment(1),
        ...balanceDelta,
      })

      if (shareToLine && safeIsInClient()) {
        const payerName = group.memberProfiles?.[paidBy]?.name || '某人'
        const currencyObj = getCurrency(currency)
        const splitCount = effectiveUids.length
        const perPerson = splitCount > 0 ? Math.round(parseFloat(amount) / splitCount) : 0
        try {
          await liffInstance.sendMessages([{
            type: 'flex',
            altText: `${payerName} 新增了一筆支出：${title.trim()} ${currencyObj.symbol}${parseFloat(amount).toLocaleString()}`,
            contents: {
              type: 'bubble',
              size: 'kilo',
              header: {
                type: 'box', layout: 'vertical', paddingAll: '16px',
                backgroundColor: '#FF8C42',
                contents: [{
                  type: 'text', text: '🐱 CatSplit 新增支出', color: '#ffffff', size: 'sm', weight: 'bold',
                }],
              },
              body: {
                type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px',
                contents: [
                  { type: 'text', text: title.trim(), weight: 'bold', size: 'lg', color: '#3d2b1f', wrap: true },
                  { type: 'text', text: `${currencyObj.symbol} ${parseFloat(amount).toLocaleString()}`, size: 'xxl', weight: 'bold', color: '#FF6B1A' },
                  { type: 'separator', margin: 'md' },
                  {
                    type: 'box', layout: 'horizontal', margin: 'md',
                    contents: [
                      { type: 'text', text: '付款人', size: 'sm', color: '#b08060', flex: 1 },
                      { type: 'text', text: payerName, size: 'sm', color: '#3d2b1f', align: 'end' },
                    ],
                  },
                  {
                    type: 'box', layout: 'horizontal',
                    contents: [
                      { type: 'text', text: '每人分攤', size: 'sm', color: '#b08060', flex: 1 },
                      { type: 'text', text: `${currencyObj.symbol} ${perPerson.toLocaleString()}`, size: 'sm', color: '#3d2b1f', align: 'end' },
                    ],
                  },
                  {
                    type: 'box', layout: 'horizontal',
                    contents: [
                      { type: 'text', text: '群組', size: 'sm', color: '#b08060', flex: 1 },
                      { type: 'text', text: `${group.emoji || '🐱'} ${group.name}`, size: 'sm', color: '#3d2b1f', align: 'end' },
                    ],
                  },
                ],
              },
            },
          }])
        } catch (e) {
          console.warn('liff.sendMessages 失敗', e)
        }
      }

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

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', paddingBottom: 80 }}>
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: 10, bottom: -10, fontSize: 64, opacity: 0.12, userSelect: 'none' }}>🐾</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(`/group/${id}`)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >‹</button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>新增支出</div>
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ExpenseForm
          title={title} setTitle={setTitle}
          category={category} setCategory={setCategory}
          customCategory={customCategory} setCustomCategory={setCustomCategory}
          isEditingCategory={isEditingCategory} setIsEditingCategory={setIsEditingCategory}
          expenseDate={expenseDate} setExpenseDate={setExpenseDate}
          currency={currency} setCurrency={setCurrency}
          exchangeRate={exchangeRate} setExchangeRate={setExchangeRate}
          rateLoading={rateLoading}
          baseCurrency={baseCurrency}
          amount={amount} setAmount={setAmount}
          paidBy={paidBy} setPaidBy={setPaidBy}
          payerExcluded={payerExcluded} setPayerExcluded={setPayerExcluded}
          splitType={splitType} setSplitType={setSplitType}
          subsetMembers={subsetMembers} setSubsetMembers={setSubsetMembers}
          shares={shares} setShares={setShares}
          percentages={percentages} setPercentages={setPercentages}
          customAmounts={customAmounts} setCustomAmounts={setCustomAmounts}
          members={members}
          sharesTotal={sharesTotal}
          percentageTotal={percentageTotal}
          customTotal={customTotal}
          effectiveUids={effectiveUids}
          receiptFile={receiptFile} setReceiptFile={setReceiptFile}
          receiptPreview={receiptPreview} setReceiptPreview={setReceiptPreview}
          shareToLine={shareToLine} setShareToLine={setShareToLine}
          showShareOption={safeIsInClient()}
        />

        <button
          onClick={handleSubmit}
          disabled={!isValid() || loading}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', fontSize: 15, fontWeight: 500,
            cursor: isValid() && !loading ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
            background: isValid() && !loading ? '#FF8C42' : '#e0c4b0', color: '#fff',
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
