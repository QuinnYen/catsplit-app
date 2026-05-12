import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'

const LINE_CHANNEL_ID = '2010062826'
const LINE_CHANNEL_SECRET = defineSecret('LINE_CHANNEL_SECRET')

const ALLOWED_ORIGINS = new Set([
  'https://catsplit-app.web.app',
  'https://catsplit-app.firebaseapp.com',
  'http://localhost:5173',
])

const setCors = (req, res) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin)
    res.set('Vary', 'Origin')
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  res.set('Access-Control-Max-Age', '3600')
}

export const lineLogin = onRequest(
  { secrets: [LINE_CHANNEL_SECRET], cors: false, region: 'asia-east1' },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' })
      return
    }

    const { code, redirectUri } = req.body || {}
    if (!code || !redirectUri) {
      res.status(400).json({ error: 'missing_params' })
      return
    }

    try {
      const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: LINE_CHANNEL_ID,
          client_secret: LINE_CHANNEL_SECRET.value(),
        }),
      })

      if (!tokenRes.ok) {
        const text = await tokenRes.text()
        console.error('LINE token exchange failed', tokenRes.status, text)
        res.status(401).json({ error: 'token_exchange_failed', detail: text })
        return
      }

      const tokenJson = await tokenRes.json()
      const { access_token, id_token } = tokenJson

      // 用 access_token 拿 profile（最穩定，不用解析 JWT）
      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${access_token}` },
      })

      if (!profileRes.ok) {
        const text = await profileRes.text()
        console.error('LINE profile fetch failed', profileRes.status, text)
        res.status(502).json({ error: 'profile_fetch_failed' })
        return
      }

      const profile = await profileRes.json()
      res.json({
        userId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
        idToken: id_token,
      })
    } catch (e) {
      console.error('lineLogin error', e)
      res.status(500).json({ error: 'internal_error' })
    }
  }
)
