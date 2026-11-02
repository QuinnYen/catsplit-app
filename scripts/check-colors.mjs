// 掃描 src 裡寫死、應改成 CSS 變數（var(--cs-…)）的色碼（註解不算）。用法：npm run check:colors
// 例外：橘色品牌色、LINE 綠與綠色填色、屬於 color 屬性的 #fff（含三元式）、半透明白／黑／橘／LINE 綠、QR code 的 dark／light 色；
//   該行尾端加 // cs-color-ok 可明確豁免（固定色，例如圖表色盤）；
//   LINE 訊息（flexMessages、shareContent）與裁切畫面（CropModal）不跟主題，整個檔案略過；測試檔略過
import fs from 'node:fs'
import path from 'node:path'
import * as espree from 'espree'

const ALLOWED_HEX = new Set(['#ff8c42', '#ff6b1a', '#e8703a', '#d98c5f', '#06c755', '#4caf50', '#66bb6a'])
const ALLOWED_RGBA = /^rgba\(\s*(255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0|255\s*,\s*140\s*,\s*66|6\s*,\s*199\s*,\s*85)\s*,/
const ALLOWED_RAW = new Set(['rgb(53 19 0)']) // 首頁封面圖上的深棕色漸層遮罩，兩種模式都適用
const WHITE = new Set(['#fff', '#ffffff'])
const QR_KEYS = new Set(['dark', 'light'])
// 十六進位（3、4、6、8 位）、rgb/rgba/hsl/hsla 函式，以及單獨的 white／black（含 Tailwind 的 bg-white、text-black，不含 white-space）
const COLOR_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b|(?:rgba?|hsla?)\([^)]*\)|(?<!\w)(?:white|black)(?![\w-])/gi

const norm = (p) => p.split(path.sep).join('/')
const SKIP_FILES = ['src/utils/flexMessages.js', 'src/utils/shareContent.js', 'src/components/CropModal.jsx']
const skip = (f) => SKIP_FILES.some((s) => norm(f).endsWith(s)) || /\.test\.js$/.test(f)
const walk = (d) => fs.statSync(d).isFile() ? [d] : fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name)
  return e.isDirectory() ? walk(p) : /\.jsx?$/.test(e.name) && !skip(p) ? [p] : []
})

// 往回找這個 token 所屬的屬性鍵（color: …、background: …、color="…"），三元式也算在內；找不到回傳 null
export const nearestKey = (toks, i) => {
  for (let j = i - 1; j > 0; j--) {
    const t = toks[j]
    if (t.type === 'Punctuator') {
      // JSX 屬性的 {…} 容器（color={…}）繼續往回找，其餘邊界停止
      if (t.value === '{' && toks[j - 1]?.value === '=') continue
      if ([',', '{', '(', ';', '}'].includes(t.value)) return null
      if ((t.value === ':' || t.value === '=') && ['Identifier', 'JSXIdentifier'].includes(toks[j - 1]?.type)) return toks[j - 1].value
    }
  }
  return null
}

// 回傳 [{ line, text }]：每個不被允許的色碼一筆
export const findColors = (source) => {
  const toks = espree.tokenize(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true })
  const hits = []
  const lines = source.split('\n')
  toks.forEach((t, i) => {
    if (!['String', 'Template', 'JSXText'].includes(t.type)) return
    for (const m of t.value.matchAll(COLOR_RE)) {
      const color = m[0]
      const lower = color.toLowerCase()
      if (ALLOWED_HEX.has(lower)) continue
      if (lower.startsWith('rgb') && ALLOWED_RGBA.test(lower)) continue
      if (ALLOWED_RAW.has(lower)) continue
      // #fff 只在屬於 color 屬性（文字色，含三元式的任一分支）時允許；其他位置是背景類，要換成變數
      if (WHITE.has(lower) && nearestKey(toks, i) === 'color') continue
      // QR code 一定要黑碼白底才掃得到，且函式庫要真正的色碼，不能用 CSS 變數
      if (QR_KEYS.has(nearestKey(toks, i))) continue
      const line = t.loc.start.line + (t.value.slice(0, m.index).match(/\n/g)?.length ?? 0)
      if (lines[line - 1].includes('cs-color-ok')) continue // 該行明確標記為固定色（例如圖表色盤）
      hits.push({ line, text: color })
    }
  })
  return hits
}

export const scanColors = (roots = ['src']) =>
  roots.flatMap(walk).flatMap((f) =>
    findColors(fs.readFileSync(f, 'utf8')).map((h) => `${norm(f)}:${h.line}: ${h.text}`))

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  const hits = scanColors(process.argv.slice(2).length ? process.argv.slice(2) : ['src'])
  hits.forEach((h) => console.log(h))
  console.log(`TOTAL ${hits.length}`)
  process.exit(hits.length ? 1 : 0)
}
