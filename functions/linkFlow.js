// 一次性連結碼的 Firestore 流程（db 由呼叫端傳入，可在模擬器直接測）。純函式在 linkCode.js。
import { MergeError } from './bind.js'
import {
  LINK_CODE_TTL_MS, generateLinkCode, isLinkCodeFormat, hashLinkCode, buildLinkRecord, planRedeem,
} from './linkCode.js'

/**
 * 為已登入的帳號產生一個一次性連結碼（回傳明碼，資料庫只存雜湊）。
 * 同一個帳號同時只留一個有效的碼：產生新的時先刪掉舊的。generate 可注入（測試用）。
 */
export const createLinkCode = async (db, { uid, nowMs, generate = generateLinkCode }) => {
  const old = await db.collection('linkCodes').where('uid', '==', uid).get()
  for (const d of old.docs) await d.ref.delete()
  const code = generate()
  await db.doc(`linkCodes/${hashLinkCode(code)}`).create(buildLinkRecord({ uid, nowMs }))
  return { code, expiresAtMs: nowMs + LINK_CODE_TTL_MS }
}

/**
 * 兌換連結碼，回傳 { uid }。成功就刪掉紀錄（只能用一次）；格式不對、不存在、已用過回 404 link_invalid，逾時回 410 link_expired。
 * 帳號已被刪除或併掉（users 文件不在）也當作無效，否則會用這個 uid 建出一個空帳號。
 */
export const redeemLinkCode = async (db, { code, nowMs }) => {
  if (!isLinkCodeFormat(code)) throw new MergeError('link_invalid', 404)
  const ref = db.doc(`linkCodes/${hashLinkCode(code)}`)
  const uid = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const record = snap.exists ? snap.data() : null
    const plan = planRedeem(record, nowMs)
    if (!plan.ok) throw new MergeError(plan.error, plan.error === 'link_expired' ? 410 : 404)
    tx.delete(ref)
    return record.uid
  })
  if (!(await db.doc(`users/${uid}`).get()).exists) throw new MergeError('link_invalid', 404)
  return { uid }
}

// 刪除帳號時一併刪掉這個 uid 還沒兌換的連結碼
export const deleteLinkCodesOf = async (db, uid) => {
  const snap = await db.collection('linkCodes').where('uid', '==', uid).get()
  for (const d of snap.docs) await d.ref.delete()
}
