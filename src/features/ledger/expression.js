// 記帳面板的數字鍵盤：算式字串的輸入規則與計算。不用 eval，只認數字、小數點與 + − × ÷。
export const OPERATORS = ['+', '−', '×', '÷']
export const MAX_NUMBER_DIGITS = 9 // 單一數字最多幾位（不含小數點）

const OP_PATTERN = /[+−×÷]/
const lastNumber = (expr) => expr.split(OP_PATTERN).pop()
const endsWithOperator = (expr) => OPERATORS.includes(expr.slice(-1))

export const hasOperator = (expr) => OP_PATTERN.test(expr)

// 按下一個鍵後的新算式。key：'0'–'9'、'.'、'⌫'、OPERATORS 其中之一；不認得的鍵不改變算式
export const pressKey = (expr, key) => {
  if (key === '⌫') return expr.slice(0, -1)

  if (OPERATORS.includes(key)) {
    if (!expr) return expr // 開頭不能是運算符
    if (endsWithOperator(expr)) return expr.slice(0, -1) + key // 連按運算符是改成最後按的那個
    return (expr.endsWith('.') ? expr.slice(0, -1) : expr) + key
  }

  if (key === '.') {
    const cur = lastNumber(expr)
    if (cur.includes('.')) return expr
    return expr + (cur === '' ? '0.' : '.')
  }

  if (/^[0-9]$/.test(key)) {
    const cur = lastNumber(expr)
    if (cur.replace('.', '').length >= MAX_NUMBER_DIGITS) return expr
    // 數字 0 後面再按數字是取代（05 → 5）
    return (cur === '0' ? expr.slice(0, -1) : expr) + key
  }

  return expr
}

// 先乘除、後加減。空算式是 0；除以 0 回傳 null（無效）；結尾多出的運算符忽略
export const evaluateExpression = (expr) => {
  let e = expr
  while (e && endsWithOperator(e)) e = e.slice(0, -1)
  if (!e) return 0
  const tokens = e.match(/[0-9.]+|[+−×÷]/g) ?? []
  const terms = [parseFloat(tokens[0]) || 0]
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]
    const v = parseFloat(tokens[i + 1]) || 0
    if (op === '×') terms[terms.length - 1] *= v
    else if (op === '÷') {
      if (v === 0) return null
      terms[terms.length - 1] /= v
    } else terms.push(op === '−' ? -v : v)
  }
  const sum = terms.reduce((a, b) => a + b, 0)
  return Math.round(sum * 1e8) / 1e8 // 去掉二進位浮點的雜訊（0.1 + 0.2）
}

// 「＝」：把算式算成單一數字（字串）。結果不是正數或無效就清空，因為金額必須大於 0
export const commitExpression = (expr, decimals = 2) => {
  const v = evaluateExpression(expr)
  if (v === null || !(v > 0)) return ''
  const f = 10 ** decimals
  const rounded = Math.round(v * f) / f
  return rounded > 0 ? String(rounded) : ''
}
