// LINE 標誌：介面和 lucide 圖示同樣用 size 呼叫，可直接放進 Icon 欄位（標誌自帶顏色，忽略 color）
import lineLogo from '../assets/line-logo.webp'

const LineIcon = ({ size = 18, style }) => (
  <img src={lineLogo} alt="" width={size} height={size} style={{ display: 'block', flexShrink: 0, ...style }} />
)

export default LineIcon
