// 匯率各頁右上角的「首頁」圓鈕（回入口頁 /home）：離開匯率只有這一個出口，底部列左下角改成「匯率」，不會誤點跳出去。
// 樣式和記帳頁頂部的圓鈕一致。
import { useNavigate } from 'react-router-dom'
import { House } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'

const FxHomeButton = () => {
  const navigate = useNavigate()
  const { t } = useI18n()
  return (
    <button
      onClick={() => navigate('/home')} aria-label={t('tab.home')}
      style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.65)', background: 'none', color: 'var(--cs-rc-head-text)', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}
    ><House size={18} /></button>
  )
}

export default FxHomeButton
