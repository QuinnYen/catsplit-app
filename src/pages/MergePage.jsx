// /merge — 帳號合併確認頁：顯示合併預覽（群組、帳目、個人資料衝突），使用者確認後才執行。
// 預覽由設定頁的綁定產生並暫存（見 LoginMethodsCard 與 AuthCallbackPage），10 分鐘內有效。
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import identityApi from '../utils/identityApi'
import {
  loadPreview, clearPreview, initialChoices, buildResolutionsPayload, conflictLabelKey, conflictValues, summarizePreview, mergeErrorKey,
} from '../utils/mergeUi'

const card = { background: 'var(--cs-card)', borderRadius: 6, border: '0.5px solid var(--cs-border)', padding: 14 }
const sectionLabel = { fontSize: 12, fontWeight: 500, color: 'var(--cs-text-sub)', marginBottom: 8 }

const Header = ({ onBack, title, backLabel }) => (
  <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '16px 16px 20px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={onBack} aria-label={backLabel} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}>‹</button>
      <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{title}</div>
    </div>
  </div>
)

const MergePage = () => {
  const { getIdToken, completeMerge } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  // 預覽逾時（10 分鐘）或不存在都當作沒有，顯示請使用者重新綁定
  const [preview] = useState(() => loadPreview(window.localStorage, Date.now()))
  const [choices, setChoices] = useState(() => (preview ? initialChoices(preview) : {}))
  const [working, setWorking] = useState(false)
  const [errorKey, setErrorKey] = useState(null)
  const backToSettings = () => navigate('/settings', { replace: true })

  if (!preview) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cs-bg)' }}>
        <Header onBack={backToSettings} title={t('merge.title')} backLabel={t('merge.back')} />
        <div className="cs-body" style={{ padding: 16 }}>
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--cs-text)', lineHeight: 1.6 }}>{t('merge.missing')}</div>
            <button onClick={backToSettings} style={{ padding: '12px 0', borderRadius: 6, border: 'none', background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{t('merge.back')}</button>
          </div>
        </div>
      </div>
    )
  }

  const sum = summarizePreview(preview)
  const needsChoice = preview.personal?.needsChoice ?? []
  const providerName = preview.provider ? t(`identity.provider.${preview.provider}`) : ''

  const handleConfirm = async () => {
    if (!confirm(t('merge.confirmPrompt'))) return
    setWorking(true)
    setErrorKey(null)
    try {
      const result = await identityApi.executeMerge(await getIdToken(), preview.mergeId, buildResolutionsPayload(preview, choices))
      clearPreview(window.localStorage)
      // 整頁重新載入，所以成功後不需要還原 working
      await completeMerge(result)
    } catch (e) {
      console.error('merge failed', e?.code || e)
      // 逾時或找不到，預覽已經沒用了；其他錯誤（例如部分群組失敗）保留預覽，讓使用者再按一次繼續
      if (['preview_expired', 'merge_not_found'].includes(e?.code)) clearPreview(window.localStorage)
      setErrorKey(mergeErrorKey(e?.code))
      setWorking(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cs-bg)', paddingBottom: 40 }}>
      <Header onBack={backToSettings} title={t('merge.title')} backLabel={t('merge.back')} />
      <div className="cs-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 14, color: 'var(--cs-text)', lineHeight: 1.7 }}>{t('merge.intro', { provider: providerName })}</div>
          <div style={{ fontSize: 12, color: 'var(--cs-text-sub)', lineHeight: 1.7, marginTop: 8 }}>
            {preview.initiatorIsDropped ? t('merge.initiatorDropped') : t('merge.otherDropped')}
          </div>
        </div>

        <div style={card}>
          <div style={sectionLabel}>{t('merge.summary')}</div>
          <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', fontSize: 13, color: 'var(--cs-text)', lineHeight: 1.8 }}>
            {sum.bothIn > 0 && <li>{t('merge.groupsBoth', { n: sum.bothIn })}</li>}
            {sum.dropOnly > 0 && <li>{t('merge.groupsOnlyOne', { n: sum.dropOnly })}</li>}
            {sum.records > 0 && <li>{t('merge.records', { n: sum.records })}</li>}
            {sum.selfTransfers > 0 && <li>{t('merge.selfTransfers', { n: sum.selfTransfers })}</li>}
            {sum.personalDocs > 0 && <li>{t('merge.personalDocs', { n: sum.personalDocs })}</li>}
          </ul>
        </div>

        {needsChoice.length > 0 && (
          <div style={card}>
            <div style={sectionLabel}>{t('merge.conflicts')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {needsChoice.map((c) => {
                const labelKey = conflictLabelKey(c.path)
                const values = conflictValues(c, preview.initiatorIsDropped)
                return (
                  <fieldset key={c.path} disabled={working} style={{ border: 'none', margin: 0, padding: 0 }}>
                    <legend style={{ fontSize: 14, fontWeight: 500, color: 'var(--cs-text)', marginBottom: 6, padding: 0 }}>
                      {labelKey ? t(labelKey) : t('merge.conflict.other', { path: c.path })}
                    </legend>
                    {['initiator', 'other'].map((choice) => (
                      <label key={choice} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, color: 'var(--cs-text)', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={c.path}
                          checked={choices[c.path] === choice}
                          onChange={() => setChoices((prev) => ({ ...prev, [c.path]: choice }))}
                        />
                        <span>
                          {values
                            ? t('merge.choice.withValue', { who: t(`merge.choice.${choice}`), value: values[choice] || t('merge.choice.noName') })
                            : t(`merge.choice.${choice}`)}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ fontSize: 12, color: 'var(--cs-danger)', lineHeight: 1.7 }}>{t('merge.warning')}</div>
        {errorKey && <div role="alert" style={{ fontSize: 13, color: 'var(--cs-danger)', lineHeight: 1.7 }}>{t(errorKey)}</div>}
        {working && <div role="status" style={{ fontSize: 13, color: 'var(--cs-text-sub)' }}>{t('merge.merging')}</div>}

        <button
          onClick={handleConfirm}
          disabled={working}
          style={{ padding: '14px 0', borderRadius: 6, border: 'none', background: working ? 'var(--cs-line-soft)' : 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', fontSize: 15, fontWeight: 700, cursor: working ? 'not-allowed' : 'pointer' }}
        >
          {t('merge.confirm')}
        </button>
        <button
          onClick={() => { clearPreview(window.localStorage); backToSettings() }}
          disabled={working}
          style={{ padding: '12px 0', borderRadius: 6, border: '0.5px solid var(--cs-border)', background: 'var(--cs-card)', color: 'var(--cs-text)', fontSize: 14, cursor: working ? 'not-allowed' : 'pointer' }}
        >
          {t('merge.cancel')}
        </button>
      </div>
    </div>
  )
}

export default MergePage
