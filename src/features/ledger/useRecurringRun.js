// 開啟帳本時補入固定收支與固定轉帳：每個帳本同一次使用只自動補一次；新增或修改規則後可呼叫 runNow() 立刻補。
import { useCallback, useEffect, useRef, useState } from 'react'
import { runRecurring } from './recurringRun'
import { todayStr } from './dates'

export const useRecurringRun = ({ uid, ledger, rules, accounts, onDone }) => {
  const done = useRef(new Set())
  const latest = useRef({ rules, accounts, onDone })
  useEffect(() => { latest.current = { rules, accounts, onDone } })
  const [tick, setTick] = useState(0)
  const ready = !!ledger && rules !== null && accounts !== null
  const scope = `${uid}/${ledger?.id}`
  const holidayAdjust = ledger?.holidayAdjust ?? 'none'

  useEffect(() => {
    if (!ready || done.current.has(scope)) return
    done.current.add(scope)
    const { rules: rs, accounts: as } = latest.current
    if (rs.length === 0) return
    runRecurring({ uid, ledger, rules: rs, accounts: as, today: todayStr(), holidayAdjust })
      .then((r) => latest.current.onDone?.(r))
      .catch((e) => console.error('Failed to run recurring rules', e))
  }, [ready, scope, tick, uid, ledger, holidayAdjust])

  const runNow = useCallback(() => {
    done.current.delete(scope)
    setTick((n) => n + 1)
  }, [scope])
  return { runNow }
}
