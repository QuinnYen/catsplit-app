// 最小的 Service Worker：只為了讓瀏覽器把網站視為可安裝的 App（加到主畫面），不快取任何東西。
// 所有請求照常走網路，所以不會有「更新後還看到舊版」的問題。之後要做離線快取再擴充，並要處理版本更新。
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
// 不攔截：不呼叫 respondWith，瀏覽器直接走網路。保留 fetch 監聽是為了符合部分瀏覽器對「可安裝」的判斷
self.addEventListener('fetch', () => {})
