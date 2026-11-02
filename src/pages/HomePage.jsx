// / — 首頁：未登入顯示登入畫面；已登入顯示使用者資訊、消費總覽與我的群組列表，頭像可開啟選單（設定、收款方式、條款、登出）。
import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Users, Wallet, Calculator, Check, Moon, Cat, BedDouble, Sun, PawPrint, Coffee, Utensils, Fish, Cookie, CloudSun, Sunset, Soup, LogOut, QrCode, PiggyBank } from 'lucide-react'
import { OFFICIAL_ACCOUNT_URL } from '../config/liff'
import { useApp, MAX_GUEST_NAMES } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import useMyGroups from '../hooks/useMyGroups'
import Avatar from '../components/Avatar'
import LineIcon from '../components/LineIcon'
import GroupIcon from '../components/GroupIcon'
import { getCurrency } from '../config/currencies'
import { computeBudgetStatus } from '../utils/budget'
import catLogo from '../assets/cat-logo.webp'

const GREETINGS = [
  // 0-4 深夜
  [{ Icon: Moon, key: 'greeting.n1' }, { Icon: Cat, key: 'greeting.n2' }, { Icon: BedDouble, key: 'greeting.n3' }],
  // 5-10 早上
  [{ Icon: Sun, key: 'greeting.m1' }, { Icon: PawPrint, key: 'greeting.m2' }, { Icon: Coffee, key: 'greeting.m3' }],
  // 11-13 中午
  [{ Icon: Utensils, key: 'greeting.d1' }, { Icon: Fish, key: 'greeting.d2' }, { Icon: PawPrint, key: 'greeting.d3' }],
  // 14-17 下午
  [{ Icon: Cookie, key: 'greeting.a1' }, { Icon: CloudSun, key: 'greeting.a2' }, { Icon: Coffee, key: 'greeting.a3' }],
  // 18-21 晚上
  [{ Icon: Sunset, key: 'greeting.e1' }, { Icon: Soup, key: 'greeting.e2' }, { Icon: PawPrint, key: 'greeting.e3' }],
  // 22-23 夜晚
  [{ Icon: Moon, key: 'greeting.l1' }, { Icon: BedDouble, key: 'greeting.l2' }, { Icon: Cat, key: 'greeting.l3' }],
]

const getGreeting = () => {
  const h = new Date().getHours()
  const bucket = h < 5 ? 0 : h < 11 ? 1 : h < 14 ? 2 : h < 18 ? 3 : h < 22 ? 4 : 5
  const options = GREETINGS[bucket]
  return options[Math.floor(Math.random() * options.length)]
}

const GROUPS_PER_PAGE = 10

const HomePage = () => {
  const { user, loading: authLoading, loginWithLine, logout, guestNames } = useApp()
  const { t, fmt, lang } = useI18n()
  const navigate = useNavigate()
  // 英文版條款與隱私權政策是另一份靜態頁；中文版維持原網址
  const legalHref = (page) => lang === 'en' ? `/${page}.en.html` : `/${page}.html`
  const [{ Icon: GreetingIcon, key: greetingKey }] = useState(getGreeting)
  const { groups, groupsLoaded } = useMyGroups()
  const loading = authLoading || (!!user && !groupsLoaded)
  const [showArchived, setShowArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [showSettings, setShowSettings] = useState(false)

  const myIdIn = (group) => user?.guest
    ? guestNames.find(g => g.groupId === group.id)?.memberId
    : user?.uid

  const handleLogout = () => {
    if (confirm(user?.guest ? t('home.logoutConfirmGuest') : t('home.logoutConfirm'))) logout()
  }

  const activeGroups = groups.filter(g => !g.archived)
  const archivedGroups = groups.filter(g => g.archived)
  // 一般群組每頁 10 個；群組減少（封存、退出）後頁碼超出範圍時退回最後一頁
  const pageCount = Math.max(1, Math.ceil(activeGroups.length / GROUPS_PER_PAGE))
  const currentPage = Math.min(page, pageCount)
  const pagedGroups = activeGroups.slice((currentPage - 1) * GROUPS_PER_PAGE, currentPage * GROUPS_PER_PAGE)

  if (!authLoading && !user) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cs-rc-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
          {/* Logo / Icon */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <img src={catLogo} alt={t('app.title')} style={{ width: 80, height: 80, marginBottom: 16 }} />
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--cs-rc-ink)', marginBottom: 6 }}>{t('app.title')}</div>
            <div style={{ fontSize: 14, color: 'var(--cs-rc-sub)', lineHeight: 1.6 }}>
              {t('home.tagline1')}<br />{t('home.tagline2')}
            </div>
          </div>

          {/* 特色說明 */}
          <div style={{ background: 'var(--cs-rc-card)', borderRadius: 6, border: '1px solid var(--cs-rc-rule)', padding: '4px 18px', marginBottom: 24 }}>
            {[
              { Icon: Users, text: t('home.feature1') },
              { Icon: Wallet, text: t('home.feature2') },
              { Icon: Calculator, text: t('home.feature3') },
            ].map(({ Icon, text }, i) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i === 0 ? 'none' : '1.5px dashed var(--cs-rc-rule)' }}>
                <div style={{ width: 32, display: 'flex', justifyContent: 'center', flexShrink: 0 }}><Icon size={20} color="var(--cs-rc-stamp)" /></div>
                <div style={{ fontSize: 13, color: 'var(--cs-rc-ink)' }}>{text}</div>
              </div>
            ))}
          </div>

          {/* LINE 登入按鈕 */}
          <button
            onClick={() => loginWithLine()}
            style={{ width: '100%', padding: '15px 0', borderRadius: 6, border: 'none', background: '#06C755', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 2C6.03 2 2 5.58 2 10c0 3.54 2.56 6.57 6.24 7.73-.09.31-.56 1.97-.64 2.27 0 0-.04.14.07.19.11.06.24.01.24.01.32-.04 3.72-2.45 4.09-2.7.66.09 1.34.14 2.03.14 4.97 0 9-3.58 9-8s-4.03-8-9-8z" fill="var(--cs-on-brand)"/>
            </svg>
            {t('home.loginLine')}
          </button>
          <p style={{ marginTop: 14, fontSize: 12, color: 'var(--cs-rc-sub)', textAlign: 'center', lineHeight: 1.6 }}>
            {t('home.agreePrefix')}
            <a href={legalHref('terms')} style={{ color: 'var(--cs-rc-stamp)' }}>{t('home.terms')}</a>
            {t('home.and')}
            <a href={legalHref('privacy')} style={{ color: 'var(--cs-rc-stamp)' }}>{t('home.privacy')}</a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--cs-rc-bg)' }}>

      {/* Header */}
      <div className="cs-header" style={{ background: 'var(--cs-rc-head)', padding: '20px 16px 22px', position: 'relative' }}>

        {/* 使用者資訊 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setShowSettings(true)}
              aria-label={t('group.settings')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', borderRadius: '50%' }}
            >
              <Avatar
                src={user?.avatar}
                name={user?.name}
                size={38}
                style={{ background: 'var(--cs-soft-2)', border: '2px solid var(--cs-rc-stamp)' }}
              />
            </button>
            <div>
              <div style={{ color: 'var(--cs-rc-head-text)', opacity: 0.75, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <GreetingIcon size={12} color="var(--cs-rc-stamp)" />{t(greetingKey)}
              </div>
              <div style={{ color: 'var(--cs-rc-head-text)', fontSize: 14, fontWeight: 500 }}>{user?.name}</div>
            </div>
          </div>
        </div>
      </div>
      {/* 收據撕邊：16px 一格的鋸齒，只露出上半 8px */}
      <div aria-hidden="true" style={{ height: 8, flexShrink: 0, backgroundImage: 'linear-gradient(135deg, var(--cs-rc-head) 25%, transparent 25%), linear-gradient(225deg, var(--cs-rc-head) 25%, transparent 25%)', backgroundSize: '16px 16px' }} />

      {/* 內容 */}
      <div className="cs-body" style={{ padding: '16px', flex: 1, paddingBottom: 24, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--cs-rc-ink)' }}>{t('home.myGroups')}</div>
          {!user?.guest && (
            <button
              onClick={() => navigate('/create')}
              style={{ background: 'var(--cs-rc-stamp)', color: 'var(--cs-rc-stamp-text)', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
            >
              {t('home.create')}
            </button>
          )}
        </div>

        {user?.guest && (
          <div style={{ background: 'var(--cs-rc-card)', border: '1px dashed var(--cs-rc-rule)', borderRadius: 6, padding: 12, marginBottom: 12, fontSize: 12, color: 'var(--cs-rc-sub)', lineHeight: 1.6 }}>
            {t('home.guestNotice', { max: MAX_GUEST_NAMES })}
            <button
              onClick={() => loginWithLine('/')}
              style={{ display: 'block', marginTop: 8, padding: '8px 14px', borderRadius: 10, border: 'none', background: '#06C755', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
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
            const isSettled = bal !== null && Math.abs(bal) < 0.01
            const isPositive = bal !== null && bal > 0.01
            // 只顯示超支徽章（用群組彙總欄位，不讀帳目）；沒有超支時名稱列與原本相同
            const isOverBudget = computeBudgetStatus(group.budget, group)?.level === 'over'
            // 有封面時卡片高度不變，封面當背景（lazy 載入）加暗色漸層，文字改淺色
            const hasCover = !!group.coverUrl
            const subColor = hasCover ? 'rgba(255,255,255,0.85)' : 'var(--cs-rc-sub)'
            const amountStyle = { fontFamily: 'var(--cs-rc-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' }
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
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 500, color: 'var(--cs-danger)', background: 'var(--cs-danger-bg)', borderRadius: 8, padding: '1px 6px' }}>
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
                {/* 票根切口：虛線加上下缺口，右側固定寬度放餘額 */}
                <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, right: 108, borderLeft: `1.5px dashed ${hasCover ? 'rgba(255,255,255,0.4)' : 'var(--cs-rc-rule)'}` }} />
                <div aria-hidden="true" style={{ position: 'absolute', top: -6, right: 102, width: 12, height: 12, borderRadius: '50%', background: 'var(--cs-rc-bg)', border: '1px solid var(--cs-rc-rule)', boxSizing: 'border-box' }} />
                <div aria-hidden="true" style={{ position: 'absolute', bottom: -6, right: 102, width: 12, height: 12, borderRadius: '50%', background: 'var(--cs-rc-bg)', border: '1px solid var(--cs-rc-rule)', boxSizing: 'border-box' }} />
                <div style={{ width: 108, boxSizing: 'border-box', padding: '0 12px', flexShrink: 0 }}>
                {bal === null ? (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ ...amountStyle, color: hasCover ? 'var(--cs-on-cover-accent)' : 'var(--cs-rc-ink)' }}>
                      {getCurrency(group.baseCurrency).symbol} {fmt.num(group.totalAmount || 0)}
                    </div>
                    <div style={{ fontSize: 11, color: subColor }}>{t('group.totalExpense')}</div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ ...amountStyle, color: isSettled ? subColor : isPositive ? (hasCover ? 'var(--cs-on-cover-success)' : 'var(--cs-rc-get)') : (hasCover ? 'var(--cs-on-cover-accent)' : 'var(--cs-rc-owe)') }}>
                      {isSettled ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Check size={13} strokeWidth={3} /> {t('home.settled')}
                        </span>
                      ) : isPositive
                        ? `+${getCurrency(group.baseCurrency).symbol} ${fmt.num(Math.round(bal))}`
                        : `${getCurrency(group.baseCurrency).symbol} ${fmt.num(Math.round(bal))}`}
                    </div>
                    <div style={{ fontSize: 11, color: subColor }}>
                      {isSettled ? '' : isPositive ? t('home.toReceive') : t('home.toPay')}
                    </div>
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

      {/* 設定氣泡：從頭像旁展開 */}
      {showSettings && (
        <>
          <div onClick={() => setShowSettings(false)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
          <div style={{ position: 'fixed', top: 70, left: 'max(16px, calc((100% - 720px) / 2 + 16px))', zIndex: 101, width: 220, background: 'var(--cs-rc-card)', borderRadius: 14, border: '0.5px solid var(--cs-rc-rule)', boxShadow: '0 6px 24px rgba(0,0,0,0.18)', padding: '2px 14px' }}>
            <div style={{ position: 'absolute', top: -6, left: 14, width: 12, height: 12, background: 'var(--cs-rc-card)', borderTop: '0.5px solid var(--cs-rc-rule)', borderLeft: '0.5px solid var(--cs-rc-rule)', transform: 'rotate(45deg)' }} />
            {[
              { Icon: Settings, label: t('group.settings'), onClick: () => navigate('/settings') },
              // 訪客沒有穩定身分，不提供收款方式
              ...(!user?.guest ? [{ Icon: QrCode, label: t('home.menu.payment'), onClick: () => navigate('/payment-methods') }] : []),
              ...(!user?.guest ? [{ Icon: PiggyBank, label: t('home.menu.savings'), onClick: () => navigate('/savings') }] : []),
              { Icon: LineIcon, label: t('group.menu.official'), href: OFFICIAL_ACCOUNT_URL },
              { Icon: LogOut, label: t('home.menu.logout'), onClick: handleLogout },
            ].map(({ Icon, label, href, onClick }, i) => {
              const style = { width: '100%', padding: '14px 4px', background: 'none', border: 'none', borderTop: i === 0 ? 'none' : '0.5px solid var(--cs-rc-rule)', display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: 'var(--cs-rc-ink)', cursor: 'pointer', textAlign: 'left', textDecoration: 'none', boxSizing: 'border-box' }
              const content = <><Icon size={18} color="var(--cs-rc-sub)" />{label}</>
              return href
                ? <a key={label} href={href} style={style}>{content}</a>
                : <button key={label} onClick={onClick} style={style}>{content}</button>
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default HomePage