import { useState, useEffect } from 'react'
import { fetchExchangeRate } from '../config/currencies'

const useExchangeRate = (currency, baseCurrency) => {
  const [exchangeRate, setExchangeRate] = useState(1)
  const [rateLoading, setRateLoading] = useState(false)

  useEffect(() => {
    if (!baseCurrency) return
    if (currency === baseCurrency) { setExchangeRate(1); return }
    let cancelled = false
    setRateLoading(true)
    fetchExchangeRate(currency, baseCurrency)
      .then(rate => { if (!cancelled) setExchangeRate(rate) })
      .catch(() => { if (!cancelled) setExchangeRate(null) })
      .finally(() => { if (!cancelled) setRateLoading(false) })
    return () => { cancelled = true }
  }, [currency, baseCurrency])

  return { exchangeRate, setExchangeRate, rateLoading }
}

export default useExchangeRate
