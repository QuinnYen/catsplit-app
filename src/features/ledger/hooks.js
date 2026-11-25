// 個人帳本的即時訂閱與本機偏好。資料在載入完成前是 null，畫面要自己處理載入中。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { ledgersPath, accountsPath, transactionsPath, groupLinksPath, categoriesPath, recurringPath } from './paths.js'
import { monthDateBounds } from './summary.js'
import { yearBounds } from './dates.js'
import { ensureDefaultLedger } from './data.js'
import { pickActiveLedgerId, readActiveLedgerId, writeActiveLedgerId } from './prefs.js'

const withId = (d) => ({ id: d.id, ...d.data() })
// 剛寫入、createdAt 還是伺服器時間待確認的文件（null）排在最後
const createdMs = (x) => x.createdAt?.toMillis?.() ?? Infinity

export const useLedgers = (uid) => {
  const [state, setState] = useState({ uid: null, list: null })
  useEffect(() => {
    return onSnapshot(collection(db, ...ledgersPath(uid)), (snap) => {
      setState({ uid, list: snap.docs.map(withId).sort((a, b) => createdMs(a) - createdMs(b)) })
    }, (err) => {
      console.error('Failed to load ledgers', err)
      setState({ uid, list: [] })
    })
  }, [uid])
  return state.uid === uid ? state.list : null
}

export const useAccounts = (uid, ledgerId) => {
  const key = `${uid}/${ledgerId}`
  const [state, setState] = useState({ key: null, list: null })
  useEffect(() => {
    if (!ledgerId) return
    return onSnapshot(collection(db, ...accountsPath(uid, ledgerId)), (snap) => {
      setState({ key, list: snap.docs.map(withId).sort((a, b) => createdMs(a) - createdMs(b)) })
    }, (err) => {
      console.error('Failed to load accounts', err)
      setState({ key, list: [] })
    })
  }, [uid, ledgerId, key])
  return state.key === key ? state.list : null
}

// 帳本連結的群組 [{ id, linkedAt, groupName }]；linkedAt 剛寫入時還是 null（伺服器時間待確認）
export const useGroupLinks = (uid, ledgerId) => {
  const key = `${uid}/${ledgerId}`
  const [state, setState] = useState({ key: null, list: null })
  useEffect(() => {
    if (!ledgerId) return
    return onSnapshot(collection(db, ...groupLinksPath(uid, ledgerId)), (snap) => {
      setState({ key, list: snap.docs.map(withId).sort((a, b) => (a.linkedAt?.toMillis?.() ?? Infinity) - (b.linkedAt?.toMillis?.() ?? Infinity)) })
    }, (err) => {
      console.error('Failed to load group links', err)
      setState({ key, list: [] })
    })
  }, [uid, ledgerId, key])
  return state.key === key ? state.list : null
}

// 帳本的固定收支與固定轉帳規則（依建立時間）；載入前是 null
export const useRecurringRules = (uid, ledgerId) => {
  const key = `${uid}/${ledgerId}`
  const [state, setState] = useState({ key: null, list: null })
  useEffect(() => {
    if (!ledgerId) return
    return onSnapshot(collection(db, ...recurringPath(uid, ledgerId)), (snap) => {
      setState({ key, list: snap.docs.map(withId).sort((a, b) => createdMs(a) - createdMs(b)) })
    }, (err) => {
      console.error('Failed to load recurring rules', err)
      setState({ key, list: [] })
    })
  }, [uid, ledgerId, key])
  return state.key === key ? state.list : null
}

// 帳本的類別文件 [{ id, kind, key, name?, order }]；載入前是 null，沒有任何文件是 []（代表用預設清單）
export const useCategoryDocs = (uid, ledgerId) => {
  const key = `${uid}/${ledgerId}`
  const [state, setState] = useState({ key: null, list: null })
  useEffect(() => {
    if (!ledgerId) return
    return onSnapshot(collection(db, ...categoriesPath(uid, ledgerId)), (snap) => {
      setState({ key, list: snap.docs.map(withId) })
    }, (err) => {
      console.error('Failed to load categories', err)
      setState({ key, list: [] })
    })
  }, [uid, ledgerId, key])
  return state.key === key ? state.list : null
}

// 某個月份（'YYYY-MM'）的帳目：依日期新到舊，同一天依建立時間新到舊
export const useMonthTransactions = (uid, ledgerId, monthKey, startDay = 1) => {
  const key = `${uid}/${ledgerId}/${monthKey}/${startDay}`
  const [state, setState] = useState({ key: null, list: null })
  useEffect(() => {
    if (!ledgerId) return
    const { start, end } = monthDateBounds(monthKey, startDay)
    const q = query(collection(db, ...transactionsPath(uid, ledgerId)), where('date', '>=', start), where('date', '<', end))
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map(withId).sort((a, b) => (a.date === b.date ? createdMs(b) - createdMs(a) : a.date < b.date ? 1 : -1))
      setState({ key, list })
    }, (err) => {
      console.error('Failed to load transactions', err)
      setState({ key, list: [] })
    })
  }, [uid, ledgerId, monthKey, startDay, key])
  return state.key === key ? state.list : null
}

// 年檢視用：整個年期間的帳目，一次性讀取（getDocs，不訂閱；切換年度才重讀）。yearKey 是 null 時不讀；載入前回傳 null
export const useYearTransactions = (uid, ledgerId, yearKey, startDay = 1, yearStartMonth = 1) => {
  const key = yearKey ? `${uid}/${ledgerId}/${yearKey}/${startDay}/${yearStartMonth}` : null
  const [state, setState] = useState({ key: null, list: null })
  useEffect(() => {
    if (!key) return
    let cancelled = false
    const { start, end } = yearBounds(yearKey, startDay, yearStartMonth)
    getDocs(query(collection(db, ...transactionsPath(uid, ledgerId)), where('date', '>=', start), where('date', '<', end)))
      .then((snap) => { if (!cancelled) setState({ key, list: snap.docs.map(withId) }) })
      .catch((err) => { console.error('Failed to load year transactions', err); if (!cancelled) setState({ key, list: [] }) })
    return () => { cancelled = true }
  }, [uid, ledgerId, yearKey, startDay, yearStartMonth, key])
  return key && state.key === key ? state.list : null
}

// 趨勢圖用：把 monthKeys 各讀一次（getDocs，不訂閱），結果留在這個元件的記憶體，切換月份只補讀新的月份。
// skipKey 是已由 useMonthTransactions 即時訂閱的月份，不重複讀。回傳 { [monthKey]: 帳目[] }（尚未載入的月份沒有這個 key）
export const useMonthsOnce = (uid, ledgerId, monthKeys, skipKey, startDay = 1) => {
  const scope = `${uid}/${ledgerId}/${startDay}`
  const [state, setState] = useState({ scope, months: {} })
  const requested = useRef({ scope, keys: new Set() })
  const wanted = monthKeys.filter((k) => k !== skipKey).join(',')
  useEffect(() => {
    if (!ledgerId) return
    if (requested.current.scope !== scope) requested.current = { scope, keys: new Set() }
    for (const key of wanted ? wanted.split(',') : []) {
      if (requested.current.keys.has(key)) continue
      requested.current.keys.add(key)
      const { start, end } = monthDateBounds(key, startDay)
      const q = query(collection(db, ...transactionsPath(uid, ledgerId)), where('date', '>=', start), where('date', '<', end))
      getDocs(q).then((snap) => {
        const docs = snap.docs.map(withId)
        setState((prev) => ({ scope, months: { ...(prev.scope === scope ? prev.months : {}), [key]: docs } }))
      }).catch((err) => {
        console.error('Failed to load month transactions', err)
        requested.current.keys.delete(key)
      })
    }
  }, [uid, ledgerId, startDay, scope, wanted])
  return state.scope === scope ? state.months : {}
}

// 沒有任何帳本時建立預設帳本（名稱由呼叫端依語言傳入）；失敗只記錄，下次進入會再試
export const useEnsureDefaultLedger = (uid, ledgers, labels) => {
  const started = useRef(false)
  useEffect(() => {
    if (ledgers === null || ledgers.length > 0 || started.current) return
    started.current = true
    ensureDefaultLedger(uid, labels).catch((e) => {
      console.error('Failed to create default ledger', e)
      started.current = false
    })
  }, [uid, ledgers, labels])
}

// 目前帳本：記在本機，存的帳本已被刪除就退回第一個
export const useActiveLedger = (uid, ledgers) => {
  const [savedId, setSavedId] = useState(() => readActiveLedgerId(localStorage, uid))
  const activeId = useMemo(() => (ledgers ? pickActiveLedgerId(ledgers, savedId) : null), [ledgers, savedId])
  const setActiveId = useCallback((id) => {
    writeActiveLedgerId(localStorage, uid, id)
    setSavedId(id)
  }, [uid])
  return [ledgers?.find((l) => l.id === activeId) ?? null, setActiveId]
}
