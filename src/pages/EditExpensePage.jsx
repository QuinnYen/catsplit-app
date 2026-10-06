// /group/:id/expense/:expenseId/edit — 編輯或刪除單筆支出，並重新計算群組餘額與統計。
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, collection, getDoc, getDocs, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes } from 'firebase/storage'
import { CheckCircle2, Trash2 } from 'lucide-react'
import { db, storage } from '../config/firebase'
import TabBar from '../components/TabBar'
import StickyFooter from '../components/StickyFooter'
import ExpenseForm from '../components/ExpenseForm'
import { DEFAULT_CATEGORIES } from '../config/expenseForm'
import PawDecor from '../components/PawDecor'
import useExchangeRate from '../hooks/useExchangeRate'
import { toLocalDateTimeStr, scrollFocusedIntoView, computeSplits, applyExchangeRate, computeMemberBalances, computeMemberExpenseCounts, buildPayments, primaryPayer } from '../utils/expenseHelpers'
import { deleteFileByPath } from '../utils/storageCleanup'

const EditExpensePage = () => {
  const { id, expenseId } = useParams()
  const navigate = useNavigate()

  const [group, setGroup] = useState(null)
  const [originalExpense, setOriginalExpense] = useState(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('餐飲')
  const [customCategory, setCustomCategory] = useState('')
  const [isEditingCategory, setIsEditingCategory] = useState(false)
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [multiPayer, setMultiPayer] = useState(false)
  const [payerAmounts, setPayerAmounts] = useState({})
  const [payerExcluded, setPayerExcluded] = useState(false)
  const [splitType, setSplitType] = useState('equal')
  const [customAmounts, setCustomAmounts] = useState({})
  const [percentages, setPercentages] = useState({})
  const [shares, setShares] = useState({})
  const [subsetMembers, setSubsetMembers] = useState({})
  const [currency, setCurrency] = useState('TWD')
  const [baseCurrency, setBaseCurrency] = useState('TWD')
  const [expenseDate, setExpenseDate] = useState('')
  const [receiptFile, setReceiptFile] = useState(null)
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [existingReceiptPath, setExistingReceiptPath] = useState(null)
  const [removeExistingReceipt, setRemoveExistingReceipt] = useState(false)
  const [loading, setLoading] = useState(false)

  const [savedRate, setSavedRate] = useState(null)

  const { exchangeRate, setManualRate, rateLoading, rateError, rateManual } = useExchangeRate(currency, baseCurrency, savedRate)

  useEffect(() => {
    const fetchData = async () => {
      const [groupSnap, expenseSnap] = await Promise.all([
        getDoc(doc(db, 'groups', id)),
        getDoc(doc(db, 'groups', id, 'expenses', expenseId)),
      ])
      if (!groupSnap.exists() || !expenseSnap.exists()) return

      const groupData = { id: groupSnap.id, ...groupSnap.data() }
      const expense = { id: expenseSnap.id, ...expenseSnap.data() }
      setGroup(groupData)
      setOriginalExpense(expense)

      const base = groupData.baseCurrency || 'TWD'
      setBaseCurrency(base)
      if (expense.receiptPath) setExistingReceiptPath(expense.receiptPath)
      setTitle(expense.title)
      setAmount(String(expense.originalAmount ?? expense.amount))
      setCurrency(expense.currency || base)
      setSavedRate({ currency: expense.currency || base, rate: expense.exchangeRate ?? 1 })
      const payments = expense.payments || {}
      const payerUids = Object.keys(payments)
      const rate = expense.exchangeRate ?? 1
      if (payerUids.length > 1) {
        setMultiPayer(true)
        setPayerAmounts(Object.fromEntries(payerUids.map(uid => [uid, String(parseFloat((payments[uid] / rate).toFixed(2)))])))
        setPaidBy(primaryPayer(payments))
      } else {
        setPaidBy(payerUids[0])
        // 單一付款人沒有分到錢，代表當初勾了「不參與分攤」
        setPayerExcluded(!(expense.splits?.[payerUids[0]] > 0))
      }
      setSplitType(expense.splitType || 'equal')

      const dateTs = expense.createdAt?.toDate?.()
      setExpenseDate(toLocalDateTimeStr(dateTs ?? new Date()))

      const isCustomCat = !DEFAULT_CATEGORIES.includes(expense.category)
      if (isCustomCat) {
        setIsEditingCategory(true)
        setCustomCategory(expense.category || '')
        setCategory(expense.category || '')
      } else {
        setCategory(expense.category || '餐飲')
      }

      const initEmpty = {}
      groupData.members.forEach(uid => { initEmpty[uid] = '' })
      const initShares = {}
      groupData.members.forEach(uid => { initShares[uid] = '1' })
      const initSubset = {}
      groupData.members.forEach(uid => { initSubset[uid] = true })

      const existingSplits = expense.splits || {}
      const existingRate = expense.exchangeRate ?? 1

      if (expense.splitType === 'custom') {
        const customInit = {}
        groupData.members.forEach(uid => {
          const baseAmt = existingSplits[uid] || 0
          customInit[uid] = existingRate > 0 ? String(parseFloat((baseAmt / existingRate).toFixed(2))) : ''
        })
        setCustomAmounts(customInit)
      } else {
        setCustomAmounts({ ...initEmpty })
      }

      if (expense.splitType === 'shares' && expense.shares) {
        const sharesInit = {}
        groupData.members.forEach(uid => { sharesInit[uid] = String(expense.shares[uid] ?? '1') })
        setShares(sharesInit)
      } else {
        setShares(initShares)
      }

      setPercentages({ ...initEmpty })

      if (expense.splitType === 'subset') {
        const subsetInit = {}
        groupData.members.forEach(uid => { subsetInit[uid] = uid in existingSplits })
        setSubsetMembers(subsetInit)
      } else {
        setSubsetMembers(initSubset)
      }
    }
    fetchData()
  }, [id, expenseId])

  const members = Object.entries(group?.memberProfiles || {})

  const sharesTotal = Object.values(shares).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const percentageTotal = Object.values(percentages).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const customTotal = Object.values(customAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const payerTotal = Object.values(payerAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)

  const effectiveUids = (() => {
    let uids = members.map(([uid]) => uid)
    if (splitType === 'subset') uids = uids.filter(uid => subsetMembers[uid])
    if (payerExcluded) uids = uids.filter(uid => uid !== paidBy)
    return uids
  })()

  const isValid = () => {
    if (!title.trim()) return false
    if (!expenseDate) return false
    if (!amount || parseFloat(amount) <= 0) return false
    if (currency !== baseCurrency && (rateLoading || !(exchangeRate > 0))) return false
    if (multiPayer && Math.abs(payerTotal - parseFloat(amount)) > 0.01) return false
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

  const recomputeAndSaveBalances = async () => {
    const [expSnap, setSnap] = await Promise.all([
      getDocs(collection(db, 'groups', id, 'expenses')),
      getDocs(collection(db, 'groups', id, 'settlements')),
    ])
    const memberBalances = computeMemberBalances(group.members, expSnap.docs, setSnap.docs)
    const totalAmount = expSnap.docs.reduce((sum, d) => sum + d.data().amount, 0)
    const memberExpenseCounts = computeMemberExpenseCounts(expSnap.docs)
    await updateDoc(doc(db, 'groups', id), { totalAmount, totalExpenses: expSnap.size, memberBalances, memberExpenseCounts })
  }

  const handleReceiptUpdate = async () => {
    if (receiptFile) {
      const { default: imageCompression } = await import('browser-image-compression')
      const compressed = await imageCompression(receiptFile, { maxSizeMB: 0.3, maxWidthOrHeight: 1200, useWebWorker: true })
      const ext = receiptFile.type === 'image/png' ? 'png' : 'jpg'
      const storageRef = ref(storage, `receipts/${id}/${expenseId}/${Date.now()}.${ext}`)
      const snapshot = await uploadBytes(storageRef, compressed, { contentType: compressed.type || 'image/jpeg' })
      await deleteFileByPath(existingReceiptPath)
      return { receiptPath: snapshot.ref.fullPath }
    }
    if (removeExistingReceipt && existingReceiptPath) {
      await deleteFileByPath(existingReceiptPath)
      return { receiptPath: null }
    }
    return {}
  }

  const handleSave = async () => {
    if (!isValid() || !originalExpense) return
    setLoading(true)
    try {
      const totalAmount = parseFloat(amount)
      const splits = computeSplits({ splitType, totalAmount, effectiveUids, allMemberEntries: members, shares, percentages, customAmounts })
      const payments = buildPayments({ multiPayer, paidBy, payerAmounts, totalAmount })
      const { rate, baseAmount, baseSplits, basePayments } = applyExchangeRate({ totalAmount, splits, payments, currency, baseCurrency, exchangeRate })

      const receiptUpdate = await handleReceiptUpdate()
      await updateDoc(doc(db, 'groups', id, 'expenses', expenseId), {
        title: title.trim(),
        category,
        currency,
        originalAmount: totalAmount,
        exchangeRate: rate,
        amount: baseAmount,
        payments: basePayments,
        splitType,
        splits: baseSplits,
        ...(splitType === 'shares' && { shares }),
        createdAt: Timestamp.fromDate(new Date(expenseDate)),
        hasTime: true,
        ...receiptUpdate,
      })

      await recomputeAndSaveBalances()
      navigate(`/group/${id}`)
    } catch (error) {
      console.error('儲存失敗', error)
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('確定要刪除這筆支出嗎？')) return
    setLoading(true)
    try {
      await deleteDoc(doc(db, 'groups', id, 'expenses', expenseId))
      await deleteFileByPath(existingReceiptPath)
      await recomputeAndSaveBalances()
      navigate(`/group/${id}`)
    } catch (error) {
      console.error('刪除失敗', error)
      setLoading(false)
    }
  }

  if (!group || !originalExpense) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff8f4', color: '#b08060' }}>
        載入中...
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', paddingBottom: 80 }}>
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <PawDecor />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(`/group/${id}/expense/${expenseId}`)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >‹</button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>編輯支出</div>
        </div>
      </div>

      <div
        onFocus={scrollFocusedIntoView}
        style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <ExpenseForm
          title={title} setTitle={setTitle}
          category={category} setCategory={setCategory}
          customCategory={customCategory} setCustomCategory={setCustomCategory}
          isEditingCategory={isEditingCategory} setIsEditingCategory={setIsEditingCategory}
          expenseDate={expenseDate} setExpenseDate={setExpenseDate}
          currency={currency} setCurrency={setCurrency}
          exchangeRate={exchangeRate} setExchangeRate={setManualRate}
          rateLoading={rateLoading} rateError={rateError} rateManual={rateManual}
          baseCurrency={baseCurrency}
          amount={amount} setAmount={setAmount}
          paidBy={paidBy} setPaidBy={setPaidBy}
          multiPayer={multiPayer} setMultiPayer={setMultiPayer}
          payerAmounts={payerAmounts} setPayerAmounts={setPayerAmounts}
          payerTotal={payerTotal}
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
          existingReceiptPath={existingReceiptPath}
          removeExistingReceipt={removeExistingReceipt} setRemoveExistingReceipt={setRemoveExistingReceipt}
        />

        {/* 固定在底部導覽列上方，捲動時一直可見；捲到底時回到原位，刪除按鈕在它下方 */}
        <StickyFooter>
          <button
            onClick={handleSave}
            disabled={!isValid() || loading}
            style={{
              width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', fontSize: 15, fontWeight: 500,
              cursor: isValid() && !loading ? 'pointer' : 'not-allowed',
              background: isValid() && !loading ? '#FF8C42' : '#e0c4b0', color: '#fff',
            }}
          >
            {loading ? '儲存中...' : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} /> 儲存變更
              </span>
            )}
          </button>
        </StickyFooter>

        <button
          onClick={handleDelete}
          disabled={loading}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 16, border: '0.5px solid #ffb3a7', fontSize: 15, fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            background: '#fff', color: '#e53935',
          }}
        >
          {loading ? '處理中...' : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Trash2 size={16} /> 刪除此筆支出
            </span>
          )}
        </button>
      </div>

      <TabBar context="expense" groupId={id} />
    </div>
  )
}

export default EditExpensePage
