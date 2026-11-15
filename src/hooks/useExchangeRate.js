import { useState, useEffect } from 'react'
import { fetchExchangeRate } from '../config/currencies'

// 取得「1 from = ? to」的匯率（from、to 為貨幣代碼）。to 為空字串時不抓、視為 1。
// savedRate: { currency, rate }，編輯既有消費時傳入；from 與它的幣別相同就沿用，不重新抓取
const useExchangeRate = (from, to, savedRate) => {
  const key = `${from}>${to}`
  const [fetched, setFetched] = useState(null) // { key, rate, error? }
  const [manual, setManual] = useState(null) // { key, rate }

  const usesSaved = savedRate?.currency === from
  const needsFetch = !!to && from !== to && !usesSaved

  useEffect(() => {
    if (!needsFetch) return
    let cancelled = false
    fetchExchangeRate(from, to)
      .then(rate => { if (!cancelled) setFetched({ key, rate }) })
      .catch(() => { if (!cancelled) setFetched({ key, rate: null, error: true }) })
    return () => { cancelled = true }
  }, [needsFetch, from, to, key])

  // 只採用與目前幣別組合相符的結果，切換幣別時舊結果自動失效
  const manualHit = manual?.key === key ? manual : null
  const fetchedHit = needsFetch && fetched?.key === key ? fetched : null

  const rateLoading = needsFetch && !fetchedHit
  const rateError = !!fetchedHit?.error
  const rateManual = !!manualHit

  let exchangeRate = null
  if (manualHit) exchangeRate = manualHit.rate
  else if (!to || from === to) exchangeRate = 1
  else if (usesSaved) exchangeRate = savedRate.rate
  else if (fetchedHit) exchangeRate = fetchedHit.rate

  const setManualRate = (rate) => setManual({ key, rate })

  return { exchangeRate, setManualRate, rateLoading, rateError, rateManual }
}

export default useExchangeRate
