import { useEffect, useState } from 'react'
import Cropper from 'react-easy-crop'
import { getCroppedBlob } from '../utils/cropImage'
import { useI18n } from '../i18n/I18nProvider'

export const COVER_ASPECT = 1.6

const CropModal = ({ imageSrc, aspect = COVER_ASPECT, onCancel, onConfirm }) => {
  const { t } = useI18n()
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixelCrop, setPixelCrop] = useState(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleConfirm = async () => {
    if (!pixelCrop || working) return
    setWorking(true)
    try {
      onConfirm(await getCroppedBlob(imageSrc, pixelCrop))
    } catch (error) {
      console.error('Crop failed', error)
      setWorking(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#1a1a1a', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', flex: 1 }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, areaPixels) => setPixelCrop(areaPixels)}
        />
      </div>

      <div style={{ padding: '14px 16px calc(14px + env(safe-area-inset-bottom))', background: '#1a1a1a' }}>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={e => setZoom(parseFloat(e.target.value))}
          aria-label={t('crop.zoom')}
          style={{ width: '100%', accentColor: '#FF8C42', marginBottom: 14 }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={working}
            style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid #555', background: 'transparent', color: '#fff', fontSize: 14, cursor: 'pointer' }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!pixelCrop || working}
            style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', background: !pixelCrop || working ? '#8a6a55' : '#FF8C42', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            {working ? t('common.processing') : t('eg.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CropModal
