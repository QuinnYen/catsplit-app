// 開啟帳本時同步連結的群組：每個群組同一次使用只自動同步一次，之後靠 refresh() 手動重新整理。
// 無法讀取的群組（已退出或已刪除）不動現有快照帳目，只回報給畫面提示。
import { useCallback, useEffect, useRef, useState } from 'react'
import { syncGroup } from './groupSync'

export const useLedgerSync = ({ uid, ledger, links, accounts, onUnreadable }) => {
  const done = useRef(new Set())
  const latest = useRef({ accounts, onUnreadable })
  useEffect(() => { latest.current = { accounts, onUnreadable } })
  const [state, setState] = useState({ scope: '', syncing: false, unreadable: [], ratePending: false, scanned: {} })
  const [tick, setTick] = useState(0)
  const scope = `${uid}/${ledger?.id}`
  const ready = accounts !== null

  useEffect(() => {
    if (!links || !ledger || !ready) return
    const todo = links.filter((l) => l.linkedAt && !done.current.has(`${scope}/${l.id}`))
    if (todo.length === 0) return
    todo.forEach((l) => done.current.add(`${scope}/${l.id}`))
    ;(async () => {
      setState((s) => ({ ...(s.scope === scope ? s : { unreadable: [], ratePending: false, scanned: {} }), scope, syncing: true }))
      const unreadable = []
      let ratePending = false
      const scanned = {}
      for (const link of todo) {
        try {
          const snapshotAccount = latest.current.accounts.find((a) => a.id === `snap_${link.id}`)
          const r = await syncGroup({ uid, ledger, link, snapshotAccount })
          if (r.status === 'unreadable') unreadable.push(link)
          if (r.ratePending) ratePending = true
          if (r.scanned != null) scanned[link.id] = r.scanned
        } catch (e) {
          console.error('Group sync failed', e)
          done.current.delete(`${scope}/${link.id}`) // 失敗的下次重新整理再試
        }
      }
      setState((s) => ({ scope, syncing: false, scanned: { ...(s.scope === scope ? s.scanned : {}), ...scanned }, ratePending: s.scope === scope && s.ratePending ? true : ratePending, unreadable: [...(s.scope === scope ? s.unreadable.filter((u) => !todo.some((l) => l.id === u.id)) : []), ...unreadable] }))
      if (unreadable.length > 0) latest.current.onUnreadable?.(unreadable)
    })()
  }, [uid, ledger, scope, links, ready, tick])

  const refresh = useCallback(() => {
    for (const key of [...done.current]) if (key.startsWith(`${scope}/`)) done.current.delete(key)
    setTick((n) => n + 1)
  }, [scope])
  const forget = useCallback((groupId) => done.current.delete(`${scope}/${groupId}`), [scope])

  return { syncing: state.scope === scope && state.syncing, unreadable: state.scope === scope ? state.unreadable : [], scanned: state.scope === scope ? state.scanned : {}, ratePending: state.scope === scope && state.ratePending, refresh, forget }
}
