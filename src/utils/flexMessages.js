// 記帳明細的 LINE Flex 卡片（新增支出、記錄轉帳共用）：橘色標頭、標題、金額、若干「標籤／值」列，
// 最下面一顆按鈕直接開啟該群組，使用者不用回頭找最早的邀請訊息。
const row = (label, value) => ({
  type: 'box', layout: 'horizontal',
  contents: [
    { type: 'text', text: label, size: 'sm', color: '#b08060', flex: 1 },
    { type: 'text', text: value, size: 'sm', color: '#3d2b1f', align: 'end', wrap: true },
  ],
})

// rows: [[標籤, 值], ...]
export const buildLedgerFlex = ({ altText, headerText, title, amount, rows, openLabel, groupUrl }) => ({
  type: 'flex',
  altText,
  contents: {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '16px',
      backgroundColor: '#FF8C42',
      contents: [{ type: 'text', text: headerText, color: '#ffffff', size: 'sm', weight: 'bold' }],
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px',
      contents: [
        { type: 'text', text: title, weight: 'bold', size: 'lg', color: '#3d2b1f', wrap: true },
        { type: 'text', text: amount, size: 'xxl', weight: 'bold', color: '#FF6B1A' },
        { type: 'separator', margin: 'md' },
        ...rows.map(([label, value], i) => (i === 0 ? { ...row(label, value), margin: 'md' } : row(label, value))),
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '12px',
      contents: [
        { type: 'button', style: 'primary', color: '#FF8C42', height: 'sm', action: { type: 'uri', label: openLabel, uri: groupUrl } },
      ],
    },
  },
})

// 直接指到群組頁（與 shareContent 的 addUrl 同樣不經過 /s/ 與雲端函式）
export const groupLiffUrl = (groupId) => `https://liff.line.me/${import.meta.env.VITE_LIFF_ID}/group/${groupId}`
