// 群組分享內容：先組成與平台無關的資料（buildShareContent），再由各平台的函式排成訊息。
// 新增平台（Messenger、WhatsApp…）只要再寫一個 build*Messages，不用動內容層。
const SITE_ORIGIN = 'https://catsplit-app.web.app'
const FALLBACK_IMAGE = `${SITE_ORIGIN}/apple-touch-icon.png`

// 預覽卡片的語言由雲端函式依 ?hl= 決定（只認 en），不影響 App 內的 ?lang=
export const buildShareContent = (groupId, group, t, lang) => {
  const base = `https://liff.line.me/${import.meta.env.VITE_LIFF_ID}/s/${groupId}${lang === 'en' ? '?hl=en' : ''}`
  const hasCover = typeof group.coverUrl === 'string' && group.coverUrl.startsWith('https://')
  return {
    title: group.name,
    subtitle: t('share.subtitle'),
    enterLabel: t('share.enter'),
    addLabel: t('share.add'),
    imageUrl: hasCover ? group.coverUrl : FALLBACK_IMAGE,
    hasCover,
    enterUrl: base,
    // 記一筆不需要連結預覽，直接指到群組路徑（不經過 /s/ 與雲端函式，也少一次轉址）
    addUrl: `https://liff.line.me/${import.meta.env.VITE_LIFF_ID}/group/${groupId}/add`,
  }
}

// 純文字版：沒有卡片按鈕的平台用
export const buildShareText = (c) => `${c.title} (${c.subtitle})\n${c.enterLabel}: ${c.enterUrl}\n${c.addLabel}: ${c.addUrl}`

// LINE：Flex 卡片（封面、群組名稱、兩個按鈕）。不另外附連結文字，否則 LINE 會再產生一張重複封面的預覽
export const buildLineMessages = (c) => [
  {
    type: 'flex',
    altText: `${c.title} | ${c.subtitle}`,
    contents: {
      type: 'bubble',
      hero: {
        type: 'image',
        url: c.imageUrl,
        size: 'full',
        aspectRatio: '8:5',
        aspectMode: c.hasCover ? 'cover' : 'fit',
        backgroundColor: '#fff8f4',
        action: { type: 'uri', label: c.enterLabel, uri: c.enterUrl },
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
          { type: 'button', style: 'primary', color: '#FF8C42', height: 'sm', action: { type: 'uri', label: c.enterLabel, uri: c.enterUrl } },
          { type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: c.addLabel, uri: c.addUrl } },
        ],
      },
    },
  },
]
