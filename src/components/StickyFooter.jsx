// 固定在底部導覽列（TabBar）上方的操作區，捲動時一直可見；導覽列高度讀 index.css 的 --tabbar-h
const StickyFooter = ({ children }) => (
  <div style={{ position: 'sticky', bottom: `calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px))`, background: '#fff8f4', padding: '8px 0', zIndex: 5 }}>
    {children}
  </div>
)

export default StickyFooter
