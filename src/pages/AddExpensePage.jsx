// /group/:id/add — 新增支出：填寫標題、時間、金額、付款人與分攤方式，可附收據，存檔後更新群組餘額與統計。
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, writeBatch, Timestamp, serverTimestamp, doc, getDoc, updateDoc, increment } from 'firebase/firestore'
import { ref, uploadBytes } from 'firebase/storage'
import { CheckCircle2 } from 'lucide-react'
import { db, storage } from '../config/firebase'
import { useApp } from '../context/AppContext'
import TabBar from '../components/TabBar'
import StickyFooter from '../components/StickyFooter'
import ExpenseForm from '../components/ExpenseForm'
import useExchangeRate from '../hooks/useExchangeRate'
import { nowStr, scrollFocusedIntoView, computeSplits, applyExchangeRate, buildPayments, payerLabel, computeMemberBalances } from '../utils/expenseHelpers'
import { getCurrency } from '../config/currencies'
import { DEFAULT_CATEGORIES, DEFAULT_INCOME_CATEGORIES, DEFAULT_SPONSOR_CATEGORIES } from '../config/expenseForm'
import { useI18n } from '../i18n/I18nProvider'
import { computeBudgetStatus } from '../utils/budget'
import useSpendMethods from '../hooks/useSpendMethods'
import { CASH } from '../utils/spendMethods'
import { buildLedgerFlex, groupLiffUrl, sendLedgerFlex } from '../utils/flexMessages'

const AddExpensePage = () => {
  const { id } = useParams()
  const { user, liffInstance } = useApp()
  const navigate = useNavigate()
  const { t, fmt } = useI18n()

  const [kind, setKind] = useState('expense')
  const [group, setGroup] = useState(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0])
  const [customCategory, setCustomCategory] = useState('')
  const [isEditingCategory, setIsEditingCategory] = useState(false)
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(user?.uid)
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
  const [expenseDate, setExpenseDate] = useState(nowStr)
  const [shareToLine, setShareToLine] = useState(false)
  const [note, setNote] = useState('')
  const [receiptFile, setReceiptFile] = useState(null)
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [spendMethod, setSpendMethod] = useState(CASH)
  const spendMethods = useSpendMethods(user?.guest ? null : user?.uid)

  const safeIsInClient = () => { try { return liffInstance?.isInClient() ?? false } catch { return false } }

  const { exchangeRate, setManualRate, rateLoading, rateError, rateManual } = useExchangeRate(currency, baseCurrency)

  useEffect(() => {
    const fetchGroup = async () => {
      const snap = await getDoc(doc(db, 'groups', id))
      if (!snap.exists()) return
      const data = { id: snap.id, ...snap.data() }
      // 非成員（例如點到群組公告的「記一筆」）先去群組頁加入
      if (!data.members?.includes(user?.uid)) {
        navigate(`/group/${id}`, { replace: true })
        return
      }
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
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const members = Object.entries(group?.memberProfiles || {})

  const sharesTotal = Object.values(shares).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const percentageTotal = Object.values(percentages).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const customTotal = Object.values(customAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const payerTotal = Object.values(payerAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)

  // 預算提示：用群組彙總欄位（頁面讀一次）；外幣在匯率就緒前不顯示；收入讓淨額減少
  const amountNum = parseFloat(amount) || 0
  const baseAmountNum = currency === baseCurrency ? amountNum : (!rateLoading && exchangeRate > 0 ? amountNum * exchangeRate : 0)
  const budgetPreview = baseAmountNum > 0
    ? kind === 'sponsorship' ? undefined : computeBudgetStatus(group?.budget, { totalAmount: group?.totalAmount, totalIncome: group?.totalIncome }, { delta: kind === 'income' ? -baseAmountNum : baseAmountNum }) ?? undefined
    : undefined

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

  const uploadReceipt = async (expenseId) => {
    if (!receiptFile) return null
    const { default: imageCompression } = await import('browser-image-compression')
    const compressed = await imageCompression(receiptFile, { maxSizeMB: 0.3, maxWidthOrHeight: 1200, useWebWorker: true })
    const ext = receiptFile.type === 'image/png' ? 'png' : 'jpg'
    const storageRef = ref(storage, `receipts/${id}/${expenseId}/${Date.now()}.${ext}`)
    const snapshot = await uploadBytes(storageRef, compressed, { contentType: compressed.type || 'image/jpeg' })
    return snapshot.ref.fullPath
  }

  const switchKind = (next) => {
    if (next === kind) return
    setKind(next)
    setCategory((next === 'sponsorship' ? DEFAULT_SPONSOR_CATEGORIES : next === 'income' ? DEFAULT_INCOME_CATEGORIES : DEFAULT_CATEGORIES)[0])
    setPayerExcluded(next === 'sponsorship') // 贊助人通常不分給自己
    setIsEditingCategory(false)
    setCustomCategory('')
  }

  const handleSubmit = async () => {
    if (!isValid()) return
    setLoading(true)
    try {
      const totalAmount = parseFloat(amount)
      const splits = computeSplits({ splitType, totalAmount, effectiveUids, allMemberEntries: members, shares, percentages, customAmounts })
      const payments = buildPayments({ multiPayer, paidBy, payerAmounts, totalAmount })
      const { rate, baseAmount, baseSplits, basePayments } = applyExchangeRate({ totalAmount, splits, payments, currency, baseCurrency, exchangeRate })

      if (kind !== 'expense') {
        const incomeBatch = writeBatch(db)
        incomeBatch.set(doc(collection(db, 'groups', id, 'incomes')), {
          title: title.trim(),
          category,
          currency,
          originalAmount: totalAmount,
          exchangeRate: rate,
          amount: baseAmount,
          received: basePayments,
          ...(kind === 'sponsorship' && { isSponsorship: true }),
          splitType,
          splits: baseSplits,
          ...(splitType === 'shares' && { shares }),
          ...(note.trim() && { note: note.trim() }),
          createdBy: user.uid,
          createdAt: Timestamp.fromDate(new Date(expenseDate)),
          hasTime: true,
          addedAt: serverTimestamp(),
        })
        const incomeDelta = computeMemberBalances([], [], [], [{ received: basePayments, splits: baseSplits }])
        const incomeBalanceDelta = {}
        Object.entries(incomeDelta).forEach(([uid, amt]) => {
          incomeBalanceDelta[`memberBalances.${uid}`] = increment(amt)
        })
        // 贊助只動餘額，不算收入（不進總收入、淨支出與預算）
        incomeBatch.update(doc(db, 'groups', id), kind === 'sponsorship' ? incomeBalanceDelta : {
          totalIncome: increment(baseAmount),
          incomeCount: increment(1),
          ...incomeBalanceDelta,
        })
        await incomeBatch.commit()
        navigate(`/group/${id}`)
        return
      }

      const batch = writeBatch(db)
      const docRef = doc(collection(db, 'groups', id, 'expenses'))
      batch.set(docRef, {
        title: title.trim(),
        category,
        currency,
        originalAmount: totalAmount,
        exchangeRate: rate,
        amount: baseAmount,
        payments: basePayments,
        paymentMethod: spendMethod,
        splitType,
        splits: baseSplits,
        ...(splitType === 'shares' && { shares }),
        ...(note.trim() && { note: note.trim() }),
        createdBy: user.uid,
        createdAt: Timestamp.fromDate(new Date(expenseDate)),
        hasTime: true,
        addedAt: serverTimestamp(),
      })

      // 付款人可能也在分攤名單內，需先合併再寫入，避免同一個 key 互相覆蓋
      const netDelta = { ...basePayments }
      Object.entries(baseSplits).forEach(([uid, amt]) => {
        netDelta[uid] = (netDelta[uid] || 0) - amt
      })
      const balanceDelta = {}
      Object.entries(netDelta).forEach(([uid, amt]) => {
        balanceDelta[`memberBalances.${uid}`] = increment(amt)
      })
      const countDelta = {}
      Object.keys(baseSplits).forEach(uid => {
        countDelta[`memberExpenseCounts.${uid}`] = increment(1)
      })
      batch.update(doc(db, 'groups', id), {
        totalAmount: increment(baseAmount),
        totalExpenses: increment(1),
        ...balanceDelta,
        ...countDelta,
      })
      await batch.commit()

      try {
        const receiptPath = await uploadReceipt(docRef.id)
        if (receiptPath) await updateDoc(docRef, { receiptPath })
      } catch (uploadErr) {
        console.error('Receipt upload failed', uploadErr)
        alert(t('add.receiptFailed', { reason: uploadErr?.code || uploadErr?.message || t('add.unknownError') }))
      }

      if (shareToLine && safeIsInClient()) {
        const payerName = payerLabel(basePayments, group.memberProfiles, t, t('common.someone'))
        const currencyObj = getCurrency(currency)
        const splitCount = effectiveUids.length
        const perPerson = splitCount > 0 ? Math.round(parseFloat(amount) / splitCount) : 0
        try {
          await sendLedgerFlex(liffInstance, buildLedgerFlex({
            altText: t('flex.alt', { payer: payerName, title: title.trim(), amount: `${currencyObj.symbol}${fmt.num(parseFloat(amount))}` }),
            headerText: t('flex.title'),
            title: title.trim(),
            amount: `${currencyObj.symbol} ${fmt.num(parseFloat(amount))}`,
            rows: [
              [t('flex.payer'), payerName],
              [t('flex.perPerson'), `${currencyObj.symbol} ${fmt.num(perPerson)}`],
              [t('flex.group'), group.name],
            ],
            openLabel: t('flex.openGroup'),
            groupUrl: groupLiffUrl(id),
          }))
        } catch (e) {
          console.warn('liff.sendMessages failed', e)
        }
      }

      navigate(`/group/${id}`)
    } catch (error) {
      console.error('Failed to add', error)
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 80 }}>
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '16px 16px 20px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(`/group/${id}`)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >‹</button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{kind === 'sponsorship' ? t('add.sponsorship') : kind === 'income' ? t('add.income') : t('add.expense')}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {[['expense', t('kind.expense')], ['income', t('kind.income')], ['sponsorship', t('kind.sponsorship')]].map(([k, label]) => (
            <button
              key={k}
              onClick={() => switchKind(k)}
              style={{
                padding: '5px 18px', borderRadius: 6, fontSize: 13, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.4)',
                background: kind === k ? 'var(--cs-on-brand)' : 'rgba(255,255,255,0.25)',
                color: kind === k ? 'var(--cs-rc-owe)' : '#fff', fontWeight: kind === k ? 500 : 400,
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      <div className="cs-body"
        onFocus={scrollFocusedIntoView}
        style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <ExpenseForm
          kind={kind}
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
          note={note} setNote={setNote}
          receiptFile={receiptFile} setReceiptFile={kind === 'expense' ? setReceiptFile : undefined}
          receiptPreview={receiptPreview} setReceiptPreview={setReceiptPreview}
          shareToLine={shareToLine} setShareToLine={setShareToLine}
          showShareOption={kind === 'expense' && safeIsInClient()}
          budgetPreview={budgetPreview}
          spendMethod={spendMethod} setSpendMethod={setSpendMethod}
          spendMethods={user?.guest ? undefined : spendMethods ?? []}
        />

        {/* 固定在底部導覽列上方，捲動時一直可見 */}
        <StickyFooter>
          <button
            onClick={handleSubmit}
            disabled={!isValid() || loading}
            style={{
              width: '100%', padding: '15px 0', borderRadius: 6, border: 'none', fontSize: 15, fontWeight: 500,
              cursor: isValid() && !loading ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
              background: isValid() && !loading ? 'var(--cs-rc-stamp)' : 'var(--cs-line-soft)', color: 'var(--cs-rc-stamp-text)',
            }}
          >
            {loading ? t('add.submitting') : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} /> {t('add.submit')}
              </span>
            )}
          </button>
        </StickyFooter>
      </div>

      <TabBar context="expense" groupId={id} />
    </div>
  )
}

export default AddExpensePage
