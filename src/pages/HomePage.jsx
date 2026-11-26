// / — 分帳首頁：使用者資訊與我的群組列表，頂部是使用者列（頭像點開帳號選單）；底部是 SplitTabBar（首頁／收款／建立群組／付款／設定）。未登入由 App.jsx 的 LoginScreen 處理。
import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useApp, MAX_GUEST_NAMES } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import useMyGroups from '../hooks/useMyGroups'
import Avatar from '../components/Avatar'
import UserHeader from '../components/UserHeader'
import GroupIcon from '../components/GroupIcon'
import SplitTabBar from '../components/SplitTabBar'
import { computeBudgetStatus } from '../utils/budget'
import { getBalanceStatus } from '../utils/balanceStatus'

const GROUPS_PER_PAGE = 10

const HomePage = () => {
  const { user, loading: authLoading, loginWithLine, guestNames } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const { groups, groupsLoaded } = useMyGroups()
  const loading = authLoading || (!!user && !groupsLoaded)
  const [showArchived, setShowArchived] = useState(false)
  const [page, setPage] = useState(1)

  const myIdIn = (group) => user?.guest
    ? guestNames.find(g => g.groupId === group.id)?.memberId
    : user?.uid

  const activeGroups = groups.filter(g => !g.archived)
  const archivedGroups = groups.filter(g => g.archived)
  // 一般群組每頁 10 個；群組減少（封存、退出）後頁碼超出範圍時退回最後一頁
  const pageCount = Math.max(1, Math.ceil(activeGroups.length / GROUPS_PER_PAGE))
  const currentPage = Math.min(page, pageCount)
  const pagedGroups = activeGroups.slice((currentPage - 1) * GROUPS_PER_PAGE, currentPage * GROUPS_PER_PAGE)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--cs-rc-bg)' }}>

      <UserHeader />

      {/* 內容 */}
      <div className="cs-body" style={{ padding: '16px', flex: 1, paddingBottom: 'calc(var(--tabbar-h) + 24px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--cs-rc-ink)' }}>{t('home.myGroups')}</div>
        </div>

        {user?.guest && (
          <div style={{ background: 'var(--cs-rc-card)', border: '1px dashed var(--cs-rc-rule)', borderRadius: 6, padding: 12, marginBottom: 12, fontSize: 12, color: 'var(--cs-rc-sub)', lineHeight: 1.6 }}>
            {t('home.guestNotice', { max: MAX_GUEST_NAMES })}
            <button
              onClick={() => loginWithLine('/')}
              style={{ display: 'block', marginTop: 8, padding: '8px 14px', borderRadius: 6, border: 'none', background: '#06C755', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              {t('home.bindLine')}
            </button>
          </div>
        )}

        {/* 載入中 */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--cs-rc-sub)' }}>{t('common.loading')}</div>
        )}

        {/* 空狀態 */}
        {!loading && activeGroups.length === 0 && archivedGroups.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <GroupIcon icon="paw" color="orange" size={72} />
            </div>
            <div style={{ color: 'var(--cs-rc-sub)', fontSize: 14, marginBottom: 4 }}>{t('home.emptyTitle')}</div>
            <div style={{ color: 'var(--cs-text-mute)', fontSize: 13 }}>{t('home.emptyHint')}</div>
          </div>
        )}

        {/* 群組卡片 render helper */}
        {!loading && (() => {
          const renderCard = (group) => {
            const profiles = Object.values(group.memberProfiles || {}).slice(0, 3)
            const bal = group.memberBalances?.[myIdIn(group)] ?? null
            const balStatus = bal !== null ? getBalanceStatus(bal, group.baseCurrency) : null
            const isSettled = balStatus === 'settled'
            const isPositive = balStatus === 'receive'
            // 只顯示超支徽章（用群組彙總欄位，不讀帳目）；沒有超支時名稱列與原本相同
            const isOverBudget = computeBudgetStatus(group.budget, group)?.level === 'over'
            // 有封面時卡片高度不變，封面當背景（lazy 載入）加暗色漸層，文字改淺色
            const hasCover = !!group.coverUrl
            const subColor = hasCover ? 'rgba(255,255,255,0.85)' : 'var(--cs-rc-sub)'
            const statusStyle = { fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right' }
            const nameStyle = { fontSize: 15, fontWeight: 600, color: hasCover ? '#fff' : 'var(--cs-rc-ink)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
            return (
              <div
                key={group.id}
                onClick={() => navigate(`/group/${group.id}`)}
                style={{ background: 'var(--cs-rc-card)', borderRadius: 6, border: '1px solid var(--cs-rc-rule)', padding: '14px 0 14px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none', position: 'relative', overflow: 'hidden', isolation: 'isolate' }}
                onTouchStart={e => e.currentTarget.style.transform = 'scale(0.97)'}
                onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                {hasCover && (
                  <>
                    <img src={group.coverUrl} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -2 }} />
                    <div style={{ position: 'absolute', inset: 0, zIndex: -1, background: 'linear-gradient(90deg, rgba(0,0,0,0.4), rgb(53 19 0) 100%)' }} />
                  </>
                )}
                <GroupIcon icon={group.icon} color={group.iconColor} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isOverBudget ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{ ...nameStyle, marginBottom: 0, minWidth: 0 }}>{group.name}</div>
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 500, color: 'var(--cs-danger)', background: 'var(--cs-danger-bg)', borderRadius: 6, padding: '1px 6px' }}>
                        {t('home.overBudget')}
                      </span>
                    </div>
                  ) : (
                    <div style={nameStyle}>
                      {group.name}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: subColor }}>
                    <div style={{ display: 'flex' }}>
                      {profiles.map((member, i) => (
                        <Avatar key={i} src={member.avatar} name={member.name} size={18} style={{ border: `1.5px solid ${hasCover ? 'var(--cs-on-brand)' : 'var(--cs-rc-card)'}`, marginLeft: i === 0 ? 0 : -5 }} />
                      ))}
                      {(group.members?.length || 0) > profiles.length && (
                        <div style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${hasCover ? 'var(--cs-on-brand)' : 'var(--cs-rc-card)'}`, marginLeft: -5, background: 'var(--cs-rc-rule)', color: 'var(--cs-rc-sub)', fontSize: 9, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
                          +{group.members.length - profiles.length}
                        </div>
                      )}
                    </div>
                    {t('group.memberCount', { n: group.members?.length })}
                  </div>
                </div>
                {/* 票根切口：右欄放狀態字樣（待收款／待付款／已結清），虛線與缺口放在欄內 */}
                <div style={{ position: 'relative', alignSelf: 'stretch', margin: '-14px 0', minWidth: 108, boxSizing: 'border-box', padding: '0 12px', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderLeft: `1.5px dashed ${hasCover ? 'rgba(255,255,255,0.4)' : 'var(--cs-rc-rule)'}` }} />
                <div aria-hidden="true" style={{ position: 'absolute', top: -6, left: -6, width: 12, height: 12, borderRadius: '50%', background: 'var(--cs-rc-bg)', border: '1px solid var(--cs-rc-rule)', boxSizing: 'border-box' }} />
                <div aria-hidden="true" style={{ position: 'absolute', bottom: -6, left: -6, width: 12, height: 12, borderRadius: '50%', background: 'var(--cs-rc-bg)', border: '1px solid var(--cs-rc-rule)', boxSizing: 'border-box' }} />
                {bal !== null && (
                  <div style={{ ...statusStyle, color: isSettled ? subColor : isPositive ? (hasCover ? 'var(--cs-on-cover-success)' : 'var(--cs-rc-get)') : (hasCover ? 'var(--cs-on-cover-accent)' : 'var(--cs-rc-owe)') }}>
                    {isSettled ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Check size={15} strokeWidth={3} /> {t('home.settled')}
                      </span>
                    ) : isPositive ? t('home.toReceive') : t('home.toPay')}
                  </div>
                )}
                </div>
              </div>
            )
          }

          return (
            <>
              {/* 一般群組 */}
              {activeGroups.length > 0 && (
                <div className="cs-group-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pagedGroups.map(renderCard)}
                </div>
              )}
              {pageCount > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14 }}>
                  {[
                    { label: t('home.pagePrev'), to: currentPage - 1, disabled: currentPage === 1 },
                    { label: t('home.pageNext'), to: currentPage + 1, disabled: currentPage === pageCount },
                  ].map(({ label, to, disabled }, i) => (
                    <Fragment key={label}>
                      {i === 1 && <span style={{ fontSize: 13, color: 'var(--cs-rc-sub)' }}>{currentPage} / {pageCount}</span>}
                      <button
                        onClick={() => { setPage(to); window.scrollTo({ top: 0 }) }}
                        disabled={disabled}
                        style={{ border: '1px solid var(--cs-rc-rule)', background: 'var(--cs-rc-card)', color: 'var(--cs-rc-sub)', borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}
                      >
                        {label}
                      </button>
                    </Fragment>
                  ))}
                </div>
              )}

              {/* 已封存群組 */}
              {archivedGroups.length > 0 && (
                <div style={{ marginTop: activeGroups.length > 0 ? 20 : 0 }}>
                  <button
                    onClick={() => setShowArchived(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 10 }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--cs-rc-sub)', fontWeight: 500 }}>{t('home.archived', { n: archivedGroups.length })}</span>
                    <span style={{ fontSize: 11, color: 'var(--cs-text-mute)', transform: showArchived ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform 0.2s' }}>›</span>
                  </button>
                  {showArchived && (
                    <div className="cs-group-list" style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.65 }}>
                      {archivedGroups.map(renderCard)}
                    </div>
                  )}
                </div>
              )}
            </>
          )
        })()}

      </div>

      <SplitTabBar />
    </div>
  )
}

export default HomePage