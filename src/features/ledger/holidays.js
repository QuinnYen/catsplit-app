// 台灣國定假日資料（給固定收支的「假日調整」用）。來源是開源資料集 ruyut/TaiwanCalendar 的整年 JSON，
// 每天一筆（date 'YYYYMMDD'、isHoliday），已包含週末、補假與補班日（補班的週六 isHoliday 是 false）。
// 這不是官方 API：某年份沒有資料、抓不到或格式不對時，該年退回「週六、週日是假日」，固定收支不會因此壞掉。
export const holidayUrls = (year) => [
  `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`,
  `https://raw.githubusercontent.com/ruyut/TaiwanCalendar/master/data/${year}.json`,
]

const CACHE_PREFIX = 'cs-holidays:'
const DAY_MS = 24 * 60 * 60 * 1000
const FOUND_TTL_MS = 30 * DAY_MS // 抓到的資料快取 30 天（官方偶爾會調整放假）
const MISSING_TTL_MS = 1 * DAY_MS // 沒有資料的年份一天後再試

// 整年 JSON → Map('YYYY-MM-DD' → isHoliday)；格式不對（不是整年的陣列）回 null
export const parseHolidayYear = (json) => {
  if (!Array.isArray(json) || json.length < 360) return null
  const map = new Map()
  for (const e of json) {
    if (typeof e?.date !== 'string' || !/^\d{8}$/.test(e.date) || typeof e.isHoliday !== 'boolean') return null
    map.set(`${e.date.slice(0, 4)}-${e.date.slice(4, 6)}-${e.date.slice(6)}`, e.isHoliday)
  }
  return map
}

export const isWeekend = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const w = new Date(y, m - 1, d).getDay()
  return w === 0 || w === 6
}

// yearMaps：Map(year 字串 → Map 或 null)。有該年資料用資料，否則退回週末
export const makeIsHoliday = (yearMaps) => (dateStr) => {
  const map = yearMaps.get(dateStr.slice(0, 4))
  return map ? (map.get(dateStr) ?? isWeekend(dateStr)) : isWeekend(dateStr)
}

const readCache = (storage, year, now) => {
  try {
    const c = JSON.parse(storage.getItem(CACHE_PREFIX + year))
    if (!c || typeof c.at !== 'number') return undefined
    if (c.missing) return now - c.at < MISSING_TTL_MS ? null : undefined
    return now - c.at < FOUND_TTL_MS && Array.isArray(c.days) ? new Map(c.days) : undefined
  } catch {
    return undefined
  }
}

const writeCache = (storage, year, value, now) => {
  try {
    storage.setItem(CACHE_PREFIX + year, JSON.stringify(value ? { at: now, days: [...value] } : { at: now, missing: true }))
  } catch { /* 存不了就下次再抓 */ }
}

/**
 * 載入這些年份的假日資料。回傳 Map(year → Map | null)（null 表示這年用週末）。
 * 先看 storage 快取，沒有才抓（兩個來源依序試），抓到或確定沒有都會快取。fetchImpl 預設是 fetch，方便測試。
 */
export const loadHolidayYears = async (years, { storage, fetchImpl = (...a) => fetch(...a), now = Date.now() } = {}) => {
  const out = new Map()
  await Promise.all([...new Set(years)].map(async (year) => {
    const key = String(year)
    const cached = storage ? readCache(storage, key, now) : undefined
    if (cached !== undefined) return out.set(key, cached)
    let found = null
    let reachable = false
    for (const url of holidayUrls(key)) {
      try {
        const res = await fetchImpl(url)
        reachable = true
        if (!res.ok) continue
        found = parseHolidayYear(await res.json())
        if (found) break
      } catch { /* 換下一個來源 */ }
    }
    // 完全連不上時不快取「沒有資料」，下次再試；連得上但沒有這年（404）才快取
    if (storage && (found || reachable)) writeCache(storage, key, found, now)
    out.set(key, found)
  }))
  return out
}
