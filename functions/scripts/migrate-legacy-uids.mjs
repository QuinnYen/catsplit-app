// 把舊 LINE 使用者（uid 就是 LINE userId）的資料轉成新的內部 uid（u_ 開頭），見 functions/mergeFlow.js 的 migrateLegacyUid。
// 預設只列出每位使用者會搬什麼（dry-run），加 --apply 才真的轉；可重複執行、可從中斷處繼續，已轉完的會略過。
// 轉完之後該使用者原本的登入狀態會失效，要重新開啟 App（見 docs/operations.md）。每位使用者會先備份到 mergeBackups（保留 30 天）。
//
// 用法（PowerShell，在 functions 資料夾內；通常由 .github/workflows/migrate-legacy-uids.yml 執行）：
//   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\service-account.json"
//   node scripts/migrate-legacy-uids.mjs --project catsplit-app                  # dry-run
//   node scripts/migrate-legacy-uids.mjs --project catsplit-app --apply          # 實際轉移
//   node scripts/migrate-legacy-uids.mjs --project catsplit-app --apply --uid U...  # 只轉一位
// 結束碼：dry-run 一律 0；apply 有任何一位失敗是 1。
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { migrateLegacyUid, LEGACY_UID_RE, legacyMigrationId } from '../mergeFlow.js'
import { makeUid } from '../identity.js'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const valueOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }
const projectId = valueOf('--project') ?? process.env.GOOGLE_CLOUD_PROJECT
const onlyUid = valueOf('--uid') ?? null
if (!projectId) {
  console.error('請用 --project <專案 id> 指定專案')
  process.exit(1)
}

initializeApp({ projectId })
const db = getFirestore()

// 還沒轉的舊使用者：對照項的 uid 還是 LINE userId 本身，或是有 users 文件／群組成員但還沒有對照項
const findLegacyUids = async () => {
  const ids = new Set()
  const idents = await db.collection('identities').where('provider', '==', 'line').get()
  idents.docs.forEach((d) => { const { uid } = d.data(); if (LEGACY_UID_RE.test(uid)) ids.add(uid) })
  ;(await db.collection('users').listDocuments()).forEach((r) => { if (LEGACY_UID_RE.test(r.id)) ids.add(r.id) })
  const groups = await db.collection('groups').select('members').get()
  groups.docs.forEach((g) => (g.data().members || []).forEach((m) => { if (LEGACY_UID_RE.test(m)) ids.add(m) }))
  return [...ids]
}

const describe = async (uid) => {
  const groups = await db.collection('groups').where('members', 'array-contains', uid).get()
  let docs = 0
  for (const g of groups.docs) {
    for (const col of ['expenses', 'settlements', 'incomes']) docs += (await g.ref.collection(col).count().get()).data().count
  }
  const personal = (await db.doc(`users/${uid}`).listCollections()).length
  const identities = (await db.collection('identities').where('uid', '==', uid).get()).docs.map((d) => d.id)
  const rec = await db.doc(`merges/${legacyMigrationId(uid)}`).get()
  const state = rec.exists ? rec.data().state : '尚未開始'
  return { groups: groups.size, docs, personal, identities, state }
}

const main = async () => {
  const all = onlyUid ? [onlyUid] : await findLegacyUids()
  console.log(`找到 ${all.length} 位舊 LINE 使用者（uid 就是 LINE userId）。`)
  let failed = 0
  for (const uid of all) {
    const d = await describe(uid)
    console.log(`\n${uid}\n  群組 ${d.groups} 個、最多會檢查 ${d.docs} 筆帳目、個人資料集合 ${d.personal} 個、登入方式 ${d.identities.join(', ') || '（無對照項）'}、進度：${d.state}`)
    if (!apply) continue
    try {
      const r = await migrateLegacyUid(db, {
        makeUid,
        deleteAuthUser: (u) => getAuth().deleteUser(u).catch((e) => { if (e.code !== 'auth/user-not-found') throw e }),
      }, { oldUid: uid })
      console.log(`  → ${r.status}，新 uid ${r.newUid}`)
    } catch (e) {
      failed += 1
      console.error(`  → 失敗：${e.code ?? e.message}`, e.extra ?? '')
    }
  }
  if (!apply) console.log('\n這是 dry-run，沒有寫入任何資料。確認無誤後加上 --apply。')
  else console.log(`\n完成。${failed ? `${failed} 位失敗，重跑一次會從中斷處繼續。` : '全部成功。'}`)
  process.exit(apply && failed ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
