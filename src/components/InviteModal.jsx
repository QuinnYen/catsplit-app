// 邀請成員彈窗：QR Code ＋ 各種分享方式。要新增方式（Email、其他平台…）就在 actions 加一筆。
import { useEffect, useState } from 'react'
import { X, Copy, Check, MessageCircle, Pin } from 'lucide-react'
import { buildLineMessages } from '../utils/shareContent'

const InviteModal = ({ content, text, liff, onClose }) => {
  const { enterUrl: url, title } = content
  const [qr, setQr] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    // 產生 QR Code 的套件只有開邀請彈窗才需要，用到才下載
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: '#3d2b1f', light: '#ffffff' } }))
      .then(dataUrl => { if (!cancelled) setQr(dataUrl) })
      .catch(e => console.warn('QR Code 產生失敗', e))
    return () => { cancelled = true }
  }, [url])

  const canLineShare = !!liff?.isApiAvailable?.('shareTargetPicker')

  // 外部：先自動複製連結，再彈出系統內建分享框（瀏覽器不支援就只複製）
  const externalShare = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      if (!navigator.share) prompt('請複製這個邀請連結', url)
    }
    if (!navigator.share) return
    try {
      await navigator.share({ title, text, url })
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('navigator.share 失敗', e)
    }
  }

  const lineShare = async () => {
    try {
      await liff.shareTargetPicker([{ type: 'text', text: `${text}\n${url}` }])
    } catch (e) {
      console.warn('shareTargetPicker 失敗', e)
    }
  }

  // 貼到群組當入口：不帶「邀請」字眼的卡片，平常進來記帳用（卡片只有 LINE 看得到）
  const entryShare = async () => {
    try {
      await liff.shareTargetPicker(buildLineMessages(content))
    } catch (e) {
      console.warn('shareTargetPicker 失敗', e)
    }
  }

  const actions = [
    canLineShare && { key: 'line', label: '[邀請] 分享到 LINE', Icon: MessageCircle, onClick: lineShare },
    canLineShare && { key: 'entry', label: '[卡片] 貼到群組當公告', Icon: Pin, onClick: entryShare },
    { key: 'external', label: copied ? '[外部] 已複製連結' : '[外部] 複製連結', Icon: copied ? Check : Copy, onClick: externalShare },
  ].filter(Boolean)

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '20px 20px 0 0', padding: 20, paddingBottom: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#3d2b1f' }}>邀請成員</div>
          <button onClick={onClose} aria-label="關閉" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <X size={20} color="#b08060" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ width: 200, height: 200, borderRadius: 16, border: '0.5px solid #f0d5c0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {qr
              ? <img src={qr} alt="邀請 QR Code" style={{ width: '100%', height: '100%' }} />
              : <span style={{ fontSize: 12, color: '#b08060' }}>產生中...</span>}
          </div>
          <div style={{ fontSize: 12, color: '#b08060', marginTop: 8 }}>用手機相機或 LINE 掃描即可加入</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {actions.map(({ key, label, Icon, onClick }) => (
            <button
              key={key}
              onClick={onClick}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: '0.5px solid #f0d5c0', background: '#fff3ec', fontSize: 14, color: '#3d2b1f', cursor: 'pointer', textAlign: 'left' }}
            >
              <Icon size={18} color="#FF8C42" />{label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default InviteModal
