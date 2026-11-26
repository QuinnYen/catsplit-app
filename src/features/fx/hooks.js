// 匯率頁（旅程）的即時訂閱。旅程列表本身用 ledger/hooks.js 的 useTrips（LedgerProvider 已訂閱，放在 Context）。
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { transactionsPath } from '../ledger/paths.js'

// 某趟旅程的全部帳目（單一欄位等值查詢，不需要複合索引）；載入前是 null。排序與分組在 tripSummary.js
export const useTripTransactions = (uid, ledgerId, tripId) => {
  const key = `${uid}/${ledgerId}/${tripId}`
  const [state, setState] = useState({ key: null, list: null })
  useEffect(() => {
    if (!ledgerId || !tripId) return
    const q = query(collection(db, ...transactionsPath(uid, ledgerId)), where('tripId', '==', tripId))
    return onSnapshot(q, (snap) => {
      setState({ key, list: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })
    }, (err) => {
      console.error('Failed to load trip transactions', err)
      setState({ key, list: [] })
    })
  }, [uid, ledgerId, tripId, key])
  return useMemo(() => (state.key === key ? state.list : null), [state, key])
}
