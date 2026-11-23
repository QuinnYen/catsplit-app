// /link — 從 LINE 內「用 Google 綁定」帶到手機外部瀏覽器的頁面：把網址上的一次性連結碼兌換成同一個帳號的登入，
// 再到設定頁用手機上已登入的 Google 帳號完成綁定。LINE 內建瀏覽器無法用 Google 登入，所以才要換到外部瀏覽器。
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import identityApi from '../utils/identityApi'
import { readLinkCode } from '../utils/authSession'
import { mergeErrorKey } from '../utils/mergeUi'
import GroupIcon from '../components/GroupIcon'

const LinkPage = () => {
  const { completeLinkLogin } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  // 碼在網址上，只讀一次（讀取沒有副作用，嚴格模式重複渲染也沒關係）；缺少時直接顯示錯誤
  const [code] = useState(() => readLinkCode({ hash: window.location.hash, search: window.location.search }))
  const [errorKey, setErrorKey] = useState(code ? null : 'link.missing')
  const ranRef = useRef(false)

  useEffect(() => {
    // 嚴格模式會跑兩次 effect，但碼只能兌換一次
    if (ranRef.current) return
    ranRef.current = true
    // 立刻把碼從網址與瀏覽紀錄拿掉，之後的請求與上一頁都不會帶著它
    window.history.replaceState(null, '', '/link')
    if (!code) return
    identityApi.redeemLinkCode(code)
      .then(async (data) => {
        await completeLinkLogin(data)
        navigate('/settings?link=1', { replace: true })
      })
      .catch((e) => {
        console.error('redeem link code failed', e?.code || e)
        setErrorKey(mergeErrorKey(e?.code))
      })
  }, [code, completeLinkLogin, navigate])

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, var(--cs-bg) 0%, var(--cs-soft-2) 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <GroupIcon icon="paw" color="orange" size={72} />
      </div>
      {errorKey ? (
        <>
          <div role="alert" style={{ fontSize: 15, color: 'var(--cs-danger)', marginBottom: 24, textAlign: 'center', lineHeight: 1.7, maxWidth: 320 }}>{t(errorKey)}</div>
          <button
            onClick={() => navigate('/', { replace: true })}
            style={{ background: 'var(--cs-card)', color: 'var(--cs-text)', border: '0.5px solid var(--cs-border)', borderRadius: 6, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}
          >
            {t('link.back')}
          </button>
        </>
      ) : (
        <div style={{ fontSize: 14, color: 'var(--cs-text-sub)' }}>{t('link.working')}</div>
      )}
    </div>
  )
}

export default LinkPage
