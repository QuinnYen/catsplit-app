// 固定在底部導覽列（TabBar）上方的操作區，捲動時一直可見；50px 是導覽列高度
const StickyFooter = ({ children }) => (
  <div style={{ position: 'sticky', bottom: `calc(50px + env(safe-area-inset-bottom, 0px))`, background: '#fff8f4', padding: '8px 0', zIndex: 5 }}>
    {children}
  </div>
)

export default StickyFooter
