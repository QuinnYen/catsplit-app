// 清除過期的帳號合併紀錄與備份：沒人確認的預覽一天後、完成的合併與備份 30 天後（merges、mergeBackups 的 expireAtMs 小於現在）。
// 進行中的合併 expireAtMs 為 null，不會被刪。預設只列出會刪什麼（dry-run），加 --apply 才真的刪；可重複執行。
//
// 用法（在 functions 資料夾內；通常由 .github/workflows/purge-merge-backups.yml 每天自動執行）：
//   node scripts/purge-merge-backups.mjs --project catsplit-app            # dry-run
//   node scripts/purge-merge-backups.mjs --project catsplit-app --apply    # 實際刪除
// 對本機模擬器執行時，先設定環境變數 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080。
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { purgeExpired } from '../mergeFlow.js'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const projectIdx = args.indexOf('--project')
const projectId = projectIdx >= 0 ? args[projectIdx + 1] : process.env.GOOGLE_CLOUD_PROJECT
if (!projectId) {
  console.error('請用 --project <專案 id> 指定專案')
  process.exit(1)
}

initializeApp({ projectId })
const db = getFirestore()
const now = Date.now()

const main = async () => {
  if (!apply) {
    for (const col of ['merges', 'mergeBackups']) {
      const snap = await db.collection(col).where('expireAtMs', '<', now).get()
      console.log(`${col}：${snap.size} 筆已過期`)
      snap.docs.forEach((d) => console.log(`  ${col}/${d.id}（過期 ${Math.floor((now - d.data().expireAtMs) / 86_400_000)} 天）`))
    }
    console.log('這是 dry-run，沒有刪除任何資料。確認無誤後加上 --apply。')
    return
  }
  let total = 0
  for (let i = 0; i < 100; i += 1) {
    const deleted = await purgeExpired(db, now, 50)
    if (deleted.length === 0) break
    deleted.forEach((p) => console.log(`已刪除 ${p}`))
    total += deleted.length
  }
  console.log(`共刪除 ${total} 筆。`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
