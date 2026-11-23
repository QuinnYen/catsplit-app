// 登入後的使用者物件、本機快取與啟動快速路徑的判斷（純函式，方便用 node:test 直接測）
//
// 背景（P14）：uid 不再等於 LINE userId。uid 一律以伺服器回傳為準；
// LINE userId 另存成 lineUserId，只用來確認「目前的 LIFF 使用者沒被換掉」。

// 登入回應裡的 uid。舊版後端（尚未部署）只回 userId，當時兩者相同
export const uidFromLoginResponse = (data) => data.uid ?? data.userId

export const buildSessionUser = ({ uid, lineUserId, name, avatar }) => ({ uid, lineUserId, name, avatar })

// 快取使用者對應的 LINE userId。舊版快取沒有 lineUserId，當時 uid 就是 LINE userId
export const cachedLineUserId = (cached) => cached?.lineUserId ?? cached?.uid ?? null

/**
 * 啟動快速路徑能不能沿用快取使用者（不呼叫 verifyLiffToken、不重新換 token）：
 * - 有快取、不是訪客
 * - 快取記的 LINE userId 與目前 LIFF 使用者（getDecodedIDToken().sub）相同，沒被換人
 * - Firebase 已恢復登入，而且 uid 與快取使用者相同
 * - 沒有待認領的訪客名字（認領在完整登入流程裡進行）
 */
export const canReuseCachedSession = ({ cached, firebaseUid, lineSub, hasPendingGuestNames }) =>
  !!cached
  && !cached.guest
  && !!lineSub
  && !!firebaseUid
  && !hasPendingGuestNames
  && cachedLineUserId(cached) === lineSub
  && cached.uid === firebaseUid
