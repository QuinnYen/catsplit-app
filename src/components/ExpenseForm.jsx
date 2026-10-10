import { useState } from 'react'
import { Check, Camera, ChevronDown, Calculator } from 'lucide-react'
import ShareToLineToggle from './ShareToLineToggle'
import Avatar from './Avatar'
import DateTimeField from './DateTimeField'
import CalculatorModal from './CalculatorModal'
import { CURRENCIES, getCurrency } from '../config/currencies'
import { useStorageImage } from '../hooks/useStorageImage'
import { useI18n } from '../i18n/I18nProvider'
import { categoryLabel, normalizeCategory } from '../i18n/legacy'
import { DEFAULT_CATEGORIES, DEFAULT_INCOME_CATEGORIES, SPLIT_TYPES } from '../config/expenseForm'

const inputStyle = {
  width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10,
  padding: '10px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4',
}

const CUSTOM_OPTION = '__custom'

const cardStyle ={ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }
const labelStyle = { fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 8 }
const chipActiveStyle = { background: '#FF8C42', color: '#fff', fontWeight: 500 }
const chipIdleStyle = { background: '#fff3ec', color: '#b08060', fontWeight: 400 }

const Checkbox = ({ checked }) => (
  <div style={{
    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
    border: checked ? 'none' : '1.5px solid #d0b09a',
    background: checked ? '#FF8C42' : 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    {checked && <Check size={12} color="#fff" strokeWidth={3} />}
  </div>
)

// 與 kind 有關的字串 key 集中在這裡（用 t(L.xxx) 取字）
const LABELS = {
  expense: {
    titlePlaceholder: 'form.expense.titlePlaceholder',
    payerTitle: 'form.expense.payerTitle',
    payerPlaceholder: 'form.expense.payerPlaceholder',
    multiPayer: 'form.expense.multiPayer',
    multiPayerHint: 'form.expense.multiPayerHint',
    excludeLabel: 'form.expense.excludeLabel',
    subsetHint: 'form.expense.subsetHint',
  },
  income: {
    titlePlaceholder: 'form.income.titlePlaceholder',
    payerTitle: 'form.income.payerTitle',
    payerPlaceholder: 'form.income.payerPlaceholder',
    multiPayer: 'form.income.multiPayer',
    multiPayerHint: 'form.income.multiPayerHint',
    excludeLabel: 'form.income.excludeLabel',
    subsetHint: 'form.income.subsetHint',
  },
}

const PayerSelect = ({ members, value, onChange, placeholder }) => {
  const [open, setOpen] = useState(false)
  const current = members.find(([uid]) => uid === value)?.[1]
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12, cursor: 'pointer', border: 'none',
          background: '#fff3ec', outline: '1.5px solid #FF8C42',
        }}
      >
        <Avatar src={current?.avatar} name={current?.name} size={28} />
        <span style={{ fontSize: 14, color: '#3d2b1f', fontWeight: 500, flex: 1, textAlign: 'left' }}>{current?.name || placeholder}</span>
        <ChevronDown size={16} color="#FF8C42" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 11, maxHeight: 240, overflowY: 'auto',
            background: '#fff', borderRadius: 12, border: '0.5px solid #f0d5c0', boxShadow: '0 4px 16px rgba(255,140,66,0.18)', padding: 4,
          }}>
            {members.map(([uid, profile]) => (
              <button
                key={uid}
                onClick={() => { onChange(uid); setOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: 'none',
                  background: value === uid ? '#fff3ec' : 'transparent',
                }}
              >
                <Avatar src={profile.avatar} name={profile.name} size={28} />
                <span style={{ fontSize: 14, color: '#3d2b1f', fontWeight: value === uid ? 500 : 400, flex: 1, textAlign: 'left' }}>{profile.name}</span>
                {value === uid && <Check size={16} color="#FF8C42" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const ExpenseForm = ({
  kind = 'expense',
  // 欄位值
  title, setTitle,
  category, setCategory,
  customCategory, setCustomCategory,
  isEditingCategory, setIsEditingCategory,
  expenseDate, setExpenseDate,
  currency, setCurrency,
  exchangeRate, setExchangeRate,
  rateLoading, rateError, rateManual,
  baseCurrency,
  amount, setAmount,
  paidBy, setPaidBy,
  multiPayer, setMultiPayer,
  payerAmounts, setPayerAmounts,
  payerTotal,
  payerExcluded, setPayerExcluded,
  splitType, setSplitType,
  subsetMembers, setSubsetMembers,
  shares, setShares,
  percentages, setPercentages,
  customAmounts, setCustomAmounts,
  // 群組成員 entries: [[uid, profile], ...]
  members,
  // 衍生值（由父層計算傳入）
  sharesTotal,
  percentageTotal,
  customTotal,
  effectiveUids,
  // 收據圖片
  setReceiptFile,
  receiptPreview, setReceiptPreview,
  existingReceiptPath,
  removeExistingReceipt, setRemoveExistingReceipt,
  // LINE 分享（僅 AddExpensePage 傳入）
  shareToLine, setShareToLine,
  showShareOption,
}) => {
  const { t } = useI18n()
  const [showCalc, setShowCalc] = useState(false)
  const L = LABELS[kind]
  const categories = kind === 'income' ? DEFAULT_INCOME_CATEGORIES : DEFAULT_CATEGORIES
  const amountNum = parseFloat(amount) || 0
  const existingReceiptUrl = useStorageImage(existingReceiptPath)

  return (
    <>
      {/* 日期與時間 */}
      <div style={cardStyle}>
        <DateTimeField value={expenseDate} onChange={setExpenseDate} />
      </div>

      {/* 名稱 / 類別 / 貨幣 / 金額 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={labelStyle}>{t('form.category')}</div>
            <select
              value={isEditingCategory ? CUSTOM_OPTION : normalizeCategory(category)}
              onChange={e => {
                if (e.target.value === CUSTOM_OPTION) {
                  setIsEditingCategory(true)
                } else {
                  setCategory(e.target.value)
                  setIsEditingCategory(false)
                }
              }}
              style={inputStyle}
            >
              {categories.map(c => <option key={c} value={c}>{categoryLabel(c, t)}</option>)}
              <option value={CUSTOM_OPTION}>{t('form.custom')}</option>
            </select>
          </div>
          <div style={{ flex: 2, minWidth: 0 }}>
            <div style={labelStyle}>{t('form.itemName')}</div>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t(L.titlePlaceholder)}
              maxLength={20}
              style={inputStyle}
            />
          </div>
        </div>
        {isEditingCategory && (
          <input
            type="text"
            value={customCategory}
            onChange={e => { setCustomCategory(e.target.value); setCategory(e.target.value) }}
            placeholder={t('form.customCategoryPlaceholder')}
            maxLength={10}
            autoFocus
            style={{ ...inputStyle, border: '0.5px solid #FF8C42', marginTop: 10 }}
          />
        )}

        <div style={{ marginTop: 12 }}>
          <div style={labelStyle}>{t('form.amount')}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inputStyle, height: '100%' }}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
            <div style={{ flex: 2, minWidth: 0, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#b08060', fontSize: 13 }}>
                {getCurrency(currency).symbol}
              </span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                style={{ ...inputStyle, padding: '10px 40px 10px 44px', fontSize: 20, fontWeight: 500, color: '#FF6B1A' }}
              />
              <button
                type="button"
                onClick={() => setShowCalc(true)}
                aria-label={t('form.calculator')}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', padding: 4, cursor: 'pointer', display: 'flex' }}
              >
                <Calculator size={20} color="#FF8C42" />
              </button>
            </div>
          </div>
          {showCalc && (
            <CalculatorModal
              initial={amount}
              onConfirm={v => { setAmount(v); setShowCalc(false) }}
              onClose={() => setShowCalc(false)}
            />
          )}
          {currency !== baseCurrency && amount && exchangeRate && (
            <div style={{ textAlign: 'right', fontSize: 12, color: '#b08060', marginTop: 6 }}>
              ≈ {getCurrency(baseCurrency).symbol} {(amountNum * exchangeRate).toFixed(0)} {baseCurrency}
            </div>
          )}
        </div>

        {currency !== baseCurrency && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: '#fff8f4', border: '0.5px solid #f0d5c0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#b08060' }}>{t('form.rate', { currency })}</span>
              {rateLoading ? (
                <span style={{ fontSize: 12, color: '#c4a882' }}>{t('form.rateLoading')}</span>
              ) : (
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={exchangeRate ?? ''}
                  onChange={e => setExchangeRate(parseFloat(e.target.value) || null)}
                  placeholder={t('form.rateEnter')}
                  style={{ width: 100, border: `0.5px solid ${rateError ? '#e05a4f' : '#FF8C42'}`, borderRadius: 8, padding: '6px 8px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff' }}
                />
              )}
              <span style={{ fontSize: 12, color: '#b08060' }}>{baseCurrency}</span>
            </div>
            {!rateLoading && (
              <div style={{ marginTop: 6, fontSize: 11, color: rateError ? '#e05a4f' : '#c4a882' }}>
                {rateError
                  ? t('form.rateError')
                  : rateManual
                    ? t('form.rateManual')
                    : t('form.rateAuto')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 誰付錢 */}
      <div style={cardStyle}>
        <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t(L.payerTitle)}</span>
          <button
            onClick={() => { setMultiPayer(v => !v); setPayerExcluded(false) }}
            style={{
              padding: '3px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12,
              ...(multiPayer ? chipActiveStyle : chipIdleStyle),
            }}
          >
            {t(L.multiPayer)}
          </button>
        </div>
        {multiPayer ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: '#b08060', marginBottom: 2 }}>{t(L.multiPayerHint)}</div>
            {members.map(([uid, profile]) => (
              <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar src={profile.avatar} name={profile.name} size={24} />
                <span style={{ flex: 1, fontSize: 13, color: '#3d2b1f' }}>{profile.name}</span>
                <div style={{ position: 'relative', width: 110 }}>
                  <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#b08060', fontSize: 12 }}>
                    {getCurrency(currency).symbol}
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={payerAmounts[uid] ?? ''}
                    onChange={e => setPayerAmounts(prev => ({ ...prev, [uid]: e.target.value }))}
                    placeholder="0"
                    style={{ width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 8, padding: '7px 8px 7px 34px', fontSize: 13, color: '#3d2b1f', outline: 'none', background: '#fff8f4' }}
                  />
                </div>
              </div>
            ))}
            <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 500, color: Math.abs(payerTotal - amountNum) < 0.01 ? '#4caf50' : '#FF6B1A' }}>
              {t('form.paidSum', { symbol: getCurrency(currency).symbol, paid: payerTotal.toFixed(0), total: amount || 0 })}
            </div>
          </div>
        ) : (
          <>
            <PayerSelect members={members} value={paidBy} onChange={setPaidBy} placeholder={t(L.payerPlaceholder)} />
            <button
              onClick={() => setPayerExcluded(v => !v)}
              style={{
                marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', width: '100%',
                background: payerExcluded ? '#fff3ec' : '#fff8f4',
                outline: payerExcluded ? '1.5px solid #FF8C42' : '0.5px solid #f0d5c0',
              }}
            >
              <Checkbox checked={payerExcluded} />
              <span style={{ fontSize: 13, color: payerExcluded ? '#FF6B1A' : '#b08060', fontWeight: payerExcluded ? 500 : 400 }}>
                {t(L.excludeLabel)}
              </span>
            </button>
          </>
        )}
      </div>

      {/* 分帳方式 */}
      <div style={cardStyle}>
        <div style={labelStyle}>{t('form.splitMethod')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 12 }}>
          {SPLIT_TYPES.map(type => (
            <button
              key={type.key}
              onClick={() => setSplitType(type.key)}
              style={{
                padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                ...(splitType === type.key ? chipActiveStyle : chipIdleStyle),
              }}
            >
              {t(type.labelKey)}
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
                    {getCurrency(currency).symbol} {effectiveUids.length > 0 ? (amountNum / effectiveUids.length).toFixed(0) : '0'}
                  </span>
                </div>
              ))}
          </div>
        )}

        {/* 部分人分攤 */}
        {splitType === 'subset' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#b08060', marginBottom: 2 }}>{t(L.subsetHint)}</div>
            {members.map(([uid, profile]) => {
              const excluded = payerExcluded && uid === paidBy
              const checked = !excluded && subsetMembers[uid]
              return (
                <button
                  key={uid}
                  onClick={() => !excluded && setSubsetMembers(prev => ({ ...prev, [uid]: !prev[uid] }))}
                  disabled={excluded}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, border: 'none',
                    cursor: excluded ? 'default' : 'pointer', transition: 'all 0.15s',
                    background: excluded ? '#f5f5f5' : checked ? '#fff3ec' : '#fff8f4',
                    outline: checked ? '1.5px solid #FF8C42' : '0.5px solid #f0d5c0',
                    opacity: excluded ? 0.4 : 1,
                  }}
                >
                  <Checkbox checked={checked} />
                  <Avatar src={profile.avatar} name={profile.name} size={24} />
                  <span style={{ flex: 1, fontSize: 13, color: '#3d2b1f', textAlign: 'left' }}>{profile.name}</span>
                  {amount && checked && effectiveUids.length > 0 && (
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#FF6B1A' }}>
                      {getCurrency(currency).symbol} {(amountNum / effectiveUids.length).toFixed(0)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* 依份數 */}
        {splitType === 'shares' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: '#b08060', marginBottom: 2 }}>{t('form.sharesHint')}</div>
            {members
              .filter(([uid]) => !payerExcluded || uid !== paidBy)
              .map(([uid, profile]) => {
                const s = parseFloat(shares[uid]) || 0
                return (
                  <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar src={profile.avatar} name={profile.name} size={24} />
                    <span style={{ flex: 1, fontSize: 13, color: '#3d2b1f' }}>{profile.name}</span>
                    <input
                      type="number"
                      min="0"
                      value={shares[uid]}
                      onChange={e => setShares(prev => ({ ...prev, [uid]: e.target.value }))}
                      placeholder="0"
                      style={{ width: 70, border: '0.5px solid #f0d5c0', borderRadius: 8, padding: '7px 8px', fontSize: 13, color: '#3d2b1f', outline: 'none', background: '#fff8f4', textAlign: 'center' }}
                    />
                    <span style={{ fontSize: 11, color: '#b08060', width: 16 }}>{t('form.shareUnit')}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#FF6B1A', width: 64, textAlign: 'right', visibility: amount ? 'visible' : 'hidden' }}>
                      {getCurrency(currency).symbol} {sharesTotal > 0 ? (s / sharesTotal * amountNum).toFixed(0) : '0'}
                    </span>
                  </div>
                )
              })}
            <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 500, color: '#b08060' }}>
              {t('form.sharesTotal', { n: sharesTotal })}
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
                      {getCurrency(currency).symbol} {((parseFloat(percentages[uid]) || 0) / 100 * amountNum).toFixed(0)}
                    </span>
                  )}
                </div>
              ))}
            <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 500, color: Math.abs(percentageTotal - 100) < 0.01 ? '#4caf50' : '#FF6B1A' }}>
              {t('form.allocatedPercent', { p: percentageTotal.toFixed(0) })}
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
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#b08060', fontSize: 12 }}>
                      {getCurrency(currency).symbol}
                    </span>
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
            <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 500, color: Math.abs(customTotal - amountNum) < 0.01 ? '#4caf50' : '#FF6B1A' }}>
              {t('form.allocatedSum', { symbol: getCurrency(currency).symbol, a: customTotal.toFixed(0), b: amount || 0 })}
            </div>
          </div>
        )}
      </div>

      {/* LINE 分享 — 僅在 LINE app 內顯示 */}
      {showShareOption && <ShareToLineToggle checked={shareToLine} onChange={setShareToLine} />}

      {/* 收據上傳 */}
      {setReceiptFile && (
        <div style={cardStyle}>
          <div style={labelStyle}>{t('form.receiptLabel')}</div>

          {/* 已有圖片（既有 URL 或本次選擇的預覽） */}
          {(receiptPreview || (existingReceiptPath && !removeExistingReceipt)) ? (
            <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
              <img
                src={receiptPreview || existingReceiptUrl}
                alt={t('form.receiptAlt')}
                style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 10, background: '#f5f0eb', display: 'block' }}
              />
              <button
                onClick={() => {
                  setReceiptFile(null)
                  setReceiptPreview(null)
                  if (setRemoveExistingReceipt) setRemoveExistingReceipt(true)
                }}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%',
                  width: 28, height: 28, cursor: 'pointer', color: '#fff', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >×</button>
            </div>
          ) : (
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 6, padding: '20px 0', borderRadius: 10, cursor: 'pointer',
              border: '1.5px dashed #f0d5c0', background: '#fff8f4', color: '#b08060',
            }}>
              <Camera size={28} color="#b08060" />
              <span style={{ fontSize: 13 }}>{t('form.receiptUpload')}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setReceiptFile(file)
                  const reader = new FileReader()
                  reader.onload = ev => setReceiptPreview(ev.target.result)
                  reader.readAsDataURL(file)
                }}
              />
            </label>
          )}
        </div>
      )}
    </>
  )
}

export default ExpenseForm
