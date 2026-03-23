export async function onRequest(context) {
  const { request, env } = context

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json'
  }

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers })
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
  }

  const SUPABASE_URL = env.SUPABASE_URL
  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
  const ADMIN_EMAILS = (env.ADMIN_EMAILS || '').split(',').map(e => e.trim())

  try {
    // JWTを検証してユーザー情報取得
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SERVICE_KEY
      }
    })
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers })
    }
    const user = await userRes.json()
    if (!user?.id) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers })
    }

    // 管理者チェック
    if (ADMIN_EMAILS.includes(user.email)) {
      return new Response(JSON.stringify({ plan: 'pro', isAdmin: true }), { status: 200, headers })
    }

    // 通常ユーザー: profilesテーブルからplan取得
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=plan&id=eq.${user.id}&limit=1`,
      {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`
        }
      }
    )
    const profiles = await profileRes.json()
    const plan = profiles?.[0]?.plan || 'free'

    return new Response(JSON.stringify({ plan, isAdmin: false }), { status: 200, headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers })
  }
}
