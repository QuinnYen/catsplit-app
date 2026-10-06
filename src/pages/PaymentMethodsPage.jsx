// /payment-methods — 我的收款方式：新增、編輯、刪除，可切換是否公開顯示，並預覽對方看到的樣子與測試開啟 App。
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { Pencil, Trash2, Eye } from 'lucide-react'
import { db } from '../config/firebase'
import { useApp } from '../context/AppContext'
import PawDecor from '../components/PawDecor'
import BankPicker from '../components/BankPicker'
import PaymentMethodModal from '../components/PaymentMethodModal'
import { REGIONS, PROVIDERS, getProvider, methodName, normalizeValue, describeMethod, validatePayment } from '../config/paymentProviders'

const card = { background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14 }
const input = { width: '100%', border: '0.5px solid #f0d5c0', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#3d2b1f', outline: 'none', background: '#fff8f4', boxSizing: 'border-box' }
const label = { fontSize: 12, fontWeight: 500, color: '#b08060', marginBottom: 8 }
const iconBtn = { background: 'none', border: 'none', padding: 6, cursor: 'pointer', display: 'flex' }

const Switch = ({ checked, onChange }) => (
  <button
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    style={{ width: 40, height: 24, borderRadius: 12, border: 'none', padding: 2, cursor: 'pointer', flexShrink: 0, background: checked ? '#FF8C42' : '#e0cfc0', display: 'flex', justifyContent: checked ? 'flex-end' : 'flex-start' }}
  >
    <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff' }} />
  </button>
)

const REGION_IDS = REGIONS.map(r => r.id)
const emptyForm = { regionId: 'tw', providerId: '', value: '', bankCode: '', customName: '', label: '', isPublic: true }

const PaymentMethodsPage = () => {
  const { user } = useApp()
  const navigate = useNavigate()
  const [methods, setMethods] = useState(null)
  const [form, setForm] = useState(null) // null 表示表單收起
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)

  const colRef = collection(db, 'users', user.uid, 'paymentMethods')

  useEffect(() => {
    return onSnapshot(collection(db, 'users', user.uid, 'paymentMethods'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (a.createdAt?.toMillis?.() ?? Infinity) - (b.createdAt?.toMillis?.() ?? Infinity))
      setMethods(data)
    }, err => {
      console.error('讀取收款方式失敗', err)
      setMethods([])
    })
  }, [user.uid])

  const providers = form ? PROVIDERS.filter(p => p.region === form.regionId || p.region === '*') : []
  const provider = form ? getProvider(form.providerId) : null
  const patch = (p) => { setForm(f => ({ ...f, ...p })); setError('') }

  const startAdd = () => { setEditingId(null); setForm(emptyForm); setError('') }
  const startEdit = (m) => {
    setEditingId(m.id)
    setForm({ regionId: REGION_IDS.includes(getProvider(m.providerId)?.region) ? getProvider(m.providerId).region : 'tw', providerId: m.providerId, value: m.value, bankCode: m.bankCode ?? '', customName: m.customName ?? '', label: m.label ?? '', isPublic: m.isPublic })
    setError('')
  }

  const handleSave = async () => {
    if (!provider) return setError('請選擇收款方式')
    const value = normalizeValue(provider, form.value)
    const bankCode = form.bankCode.trim()
    const customName = form.customName.trim()
    const msg = validatePayment(provider, { value, bankCode, customName })
    if (msg) return setError(msg)
    const data = { providerId: provider.id, value, label: form.label.trim(), isPublic: form.isPublic, ...(provider.kind === 'bank' ? { bankCode } : {}), ...(provider.kind === 'custom' ? { customName } : {}) }
    setSaving(true)
    try {
      if (editingId) await updateDoc(doc(colRef, editingId), data)
      else await addDoc(colRef, { ...data, createdAt: serverTimestamp() })
      setForm(null)
    } catch (err) {
      console.error('儲存收款方式失敗', err)
      setError('儲存失敗，請稍後再試')
    }
    setSaving(false)
  }

  const handleDelete = async (m) => {
    if (!confirm(`確定要刪除「${methodName(m)}」嗎？`)) return
    try {
      await deleteDoc(doc(colRef, m.id))
    } catch (err) {
      console.error('刪除失敗', err)
      alert('刪除失敗，請稍後再試')
    }
  }

  const togglePublic = (m, isPublic) =>
    updateDoc(doc(colRef, m.id), { isPublic }).catch(err => {
      console.error('更新失敗', err)
      alert('更新失敗，請稍後再試')
    })

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f4', paddingBottom: 40 }}>
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '16px 16px 20px', position: 'relative', overflow: 'hidden' }}>
        <PawDecor />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/')} aria-label="返回" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}>‹</button>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>收款方式</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#3d2b1f' }}>我的收款方式</div>
          <button onClick={startAdd} style={{ background: '#FF8C42', color: '#fff', border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>＋ 新增收款</button>
        </div>

        {methods === null && <div style={{ textAlign: 'center', padding: '32px 0', color: '#b08060' }}>載入中...</div>}

        {methods?.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#b08060', fontSize: 14 }}>還沒有收款方式，新增後朋友結算時就能直接轉給你</div>
        )}

        {methods?.map(m => {
          return (
            <div key={m.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f' }}>{methodName(m)}{m.label ? `・${m.label}` : ''}</div>
                  <div style={{ fontSize: 13, color: '#b08060', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{describeMethod(m)}</div>
                </div>
                <button onClick={() => setPreview(m)} aria-label="預覽" style={iconBtn}><Eye size={18} color="#b08060" /></button>
                <button onClick={() => startEdit(m)} aria-label="編輯" style={iconBtn}><Pencil size={18} color="#b08060" /></button>
                <button onClick={() => handleDelete(m)} aria-label="刪除" style={iconBtn}><Trash2 size={18} color="#e53935" /></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid #f0d5c0' }}>
                <span style={{ fontSize: 12, color: '#b08060' }}>{m.isPublic ? '公開顯示中（其他人可看到）' : '僅自己可見'}</span>
                <Switch checked={m.isPublic} onChange={v => togglePublic(m, v)} />
              </div>
            </div>
          )
        })}

        {form && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ ...card, width: '100%', maxWidth: 360, maxHeight: '90vh', overflowY: 'auto', padding: 20, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f' }}>{editingId ? '編輯收款方式' : '新增收款方式'}</div>

            <div>
              <div style={label}>分類</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {REGIONS.map(r => (
                  <button key={r.id} disabled={!!editingId} onClick={() => patch({ regionId: r.id, providerId: '' })}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 14, cursor: editingId ? 'default' : 'pointer', border: form.regionId === r.id ? '1.5px solid #FF8C42' : '0.5px solid #f0d5c0', background: form.regionId === r.id ? '#fff3ec' : '#fff', color: form.regionId === r.id ? '#FF6B1A' : '#b08060' }}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={label}>收款方式</div>
              {providers.length === 0
                ? <div style={{ fontSize: 13, color: '#c4a882' }}>此分類還沒有可用的收款方式</div>
                : <select value={form.providerId} disabled={!!editingId} onChange={e => patch({ providerId: e.target.value, value: '', bankCode: '', customName: '' })} style={input}>
                    <option value="">請選擇</option>
                    {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>}
            </div>

            {provider?.kind === 'bank' && (
              <div>
                <div style={label}>銀行</div>
                <BankPicker value={form.bankCode} onChange={bankCode => patch({ bankCode })} />
              </div>
            )}
            {provider?.kind === 'custom' && (
              <div>
                <div style={label}>收款方式</div>
                <input type="text" maxLength={20} value={form.customName} onChange={e => patch({ customName: e.target.value })} placeholder="例如：全支付、PayPal" style={input} />
              </div>
            )}
            {provider && (
              <div>
                <div style={label}>{provider.kind === 'bank' ? '銀行帳號' : provider.kind === 'custom' ? '收款資訊' : provider.valueLabel}</div>
                <input type="text" inputMode={provider.kind === 'bank' ? 'numeric' : 'text'} maxLength={provider.kind === 'bank' ? 20 : provider.kind === 'custom' ? 200 : 1000} value={form.value} onChange={e => patch({ value: e.target.value })} placeholder={provider.kind === 'custom' ? '帳號、收款碼或連結' : provider.placeholder} style={input} />
                {provider.hint && <div style={{ fontSize: 11, color: '#c4a882', marginTop: 6 }}>{provider.hint}</div>}
              </div>
            )}
            {provider && (
              <div>
                <div style={label}>備註（選填）</div>
                <input type="text" maxLength={20} value={form.label} onChange={e => patch({ label: e.target.value })} placeholder="例如：薪轉戶" style={input} />
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: '#3d2b1f' }}>公開顯示</span>
              <Switch checked={form.isPublic} onChange={v => patch({ isPublic: v })} />
            </div>

            {error && <div style={{ fontSize: 12, color: '#e53935' }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setForm(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '0.5px solid #f0d5c0', background: '#fff', color: '#b08060', fontSize: 14, cursor: 'pointer' }}>取消</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: '#FF8C42', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? '儲存中...' : '儲存'}</button>
            </div>
          </div>
          </div>
        )}
      </div>

      {preview && <PaymentMethodModal method={preview} heading="對方會看到" onClose={() => setPreview(null)} />}
    </div>
  )
}

export default PaymentMethodsPage
