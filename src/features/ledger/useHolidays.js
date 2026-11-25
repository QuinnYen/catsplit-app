// 月曆用的假日資料：載入這些年份（沿用 holidays.js 的快取，每年抓一次），回傳 isHoliday 與 holidayName。
// 載入前或抓不到時，isHoliday 退回「週六日」、名稱是空字串。
import { useEffect, useMemo, useState } from 'react'
import { loadHolidayYears, makeIsHoliday, makeHolidayName } from './holidays'

export const useHolidays = (years) => {
  const key = [...new Set(years)].sort().join(',')
  const [state, setState] = useState({ key: '', maps: new Map() })
  useEffect(() => {
    let cancelled = false
    loadHolidayYears(key.split(','), { storage: globalThis.localStorage })
      .then((maps) => { if (!cancelled) setState({ key, maps }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [key])
  return useMemo(() => {
    const maps = state.key === key ? state.maps : new Map()
    return { isHoliday: makeIsHoliday(maps), holidayName: makeHolidayName(maps) }
  }, [state, key])
}
