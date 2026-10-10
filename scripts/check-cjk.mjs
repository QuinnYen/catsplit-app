// 掃描 src 裡寫死在字串、template、JSX 文字裡的中文（註解不算）。用法：npm run check:cjk
// 例外：字典 zh-TW.js、舊資料對照 legacy.js 與測試檔；core.js 等其他 i18n 檔照常掃描
import fs from 'node:fs'
import path from 'node:path'
import * as espree from 'espree'

const CJK = /[㐀-鿿豈-﫿　-〿＀-￯]/ // 不含 U+30FB 的「・」
const norm = (p) => p.split(path.sep).join('/')
const skip = (f) => /\/i18n\/(zh-TW|legacy)\.js$/.test(norm(f)) || /\.test\.js$/.test(f)
const walk = (d) => fs.statSync(d).isFile() ? [d] : fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name)
  return e.isDirectory() ? walk(p) : /\.jsx?$/.test(e.name) && !skip(p) ? [p] : []
})

export const scanCjk = (roots = ['src']) => {
  const hits = []
  for (const f of roots.flatMap(walk)) {
    const toks = espree.tokenize(fs.readFileSync(f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true })
    for (const t of toks) {
      if (['String', 'Template', 'JSXText'].includes(t.type) && CJK.test(t.value)) hits.push(`${norm(f)}:${t.loc.start.line}: ${t.value.replace(/\s+/g, ' ').trim().slice(0, 50)}`)
    }
  }
  return hits
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  const hits = scanCjk(process.argv.slice(2).length ? process.argv.slice(2) : ['src'])
  hits.forEach((h) => console.log(h))
  console.log(`TOTAL ${hits.length}`)
  process.exit(hits.length ? 1 : 0)
}
