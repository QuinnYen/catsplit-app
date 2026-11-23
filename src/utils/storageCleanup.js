import { ref, deleteObject } from 'firebase/storage'
import { storage } from '../config/firebase'

// 刪除單一檔案（以 Storage 路徑指定）；檔案可能已不存在，失敗一律忽略
export const deleteFileByPath = async (path) => {
  if (!path) return
  try { await deleteObject(ref(storage, path)) } catch { /* 忽略 */ }
}
