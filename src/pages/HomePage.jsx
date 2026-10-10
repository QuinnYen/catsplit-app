// / — 首頁：未登入顯示登入畫面；已登入顯示使用者資訊、消費總覽與我的群組列表，頭像可開啟選單（設定、收款方式、條款、登出）。
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, orderBy, onSnapshot, getDoc, doc } from 'firebase/firestore'
import { Settings, Users, Wallet, Calculator, Check, Moon, Cat, BedDouble, Sun, PawPrint, Coffee, Utensils, Fish, Cookie, CloudSun, Sunset, Soup, FileText, ShieldCheck, LogOut, QrCode, MessageCircle } from 'lucide-react'
import { db } from '../config/firebase'
import { OFFICIAL_ACCOUNT_URL } from '../config/liff'
import { useApp, MAX_GUEST_NAMES } from '../context/AppContext'
import { useI18n } from '../i18n/I18nProvider'
import { describeActivity } from '../i18n/legacy'
import Avatar from '../components/Avatar'
import GroupIcon from '../components/GroupIcon'
import PawDecor from '../components/PawDecor'
import { getCurrency } from '../config/currencies'
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

const HomePage = () => {
  const { user, loading: authLoading, loginWithLine, logout, guestNames } = useApp()
  const { t, fmt, lang } = useI18n()
  const navigate = useNavigate()
  // 英文版條款與隱私權政策是另一份靜態頁；中文版維持原網址
  const legalHref = (page) => lang === 'en' ? `/${page}.en.html` : `/${page}.html`
  const [{ Icon: GreetingIcon, key: greetingKey }] = useState(getGreeting)
  const [groups, setGroups] = useState([])
  const [groupsLoaded, setGroupsLoaded] = useState(false)
  const loading = authLoading || (!!user && !groupsLoaded)
  const [showArchived, setShowArchived] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [openedAt] = useState(Date.now)

  // 訪客：首頁列出這個瀏覽器選過名字的群組（每個群組的「我」是各自的訪客名字 id）
  const guestKey = user?.guest ? guestNames.map(g => `${g.groupId}:${g.memberId}`).join(',') : ''
  const myIdIn = (group) => user?.guest
    ? guestNames.find(g => g.groupId === group.id)?.memberId
    : user?.uid

  useEffect(() => {
    if (authLoading || !guestKey) return
    let cancelled = false
    const entries = guestKey.split(',').map(e => e.split(':'))
    Promise.all(entries.map(([gid]) => getDoc(doc(db, 'groups', gid)).catch(() => null)))
      .then(snaps => {
        if (cancelled) return
        // 名字已被認領或移除的群組不顯示
        const data = snaps
          .map((snap, i) => snap?.exists() && snap.data().members?.includes(entries[i][1]) ? { id: snap.id, ...snap.data() } : null)
          .filter(Boolean)
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
        setGroups(data)
        setGroupsLoaded(true)
      })
    return () => { cancelled = true }
  }, [guestKey, authLoading])

  useEffect(() => {
    if (authLoading) return
    if (!user || user.guest) return
    const q = query(
      collection(db, 'groups'),
      where('members', 'array-contains', user.uid),
      orderBy('createdAt', 'desc')
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setGroups(data)
      setGroupsLoaded(true)
    }, (error) => {
      console.error('Failed to load groups:', error)
      setGroupsLoaded(true)
    })
    return () => unsubscribe()
  }, [user, authLoading])

  const handleLogout = () => {
    if (confirm(user?.guest ? t('home.logoutConfirmGuest') : t('home.logoutConfirm'))) logout()
  }

  const activeGroups = groups.filter(g => !g.archived)
  const archivedGroups = groups.filter(g => g.archived)

  // 最新動態：所有群組中最近一次的新增支出／轉帳（群組文件上的 lastActivity），只取最新一筆
  const latest = activeGroups
    .filter(g => g.lastActivity)
    .map(g => ({ group: g, at: g.lastActivity.at?.toDate?.() ?? new Date(), name: g.lastActivity.name, activity: g.lastActivity }))
    .sort((a, b) => b.at - a.at)[0]
  // 一天內有動靜才顯示訊息，超過只留時間
  const latestIsRecent = latest && openedAt - latest.at.getTime() < 24 * 60 * 60 * 1000

  if (!authLoading && !user) {
    return (
      <div style={{ minHeight: '100vh', background: '#fff8f4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
          {/* 裝飾 */}
          <PawDecor size={72} color="#FF8C42" opacity={0.08} style={{ top: -24, right: -8, bottom: 'auto' }} />

          {/* Logo / Icon */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <img src={catLogo} alt={t('app.title')} style={{ width: 80, height: 80, marginBottom: 16 }} />
            <div style={{ fontSize: 26, fontWeight: 700, color: '#3d2b1f', marginBottom: 6 }}>{t('app.title')}</div>
            <div style={{ fontSize: 14, color: '#b08060', lineHeight: 1.6 }}>
              {t('home.tagline1')}<br />{t('home.tagline2')}
            </div>
          </div>

          {/* 特色說明 */}
          <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: '16px 18px', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { Icon: Users, text: t('home.feature1') },
              { Icon: Wallet, text: t('home.feature2') },
              { Icon: Calculator, text: t('home.feature3') },
            ].map(({ Icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 32, display: 'flex', justifyContent: 'center', flexShrink: 0 }}><Icon size={20} color="#FF8C42" /></div>
                <div style={{ fontSize: 13, color: '#5a3e2b' }}>{text}</div>
              </div>
            ))}
          </div>

          {/* LINE 登入按鈕 */}
          <button
            onClick={() => loginWithLine()}
            style={{ width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', background: '#06C755', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 4px 16px rgba(6,199,85,0.35)' }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 2C6.03 2 2 5.58 2 10c0 3.54 2.56 6.57 6.24 7.73-.09.31-.56 1.97-.64 2.27 0 0-.04.14.07.19.11.06.24.01.24.01.32-.04 3.72-2.45 4.09-2.7.66.09 1.34.14 2.03.14 4.97 0 9-3.58 9-8s-4.03-8-9-8z" fill="white"/>
            </svg>
            {t('home.loginLine')}
          </button>
          <p style={{ marginTop: 14, fontSize: 12, color: '#b08060', textAlign: 'center', lineHeight: 1.6 }}>
            {t('home.agreePrefix')}
            <a href={legalHref('terms')} style={{ color: '#FF6B1A' }}>{t('home.terms')}</a>
            {t('home.and')}
            <a href={legalHref('privacy')} style={{ color: '#FF6B1A' }}>{t('home.privacy')}</a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#fff8f4' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)', padding: '20px 16px 28px', position: 'relative', overflow: 'hidden' }}>

        {/* 裝飾爪印 */}
        <PawDecor style={{ right: 14, bottom: -8 }} />

        {/* 使用者資訊 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
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
                style={{ background: '#ffe0c8', border: '2px solid rgba(255,255,255,0.6)' }}
              />
            </button>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <GreetingIcon size={12} />{t(greetingKey)}
              </div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{user?.name}</div>
            </div>
          </div>
        </div>

        {/* 最新動態卡片 */}
        <div
          onClick={latestIsRecent ? () => navigate(`/group/${latest.group.id}`) : undefined}
          style={{ cursor: latestIsRecent ? 'pointer' : 'default', background: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 14, border: '1px solid rgba(255,255,255,0.3)' }}
        >
          {latestIsRecent ? (
            <>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16 }}>{latest.group.name}・{latest.name ?? t('common.someone')}</div>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 500, marginTop: 4 }}>{describeActivity(latest.activity, t)}</div>
            </>
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16 }}>{t('home.noActivity')}</div>
          )}
        </div>
      </div>

      {/* 內容 */}
      <div style={{ padding: '16px', flex: 1, paddingBottom: 24, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#3d2b1f' }}>{t('home.myGroups')}</div>
          {!user?.guest && (
            <button
              onClick={() => navigate('/create')}
              style={{ background: '#FF8C42', color: '#fff', border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
            >
              {t('home.create')}
            </button>
          )}
        </div>

        {user?.guest && (
          <div style={{ background: '#fff3ec', border: '0.5px solid #f0d5c0', borderRadius: 14, padding: 12, marginBottom: 12, fontSize: 12, color: '#b08060', lineHeight: 1.6 }}>
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
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#b08060' }}>{t('common.loading')}</div>
        )}

        {/* 空狀態 */}
        {!loading && activeGroups.length === 0 && archivedGroups.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <GroupIcon icon="paw" color="orange" size={72} />
            </div>
            <div style={{ color: '#b08060', fontSize: 14, marginBottom: 4 }}>{t('home.emptyTitle')}</div>
            <div style={{ color: '#c4a882', fontSize: 13 }}>{t('home.emptyHint')}</div>
          </div>
        )}

        {/* 群組卡片 render helper */}
        {!loading && (() => {
          const renderCard = (group) => {
            const profiles = Object.values(group.memberProfiles || {}).slice(0, 3)
            const bal = group.memberBalances?.[myIdIn(group)] ?? null
            const isSettled = bal !== null && Math.abs(bal) < 0.01
            const isPositive = bal !== null && bal > 0.01
            return (
              <div
                key={group.id}
                onClick={() => navigate(`/group/${group.id}`)}
                style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #f0d5c0', padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}
                onTouchStart={e => e.currentTarget.style.transform = 'scale(0.97)'}
                onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <GroupIcon icon={group.icon} color={group.iconColor} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#3d2b1f', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {group.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b08060' }}>
                    <div style={{ display: 'flex' }}>
                      {profiles.map((member, i) => (
                        <Avatar key={i} src={member.avatar} name={member.name} size={18} style={{ border: '1.5px solid #fff', marginLeft: i === 0 ? 0 : -5 }} />
                      ))}
                      {(group.members?.length || 0) > profiles.length && (
                        <div style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid #fff', marginLeft: -5, background: '#f0d5c0', color: '#b08060', fontSize: 9, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
                          +{group.members.length - profiles.length}
                        </div>
                      )}
                    </div>
                    {t('group.memberCount', { n: group.members?.length })}
                  </div>
                </div>
                {bal === null ? (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#FF6B1A' }}>
                      {getCurrency(group.baseCurrency).symbol} {fmt.num(group.totalAmount || 0)}
                    </div>
                    <div style={{ fontSize: 11, color: '#b08060' }}>{t('group.totalExpense')}</div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: isSettled ? '#b08060' : isPositive ? '#4caf50' : '#FF6B1A' }}>
                      {isSettled ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Check size={13} strokeWidth={3} /> {t('home.settled')}
                        </span>
                      ) : isPositive
                        ? `+${getCurrency(group.baseCurrency).symbol} ${fmt.num(Math.round(bal))}`
                        : `${getCurrency(group.baseCurrency).symbol} ${fmt.num(Math.round(bal))}`}
                    </div>
                    <div style={{ fontSize: 11, color: '#b08060' }}>
                      {isSettled ? '' : isPositive ? t('home.toReceive') : t('home.toPay')}
                    </div>
                  </div>
                )}
                <div style={{ color: '#e0b898', fontSize: 18 }}>›</div>
              </div>
            )
          }

          return (
            <>
              {/* 一般群組 */}
              {activeGroups.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {activeGroups.map(renderCard)}
                </div>
              )}

              {/* 已封存群組 */}
              {archivedGroups.length > 0 && (
                <div style={{ marginTop: activeGroups.length > 0 ? 20 : 0 }}>
                  <button
                    onClick={() => setShowArchived(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 10 }}
                  >
                    <span style={{ fontSize: 12, color: '#b08060', fontWeight: 500 }}>{t('home.archived', { n: archivedGroups.length })}</span>
                    <span style={{ fontSize: 11, color: '#c4a882', transform: showArchived ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform 0.2s' }}>›</span>
                  </button>
                  {showArchived && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.65 }}>
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
          <div style={{ position: 'fixed', top: 70, left: 16, zIndex: 101, width: 220, background: '#fff', borderRadius: 14, border: '0.5px solid #f0d5c0', boxShadow: '0 6px 24px rgba(0,0,0,0.18)', padding: '2px 14px' }}>
            <div style={{ position: 'absolute', top: -6, left: 14, width: 12, height: 12, background: '#fff', borderTop: '0.5px solid #f0d5c0', borderLeft: '0.5px solid #f0d5c0', transform: 'rotate(45deg)' }} />
            {[
              { Icon: Settings, label: t('group.settings'), onClick: () => navigate('/settings') },
              // 訪客沒有穩定身分，不提供收款方式
              ...(!user?.guest ? [{ Icon: QrCode, label: t('home.menu.payment'), onClick: () => navigate('/payment-methods') }] : []),
              { Icon: MessageCircle, label: t('group.menu.official'), href: OFFICIAL_ACCOUNT_URL },
              { Icon: FileText, label: t('home.menu.terms'), href: legalHref('terms') },
              { Icon: ShieldCheck, label: t('home.menu.privacy'), href: legalHref('privacy') },
              { Icon: LogOut, label: t('home.menu.logout'), onClick: handleLogout },
            ].map(({ Icon, label, href, onClick }, i) => {
              const style = { width: '100%', padding: '14px 4px', background: 'none', border: 'none', borderTop: i === 0 ? 'none' : '0.5px solid #f0d5c0', display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: '#3d2b1f', cursor: 'pointer', textAlign: 'left', textDecoration: 'none', boxSizing: 'border-box' }
              const content = <><Icon size={18} color="#b08060" />{label}</>
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