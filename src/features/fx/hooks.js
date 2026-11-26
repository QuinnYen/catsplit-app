// 匯率頁（旅程）的即時訂閱。旅程列表本身用 ledger/hooks.js 的 useTrips（LedgerProvider 已訂閱，放在 Context）。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { transactionsPath } from '../ledger/paths.js'
import { fetchExchangeRate } from '../../config/currencies'
import { fxSettingsPath } from './paths.js'
import { mergeFxSettings } from './fxSettings.js'

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

/**
 * 計算機用的匯率表：以 USD 為 1 的 { USD: 1, JPY: 156.2, ... }，只含 codes 裡的幣別（見 fxMath.js 的 pairRate）。
 * 同一份 open.er-api.com 表在記憶體快取 1 小時（config/currencies.js），所以換列、換幣別不會重抓。
 * 換了幣別清單時沿用舊表直到新表回來（不閃爍）；有任何幣別抓不到 error 為 true，retry() 重抓。
 */
export const useFxRates = (codes) => {
  const key = [...new Set(codes)].sort().join(',')
  const [state, setState] = useState({ key: null, rates: { USD: 1 }, error: false })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    const need = key.split(',').filter((c) => c && c !== 'USD')
    Promise.allSettled(need.map((code) => fetchExchangeRate('USD', code).then((rate) => [code, rate]))).then((results) => {
      const rates = { USD: 1 }
      let error = false
      for (const r of results) {
        if (r.status === 'fulfilled') rates[r.value[0]] = r.value[1]
        else error = true
      }
      if (!cancelled) setState({ key, rates, error })
    })
    return () => { cancelled = true }
  }, [key, tick])
  const retry = useCallback(() => setTick((n) => n + 1), [])
  return { rates: state.rates, loading: state.key !== key, error: state.key === key && state.error, retry }
}

/**
 * 計算機設定（users/{uid}/settings/fx）：即時訂閱，合併預設值後回傳 { settings, ready }。
 * 讀取失敗（例如 rules 還沒部署）也視為 ready，用預設值，不擋住計算機。
 */
export const useFxSettings = (uid) => {
  const [state, setState] = useState({ uid: null, data: {} })
  useEffect(() => {
    return onSnapshot(doc(db, ...fxSettingsPath(uid)), (snap) => {
      setState({ uid, data: snap.exists() ? snap.data() : {} })
    }, (err) => {
      console.error('Failed to load fx settings', err)
      setState({ uid, data: {} })
    })
  }, [uid])
  const ready = state.uid === uid
  const settings = useMemo(() => mergeFxSettings(ready ? state.data : {}), [ready, state])
  return { settings, ready }
}
