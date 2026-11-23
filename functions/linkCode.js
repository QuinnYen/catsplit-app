// 「帶著登入狀態到外部瀏覽器」用的一次性連結碼：純函式（只用 node:crypto，不碰 Firestore，方便用 node:test 直接測）。
// LINE 內建瀏覽器無法用 Google 登入（Google 不允許在內嵌 WebView 登入），所以由已登入的 LINE 帳號產生一個短效、單次的碼，
// 在手機的外部瀏覽器兌換成同一個帳號的登入狀態，再用手機上已登入的 Google 帳號完成綁定。Firestore 流程在 linkFlow.js。
import { createHash, randomBytes } from 'node:crypto'

export const LINK_CODE_TTL_MS = 5 * 60 * 1000 // 碼 5 分鐘內要兌換
export const LINK_RECORD_TTL_MS = 60 * 60 * 1000 // 過期後多留一小時再由清除排程刪除

// 256 位元隨機，base64url 編碼固定 43 個字元；只存雜湊，資料庫被讀到也拿不到可用的碼
const CODE_FORMAT = /^[A-Za-z0-9_-]{43}$/

export const generateLinkCode = () => randomBytes(32).toString('base64url')
export const isLinkCodeFormat = (code) => typeof code === 'string' && CODE_FORMAT.test(code)
export const hashLinkCode = (code) => createHash('sha256').update(code).digest('hex')

export const buildLinkRecord = ({ uid, nowMs }) => ({
  uid,
  createdAtMs: nowMs,
  expiresAtMs: nowMs + LINK_CODE_TTL_MS,
  expireAtMs: nowMs + LINK_CODE_TTL_MS + LINK_RECORD_TTL_MS, // 清除排程用
})

// 兌換時依紀錄決定：沒有（不存在或已兌換過）→ link_invalid；已逾時 → link_expired
export const planRedeem = (record, nowMs) => {
  if (!record) return { ok: false, error: 'link_invalid' }
  if (record.expiresAtMs <= nowMs) return { ok: false, error: 'link_expired' }
  return { ok: true }
}
