// 有新版本時的提示：App 回到前景或每隔一段時間檢查一次（見 utils/versionCheck.js）。
// 不自動重新載入（可能正在填資料），由使用者按「立即更新」才重新載入；「稍後」只收起這一版的提示。
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { currentEntryScript, findNewVersion } from '../utils/versionCheck'

const MIN_GAP_MS = 5 * 60 * 1000 // 回到前景的檢查最少間隔
const POLL_MS = 30 * 60 * 1000 // 一直在前景時的定期檢查

const UpdateBanner = () => {
  const { t } = useI18n()
  const [latest, setLatest] = useState(null)
  const [dismissed, setDismissed] = useState(null)
  const lastCheck = useRef(0)

  useEffect(() => {
    const current = currentEntryScript()
    if (!current) return undefined // 開發模式
    lastCheck.current = Date.now() // 剛載入的就是最新的，不用立刻檢查
    const check = async () => {
      lastCheck.current = Date.now()
      const found = await findNewVersion(current)
      if (found) setLatest(found)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current >= MIN_GAP_MS) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => { if (document.visibilityState === 'visible') check() }, POLL_MS)
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(timer) }
  }, [])

  if (!latest || dismissed === latest) return null
  return (
    <div
      role="status"
      style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(var(--tabbar-h) + 16px + env(safe-area-inset-bottom, 0px))', zIndex: 400, margin: '0 auto', maxWidth: 360, background: 'var(--cs-rc-ink)', color: 'var(--cs-rc-bg)', borderRadius: 8, padding: '10px 12px 10px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}
    >
      <span style={{ flex: 1, lineHeight: 1.4 }}>{t('update.available')}</span>
      <button onClick={() => window.location.reload()} style={{ background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t('update.reload')}</button>
      <button onClick={() => setDismissed(latest)} aria-label={t('update.later')} style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.75, fontSize: 13, cursor: 'pointer', padding: '6px 4px' }}>{t('update.later')}</button>
    </div>
  )
}

export default UpdateBanner
