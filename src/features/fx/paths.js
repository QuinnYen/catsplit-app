// 匯率頁的 Firestore 路徑（旅程在 ledger/paths.js 的 tripsPath，因為旅程屬於帳本）
export const fxSettingsPath = (uid) => ['users', uid, 'settings', 'fx']
