// 放在彈出頁裡面（彈出頁開著才會掛載）：手機返回鍵關閉彈出頁，見 hooks/useBackClose.js
import { useBackClose } from '../hooks/useBackClose'

const BackClose = ({ onClose }) => {
  useBackClose(onClose)
  return null
}

export default BackClose
