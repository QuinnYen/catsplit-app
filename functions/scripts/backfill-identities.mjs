// 為現有 LINE 使用者補齊 identities/line:{userId} 對照項（uid 即 LINE userId，不搬任何資料）。
// 來源：users/ 底下所有文件 id（含只有子集合的空文件）＋所有群組 members 裡非訪客的 id。
// 預設只列出會新增什麼（dry-run），加 --apply 才寫入；已存在的對照項不會被動到，可重複執行。
//
// 用法（PowerShell，在 functions 資料夾內）：
//   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\service-account.json"
//   node scripts/backfill-identities.mjs --project catsplit-app            # dry-run
//   node scripts/backfill-identities.mjs --project catsplit-app --apply    # 實際寫入
// 對本機模擬器：先 $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080" 再執行同樣的指令。
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { identityKey } from '../identity.js'

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

// LINE userId 固定是 U 加 32 位十六進位；其他格式（例如本機開發的匿名 uid、訪客 p_）不處理
const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/

const collectIds = async () => {
  const ids = new Set()
  const userRefs = await db.collection('users').listDocuments()
  userRefs.forEach((r) => ids.add(r.id))
  const groups = await db.collection('groups').select('members').get()
  groups.docs.forEach((d) => (d.data().members || []).forEach((m) => ids.add(m)))
  return ids
}

const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size))

const main = async () => {
  const all = await collectIds()
  const lineIds = [...all].filter((id) => LINE_USER_ID_RE.test(id))
  const skipped = [...all].filter((id) => !LINE_USER_ID_RE.test(id) && !id.startsWith('p_'))

  const missing = []
  for (const part of chunk(lineIds, 300)) {
    const refs = part.map((id) => db.doc(`identities/${identityKey('line', id)}`))
    const snaps = await db.getAll(...refs)
    snaps.forEach((s, i) => { if (!s.exists) missing.push(part[i]) })
  }

  console.log(`找到 ${lineIds.length} 位 LINE 使用者，其中 ${missing.length} 位缺對照項，${lineIds.length - missing.length} 位已有。`)
  if (skipped.length) console.log(`略過 ${skipped.length} 個格式不符的 id：${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? ' …' : ''}`)

  if (!apply) {
    console.log('這是 dry-run，沒有寫入任何資料。確認無誤後加上 --apply。')
    return
  }

  const writer = db.bulkWriter()
  let created = 0
  let existed = 0
  for (const id of missing) {
    writer
      .create(db.doc(`identities/${identityKey('line', id)}`), {
        uid: id, provider: 'line', subject: id, createdAt: FieldValue.serverTimestamp(), backfilled: true,
      })
      .then(() => { created += 1 })
      // 掃描之後剛好有人登入而先建立了：視為已存在，不算失敗
      .catch((e) => { if (e.code === 6) existed += 1; else console.error('寫入失敗', id, e.message) })
  }
  await writer.close()
  console.log(`已寫入 ${created} 筆，${existed} 筆在掃描後已被建立。`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
