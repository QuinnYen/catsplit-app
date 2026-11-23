// 檢查（並可修復）所有群組的彙總欄位：餘額、支出總額與筆數、收入總額與筆數、每人參與筆數。
// 預設只列出哪些群組對不上、差在哪（dry-run）；加 --apply 才寫回重算的值。可重複執行。
// 寫回時用讀到的版本當前提，掃描與寫入之間群組被改過（有人剛記帳）就跳過那個群組，重跑一次即可。
// 重算用客戶端同一份 computeGroupAggregates（src/utils/expenseHelpers.js），所以必須在整個 repo 裡執行。
//
// 用法（PowerShell，在 functions 資料夾內；通常由 .github/workflows/check-aggregates.yml 執行）：
//   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\service-account.json"
//   node scripts/check-aggregates.mjs --project catsplit-app                    # dry-run
//   node scripts/check-aggregates.mjs --project catsplit-app --apply            # 寫回
//   node scripts/check-aggregates.mjs --project catsplit-app --group <群組 id>  # 只處理一個群組
// 結束碼：dry-run 發現有差異時是 2（讓排程或 CI 能看出來）；其餘成功是 0。
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { checkAggregates } from '../aggregateCheck.js'
import { computeGroupAggregates } from '../../src/utils/expenseHelpers.js'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const valueOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }
const projectId = valueOf('--project') ?? process.env.GOOGLE_CLOUD_PROJECT
const groupId = valueOf('--group') ?? null
if (!projectId) {
  console.error('請用 --project <專案 id> 指定專案')
  process.exit(1)
}

initializeApp({ projectId })
const db = getFirestore()

const main = async () => {
  const report = await checkAggregates(db, { computeAggregates: computeGroupAggregates, apply, groupId })
  console.log(`掃描 ${report.scanned} 個群組，${report.mismatched.length} 個彙總對不上。`)
  for (const g of report.mismatched) {
    console.log(`\n群組 ${g.id}「${g.name}」[${g.outcome}]`)
    for (const d of g.diffs) {
      console.log(`  ${d.field}${d.key ? `[${d.key}]` : ''}：存的 ${d.stored}，重算 ${d.expected}`)
    }
  }
  if (!apply) {
    console.log(report.mismatched.length ? '\n這是 dry-run，沒有寫入任何資料。確認無誤後加上 --apply。' : '\n全部一致。')
    process.exit(report.mismatched.length ? 2 : 0)
  }
  console.log(`\n已修復 ${report.fixed} 個，${report.skipped} 個在掃描後被改過而跳過（重跑一次即可）。`)
  process.exit(report.skipped ? 2 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
