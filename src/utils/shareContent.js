// 群組分享內容：先組成與平台無關的資料（buildShareContent），再由各平台的函式排成訊息。
// 新增平台（Messenger、WhatsApp…）只要再寫一個 build*Messages，不用動內容層。
const SITE_ORIGIN = 'https://catsplit-app.web.app'
const FALLBACK_IMAGE = `${SITE_ORIGIN}/apple-touch-icon.png`

export const buildShareContent = (groupId, group) => {
  const base = `https://liff.line.me/${import.meta.env.VITE_LIFF_ID}/s/${groupId}`
  const hasCover = typeof group.coverUrl === 'string' && group.coverUrl.startsWith('https://')
  return {
    title: group.name,
    subtitle: '分帳群組',
    imageUrl: hasCover ? group.coverUrl : FALLBACK_IMAGE,
    hasCover,
    enterUrl: base,
    addUrl: `${base}/add`,
  }
}

// 純文字版：沒有卡片按鈕的平台用
export const buildShareText = (c) => `${c.title}（${c.subtitle}）\n進入群組：${c.enterUrl}\n記一筆：${c.addUrl}`

// LINE：Flex 卡片（封面、群組名稱、兩個按鈕）。不另外附連結文字，否則 LINE 會再產生一張重複封面的預覽
export const buildLineMessages = (c) => [
  {
    type: 'flex',
    altText: `${c.title}｜${c.subtitle}`,
    contents: {
      type: 'bubble',
      hero: {
        type: 'image',
        url: c.imageUrl,
        size: 'full',
        aspectRatio: '8:5',
        aspectMode: c.hasCover ? 'cover' : 'fit',
        backgroundColor: '#fff8f4',
        action: { type: 'uri', label: '進入群組', uri: c.enterUrl },
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        contents: [
          { type: 'text', text: c.title, weight: 'bold', size: 'lg', wrap: true, color: '#3d2b1f' },
          { type: 'text', text: c.subtitle, size: 'sm', color: '#b08060' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', color: '#FF8C42', height: 'sm', action: { type: 'uri', label: '進入群組', uri: c.enterUrl } },
          { type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: '記一筆', uri: c.addUrl } },
        ],
      },
    },
  },
]
