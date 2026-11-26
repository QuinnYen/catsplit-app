// 旅程垃圾桶的純函式。刪除旅程只是在旅程文件寫入 deletedAt，帳目不動、隨時可還原；
// 在垃圾桶滿 TRASH_DAYS 天會被永久刪除（開啟匯率頁時處理，見 useTrashPurge）。
import { deltasForChange } from '../ledger/balance.js'
import { addMoney } from '../ledger/money.js'

export const TRASH_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

const deletedMs = (trip) => trip.deletedAt?.toMillis?.() ?? null

/**
 * 垃圾桶中旅程的資訊：{ deletedMs, daysLeft（還剩幾天，最少 0）, expired（滿 TRASH_DAYS 天） }；不在垃圾桶回 null。
 * deletedAt 是客戶端寫入的時間（Timestamp.now()），不會有「伺服器時間還沒回填」的空窗，所以刪除後旅程立刻從列表消失。
 */
export const trashInfo = (trip, nowMs) => {
  const ms = deletedMs(trip)
  if (ms == null) return null
  const left = ms + TRASH_DAYS * DAY_MS - nowMs
  return { deletedMs: ms, daysLeft: Math.max(0, Math.ceil(left / DAY_MS)), expired: left <= 0 }
}

// 垃圾桶中的旅程，最近刪除的在前
export const trashedTrips = (trips) =>
  trips.filter((t) => deletedMs(t) != null).sort((a, b) => deletedMs(b) - deletedMs(a))

// 已滿期、該永久刪除的旅程（最早刪除的先處理）
export const expiredTrips = (trips, nowMs) =>
  trashedTrips(trips).filter((t) => trashInfo(t, nowMs).expired).reverse()

/**
 * 永久刪除前的預覽：這些帳目有幾筆、刪掉後各帳戶餘額要退回多少（{ [accountId]: 增量 }，為 0 的略過）。
 * 退回的方向與刪除一筆帳目相同（支出刪掉＋、收入刪掉−，轉帳兩邊都退）；快照帳目不影響餘額。
 */
export const planTripPurge = (txs) => {
  const deltas = {}
  for (const tx of txs) {
    for (const [id, d] of Object.entries(deltasForChange(tx, null))) deltas[id] = addMoney(deltas[id] ?? 0, d)
  }
  return { count: txs.length, deltas: Object.fromEntries(Object.entries(deltas).filter(([, d]) => d !== 0)) }
}
