import { useState } from 'react'
import { Delete } from 'lucide-react'

const OPS = ['+', '-', '×', '÷']

const KEYS = [
  ['C', '÷', '×', '⌫'],
  ['7', '8', '9', '-'],
  ['4', '5', '6', '+'],
  ['1', '2', '3', '='],
  ['0', '.', '00'],
]

// 不使用 eval：先算 × ÷，再算 + -
const evaluate = (expr) => {
  const tokens = expr.match(/\d*\.?\d+|\d+\.|[+\-×÷]/g)
  if (!tokens) return null
  const nums = []
  const ops = []
  for (const t of tokens) {
    if (OPS.includes(t)) ops.push(t)
    else nums.push(parseFloat(t))
  }
  if (nums.length !== ops.length + 1) return null

  const n2 = [nums[0]]
  const o2 = []
  ops.forEach((op, i) => {
    const b = nums[i + 1]
    if (op === '×') n2[n2.length - 1] *= b
    else if (op === '÷') n2[n2.length - 1] /= b
    else { o2.push(op); n2.push(b) }
  })
  let result = n2[0]
  o2.forEach((op, i) => { result = op === '+' ? result + n2[i + 1] : result - n2[i + 1] })
  if (!Number.isFinite(result)) return null
  return Math.round(result * 100) / 100
}

const CalculatorModal = ({ initial, onConfirm, onClose }) => {
  const [expr, setExpr] = useState(initial ? String(initial) : '')
  const result = expr ? evaluate(expr) : null

  const press = (k) => {
    if (k === 'C') return setExpr('')
    if (k === '⌫') return setExpr(e => e.slice(0, -1))
    if (k === '=') return result !== null && setExpr(String(result))
    if (OPS.includes(k)) {
      return setExpr(e => {
        if (!e) return k === '-' ? '-' : e
        return OPS.includes(e.slice(-1)) ? e.slice(0, -1) + k : e + k
      })
    }
    if (k === '.') {
      return setExpr(e => (/\d*\.\d*$/.test(e) ? e : e + (/\d$/.test(e) ? '.' : '0.')))
    }
    setExpr(e => e + k)
  }

  const confirm = () => {
    if (result === null || result <= 0) return
    onConfirm(String(result))
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(61,43,31,0.4)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 101, maxWidth: 480, margin: '0 auto',
        background: '#fff', borderRadius: '20px 20px 0 0', padding: 16, boxShadow: '0 -4px 20px rgba(255,140,66,0.2)',
      }}>
        <div style={{ background: '#fff8f4', border: '0.5px solid #f0d5c0', borderRadius: 12, padding: '10px 14px', marginBottom: 12, textAlign: 'right' }}>
          <div style={{ minHeight: 22, fontSize: 15, color: '#b08060', wordBreak: 'break-all' }}>{expr || '0'}</div>
          <div style={{ minHeight: 30, fontSize: 24, fontWeight: 500, color: '#FF6B1A' }}>{result !== null ? `= ${result}` : ''}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {KEYS.flat().map(k => {
            const isOp = OPS.includes(k) || k === '='
            return (
              <button
                key={k}
                onClick={() => press(k)}
                style={{
                  height: 48, borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 18, fontWeight: 500,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isOp ? '#FF8C42' : '#fff3ec', color: isOp ? '#fff' : '#3d2b1f',
                }}
              >
                {k === '⌫' ? <Delete size={20} /> : k}
              </button>
            )
          })}
          <button
            onClick={confirm}
            disabled={result === null || result <= 0}
            style={{
              height: 48, borderRadius: 12, border: 'none', fontSize: 16, fontWeight: 500, color: '#fff',
              background: result !== null && result > 0 ? '#FF6B1A' : '#e8cdb8',
              cursor: result !== null && result > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            確定
          </button>
        </div>
      </div>
    </>
  )
}

export default CalculatorModal
