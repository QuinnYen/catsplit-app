import { useEffect, useState } from 'react'
import { ref, getBlob } from 'firebase/storage'
import { storage } from '../config/firebase'

// 以登入身分下載 Storage 圖片（受 Storage 規則保護），回傳 object URL；載入中或失敗為 null
export const useStorageImage = (path) => {
  const [loaded, setLoaded] = useState({ path: null, url: null })

  useEffect(() => {
    if (!path) return
    let cancelled = false
    let objectUrl
    getBlob(ref(storage, path))
      .then(blob => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setLoaded({ path, url: objectUrl })
      })
      .catch(err => console.error('Failed to load image', err))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])

  return loaded.path === path ? loaded.url : null
}
