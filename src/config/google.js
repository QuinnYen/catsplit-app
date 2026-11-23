// Google OAuth 用戶端 ID（網頁應用程式）。不是機密，後端（functions/index.js 的 GOOGLE_CLIENT_ID）驗證 ID token 時用同一個值當 audience。
// 在 Google Cloud Console 的「憑證」設定，已授權的 JavaScript 來源要包含正式網域與 http://localhost:5173
export const GOOGLE_CLIENT_ID = '210729139240-84a2bkkvtklu8qkj0fqhrgh9qu8l8goi.apps.googleusercontent.com'

export const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
