// 邀請成員彈窗：QR Code ＋ 各種分享方式。要新增方式（Email、其他平台…）就在 actions 加一筆。
import { useEffect, useState } from 'react'
import { X, Copy, Check, Share2, MessageCircle } from 'lucide-react'

const InviteModal = ({ url, text, title, liff, onClose }) => {
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
  const canSystemShare = !!navigator.share

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('請複製這個邀請連結', url)
    }
  }

  const lineShare = async () => {
    try {
      await liff.shareTargetPicker([{ type: 'text', text: `${text}\n${url}` }])
    } catch (e) {
      console.warn('shareTargetPicker 失敗', e)
    }
  }

  const systemShare = async () => {
    try {
      await navigator.share({ title, text, url })
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('navigator.share 失敗', e)
    }
  }

  const actions = [
    canLineShare && { key: 'line', label: '分享到 LINE', Icon: MessageCircle, onClick: lineShare },
    canSystemShare && { key: 'system', label: '分享到其他 App', Icon: Share2, onClick: systemShare },
    { key: 'copy', label: copied ? '已複製' : '複製連結', Icon: copied ? Check : Copy, onClick: copyLink },
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
